/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AbuseUserReportsRepository, DriveFilesRepository, FeedbacksRepository, NotesRepository, PagesRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { MetaService } from '@/core/MetaService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],
	description: 'Local content totals, pending moderation work and non-sensitive dashboard settings.',
	requireCredential: true,
	requireModerator: true,
	secure: true,
	limit: { duration: 60 * 1000, max: 20 },
	errors: {
		invalidTimeZone: {
			message: 'Invalid time zone.',
			code: 'INVALID_TIME_ZONE',
			id: '636b6279-4917-4048-aec2-26eb10b5b324',
		},
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			usersCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
			notesCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
			articlesCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
			filesCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
			today: {
				type: 'object', optional: false, nullable: false,
				properties: {
					usersCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
					notesCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
					articlesCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
					filesCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
				},
			},
			dayStart: { type: 'string', format: 'date-time', optional: false, nullable: false },
			pendingReportsCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
			pendingFeedbackCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
			settings: {
				type: 'object', optional: false, nullable: false,
				properties: {
					federation: { type: 'string', enum: ['all', 'specified', 'none'], optional: false, nullable: false },
					registrationOpen: { type: 'boolean', optional: false, nullable: false },
					emailEnabled: { type: 'boolean', optional: false, nullable: false },
					captchaEnabled: { type: 'boolean', optional: false, nullable: false },
					objectStorageEnabled: { type: 'boolean', optional: false, nullable: false },
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		timeZone: { type: 'string', minLength: 1, maxLength: 100, description: 'IANA time zone used for today\'s counts.' },
	},
	required: ['timeZone'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository) private usersRepository: UsersRepository,
		@Inject(DI.notesRepository) private notesRepository: NotesRepository,
		@Inject(DI.pagesRepository) private pagesRepository: PagesRepository,
		@Inject(DI.driveFilesRepository) private driveFilesRepository: DriveFilesRepository,
		@Inject(DI.abuseUserReportsRepository) private abuseUserReportsRepository: AbuseUserReportsRepository,
		@Inject(DI.feedbacksRepository) private feedbacksRepository: FeedbacksRepository,
		private metaService: MetaService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps) => {
			// PostgreSQL 对纯偏移字符串采用 POSIX 符号规则，只接受命名时区。
			if (/^[+-]/.test(ps.timeZone)) throw new ApiError(meta.errors.invalidTimeZone);
			let timeZone: string;
			try {
				timeZone = new Intl.DateTimeFormat('en', { timeZone: ps.timeZone }).resolvedOptions().timeZone;
			} catch {
				throw new ApiError(meta.errors.invalidTimeZone);
			}
			// 由数据库按浏览器时区计算自然日，夏令时切换日不一定是 24 小时。
			const [day] = await this.usersRepository.query<{ start: Date; end: Date }[]>(
				`SELECT date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE $1) AT TIME ZONE $1 AS start,
				(date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE $1) + interval '1 day') AT TIME ZONE $1 AS end`,
				[timeZone],
			);
			const range = { since: this.idService.getTimeBoundary(day.start.getTime()), until: this.idService.getTimeBoundary(day.end.getTime()) };
			type Totals = { count: string; today: string };
			const users = this.usersRepository.createQueryBuilder('user')
				.select('COUNT(*)', 'count')
				.addSelect('COUNT(*) FILTER (WHERE user.id >= :since AND user.id < :until)', 'today')
				.where('user.host IS NULL AND user.isDeleted = false')
				.setParameters(range);
			const notes = this.notesRepository.createQueryBuilder('note')
				.select('COUNT(*)', 'count')
				.addSelect('COUNT(*) FILTER (WHERE note.id >= :since AND note.id < :until)', 'today')
				.where('note.userHost IS NULL')
				.setParameters(range);
			const files = this.driveFilesRepository.createQueryBuilder('file')
				.select('COUNT(*)', 'count')
				.addSelect('COUNT(*) FILTER (WHERE file.id >= :since AND file.id < :until)', 'today')
				.where('file.userHost IS NULL')
				.setParameters(range);
			// Page 同时保存自定义页面和文章，只汇总有效作者的公开 Markdown 文章。
			const articles = this.pagesRepository.createQueryBuilder('page')
				.innerJoin('page.user', 'user')
				.select('COUNT(*)', 'count')
				.addSelect('COUNT(*) FILTER (WHERE page.id >= :since AND page.id < :until)', 'today')
				.where('page.visibility = :visibility', { visibility: 'public' })
				.andWhere('user.host IS NULL')
				.andWhere('user.isDeleted = false')
				.andWhere('user.isSuspended = false')
				.andWhere('jsonb_array_length(page.content) = 1')
				.andWhere("jsonb_typeof(page.content->0->'text') = 'string'")
				.andWhere('page.content @> :article', { article: JSON.stringify([{ type: 'markdown' }]) })
				.setParameters(range);
			const [userTotals, noteTotals, articleTotals, fileTotals, pendingReportsCount, pendingFeedbackCount, settings] = await Promise.all([
				users.getRawOne<Totals>(),
				notes.getRawOne<Totals>(),
				articles.getRawOne<Totals>(),
				files.getRawOne<Totals>(),
				this.abuseUserReportsRepository.countBy({ resolved: false }),
				this.feedbacksRepository.countBy({ status: In(['open', 'inProgress']) }),
				this.metaService.fetch(true),
			]);
			return {
				usersCount: Number(userTotals!.count),
				notesCount: Number(noteTotals!.count),
				articlesCount: Number(articleTotals!.count),
				filesCount: Number(fileTotals!.count),
				today: {
					usersCount: Number(userTotals!.today),
					notesCount: Number(noteTotals!.today),
					articlesCount: Number(articleTotals!.today),
					filesCount: Number(fileTotals!.today),
				},
				dayStart: day.start.toISOString(),
				pendingReportsCount,
				pendingFeedbackCount,
				settings: {
					federation: settings.federation,
					registrationOpen: !settings.disableRegistration,
					emailEnabled: settings.enableEmail,
					captchaEnabled: settings.enableHcaptcha || settings.enableRecaptcha || settings.enableTurnstile || settings.enableMcaptcha,
					objectStorageEnabled: settings.useObjectStorage,
				},
			};
		});
	}
}
