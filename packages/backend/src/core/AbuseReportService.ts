/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, QueryFailedError } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { MiAbuseUserReport, MiUser } from '@/models/_.js';
import type { AbuseUserReportsRepository, UsersRepository } from '@/models/_.js';
import { AbuseReportSnapshotService } from '@/core/AbuseReportSnapshotService.js';
import { AbuseReportEvidenceService } from '@/core/AbuseReportEvidenceService.js';
import type { AbuseReportTarget } from '@/core/AbuseReportSnapshotService.js';
import type { AbuseReportEvidenceArchive } from '@/models/AbuseUserReport.js';
import { formatAbuseReport, serializeAbuseReport } from '@/misc/abuse-report.js';
import { AbuseReportNotificationService } from '@/core/AbuseReportNotificationService.js';
import { QueueService } from '@/core/QueueService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { IdService } from './IdService.js';

export type AbuseReportRequest = {
	targetUserId: MiAbuseUserReport['targetUserId'];
	reporterId: MiAbuseUserReport['reporterId'];
	comment: string;
	reason: MiAbuseUserReport['reason'];
	target: AbuseReportTarget;
	requestId: string | null;
};

@Injectable()
export class AbuseReportService {
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.abuseUserReportsRepository)
		private abuseUserReportsRepository: AbuseUserReportsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private idService: IdService,
		private abuseReportNotificationService: AbuseReportNotificationService,
		private queueService: QueueService,
		private systemAccountService: SystemAccountService,
		private apRendererService: ApRendererService,
		private moderationLogService: ModerationLogService,
		private abuseReportSnapshotService: AbuseReportSnapshotService,
		private abuseReportEvidenceService: AbuseReportEvidenceService,
		private loggerService: LoggerService,
	) {
	}

	/**
	 * ユーザからの通報をDBに記録し、その内容を下記の手段で管理者各位に通知する.
	 * - 管理者用Redisイベント
	 * - EMail（モデレータ権限所有者ユーザ＋metaテーブルに設定されているメールアドレス）
	 * - SystemWebhook
	 *
	 * @param params 通報内容. もし複数件の通報に対応した時のために、あらかじめ複数件を処理できる前提で考える
	 * @see AbuseReportNotificationService.notify
	 */
	@bindThis
	public async report(params: AbuseReportRequest[]) {
		const archives: AbuseReportEvidenceArchive[] = [];
		const reports = await this.db.transaction('REPEATABLE READ', async manager => {
			const reports: MiAbuseUserReport[] = [];
			for (const param of params) {
				const requestFingerprint = param.requestId == null ? null : this.requestFingerprint(param);
				if (param.requestId != null) {
					const existing = await manager.findOneBy(MiAbuseUserReport, { reporterId: param.reporterId, requestId: param.requestId });
					if (existing != null) {
						if (existing.requestFingerprint !== requestFingerprint) throw new Error('REPORT_REQUEST_CONFLICT');
						continue;
					}
				}
				const user = await manager.findOneByOrFail(MiUser, { id: param.targetUserId });
				const reporter = await manager.findOneByOrFail(MiUser, { id: param.reporterId });
				const snapshot = await this.abuseReportSnapshotService.capture(user, reporter, param.target, manager);
				archives.push(...snapshot.files.map(file => file.archive));
				const id = this.idService.gen();
				await manager.insert(MiAbuseUserReport, {
					id,
					targetUserId: user.id,
					targetUserHost: user.host,
					reporterId: reporter.id,
					reporterHost: reporter.host,
					comment: param.comment,
					reason: param.reason,
					requestId: param.requestId,
					requestFingerprint,
					snapshot,
				});
				reports.push(await manager.findOneByOrFail(MiAbuseUserReport, { id }));
			}
			return reports;
		}).catch(async error => {
			const cleanup = await Promise.allSettled(archives.map(archive => this.abuseReportEvidenceService.delete(archive)));
			for (const result of cleanup) {
				if (result.status === 'rejected') this.loggerService.getLogger('abuse-report').error('Failed to clean uncommitted report evidence', { error: String(result.reason) });
			}
			if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23505' && (error.driverError as { constraint?: string }).constraint === 'IDX_abuse_user_report_reporter_request') {
				if ((await Promise.all(params.map(param => this.hasSubmittedReport(param)))).every(Boolean)) return [];
			}
			throw error;
		});

		if (reports.length === 0) return;
		const notifications = await Promise.allSettled([
			this.abuseReportNotificationService.notifyAdminStream(reports),
			this.abuseReportNotificationService.notifySystemWebhook(reports, 'abuseReport'),
			this.abuseReportNotificationService.notifyMail(reports),
		]);
		for (const result of notifications) {
			if (result.status === 'rejected') this.loggerService.getLogger('abuse-report').error('Failed to notify moderators of a saved report', { reportIds: reports.map(report => report.id), error: String(result.reason) });
		}
	}

	public async hasSubmittedReport(param: AbuseReportRequest): Promise<boolean> {
		if (param.requestId == null) return false;
		const report = await this.abuseUserReportsRepository.findOneBy({ reporterId: param.reporterId, requestId: param.requestId });
		if (report == null) return false;
		if (report.requestFingerprint !== this.requestFingerprint(param)) throw new Error('REPORT_REQUEST_CONFLICT');
		return true;
	}

	private requestFingerprint(param: AbuseReportRequest): string {
		return createHash('sha256').update(JSON.stringify([param.targetUserId, param.target.type, param.target.id ?? null, param.target.reaction ?? null, param.reason, param.comment])).digest('hex');
	}

	/**
	 * 通報を解決し、その内容を下記の手段で管理者各位に通知する.
	 * - SystemWebhook
	 *
	 * @param params 通報内容. もし複数件の通報に対応した時のために、あらかじめ複数件を処理できる前提で考える
	 * @param moderator 通報を処理したユーザ
	 * @see AbuseReportNotificationService.notify
	 */
	@bindThis
	public async resolve(
		params: {
			reportId: string;
			resolvedAs: MiAbuseUserReport['resolvedAs'];
		}[],
		moderator: MiUser,
	) {
		const paramsMap = new Map(params.map(it => [it.reportId, it]));
		const reports = await this.abuseUserReportsRepository.findBy({
			id: In(params.map(it => it.reportId)),
		});
		const resolvedReports: MiAbuseUserReport[] = [];
		let conflictingResolution = false;

		for (const report of reports) {
			const ps = paramsMap.get(report.id);
			if (ps == null) continue;

			const changes = {
				resolved: true,
				assigneeId: moderator.id,
				resolvedAs: ps.resolvedAs,
			};
			const result = await this.abuseUserReportsRepository.update({ id: report.id, resolved: false }, changes);
			if (result.affected !== 1) {
				const current = await this.abuseUserReportsRepository.findOneBy({ id: report.id });
				if (current?.resolvedAs !== ps.resolvedAs) conflictingResolution = true;
				continue;
			}
			const resolvedReport = { ...report, ...changes };
			resolvedReports.push(resolvedReport);

			try {
				await this.moderationLogService.log(moderator, 'resolveAbuseReport', {
					reportId: report.id,
					report: serializeAbuseReport(resolvedReport),
					resolvedAs: ps.resolvedAs,
				});
			} catch (error) {
				this.loggerService.getLogger('abuse-report').error('Failed to log a resolved report', { reportId: report.id, error: String(error) });
			}
		}

		if (resolvedReports.length > 0) {
			try {
				await this.abuseReportNotificationService.notifySystemWebhook(resolvedReports, 'abuseReportResolved');
			} catch (error) {
				this.loggerService.getLogger('abuse-report').error('Failed to notify moderators of resolved reports', { reportIds: resolvedReports.map(report => report.id), error: String(error) });
			}
		}
		if (conflictingResolution) throw new Error('REPORT_ALREADY_RESOLVED');
	}

	@bindThis
	public async forward(
		reportId: MiAbuseUserReport['id'],
		moderator: MiUser,
	) {
		const report = await this.db.transaction('READ COMMITTED', async manager => {
			const report = await manager.findOneOrFail(MiAbuseUserReport, {
				where: { id: reportId },
				lock: { mode: 'pessimistic_write' },
			});
			if (report.forwarded) return null;
			if (report.targetUserHost == null) throw new Error('CANNOT_FORWARD_LOCAL_REPORT');

			const targetUser = await manager.findOneBy(MiUser, { id: report.targetUserId });
			if (targetUser == null || targetUser.host == null || !targetUser.uri || !targetUser.inbox) throw new Error('REPORT_TARGET_UNAVAILABLE');
			const actor = await this.systemAccountService.fetch('actor');
			const flag = this.apRendererService.renderFlag(actor, targetUser.uri, formatAbuseReport(report));
			if (typeof flag.actor !== 'string') throw new Error('The reporting actor URI is invalid.');
			flag.id = `${flag.actor}#reports/${report.id}`;
			const delivery = await this.queueService.deliver(actor, this.apRendererService.addContext(flag), targetUser.inbox, false);
			if (delivery == null) throw new Error('REPORT_FORWARD_FAILED');
			await manager.update(MiAbuseUserReport, report.id, { forwarded: true });
			return { ...report, forwarded: true };
		});

		if (report == null) return;
		try {
			await this.moderationLogService.log(moderator, 'forwardAbuseReport', {
				reportId: report.id,
				report: serializeAbuseReport(report),
			});
		} catch (error) {
			this.loggerService.getLogger('abuse-report').error('Failed to log a forwarded report', { reportId: report.id, error: String(error) });
		}
	}

	@bindThis
	public async update(
		reportId: MiAbuseUserReport['id'],
		params: {
			moderationNote?: MiAbuseUserReport['moderationNote'];
		},
		moderator: MiUser,
	) {
		const report = await this.abuseUserReportsRepository.findOneByOrFail({ id: reportId });

		await this.abuseUserReportsRepository.update(report.id, {
			moderationNote: params.moderationNote,
		});

		if (params.moderationNote != null && report.moderationNote !== params.moderationNote) {
			this.moderationLogService.log(moderator, 'updateAbuseReportNote', {
				reportId: report.id,
				report: serializeAbuseReport(report),
				before: report.moderationNote,
				after: params.moderationNote,
			});
		}
	}
}
