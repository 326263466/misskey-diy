/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AbuseUserReportsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AbuseReportService } from '@/core/AbuseReportService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:resolve-abuse-user-report',

	errors: {
		cannotForwardLocalReport: {
			message: 'Reports about local accounts are handled by this server.',
			code: 'CANNOT_FORWARD_LOCAL_REPORT',
			id: '0e45c76e-94d1-4640-af2e-9255a2b5a223',
		},
		reportTargetUnavailable: {
			message: 'The remote account is unavailable. The saved evidence can still be reviewed locally.',
			code: 'REPORT_TARGET_UNAVAILABLE',
			id: 'e15b2a4e-8c6a-4cf1-90c3-3a84e87a7630',
		},
		reportForwardFailed: {
			message: 'The report could not be queued for forwarding. Please try again.',
			code: 'REPORT_FORWARD_FAILED',
			id: 'b6b312a1-48dc-4e24-a434-212c901a9fd6',
			kind: 'server',
			httpStatusCode: 503,
		},
		noSuchAbuseReport: {
			message: 'No such abuse report.',
			code: 'NO_SUCH_ABUSE_REPORT',
			id: '8763e21b-d9bc-40be-acf6-54c1a6986493',
			kind: 'server',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'misskey:id' },
	},
	required: ['reportId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.abuseUserReportsRepository)
		private abuseUserReportsRepository: AbuseUserReportsRepository,
		private abuseReportService: AbuseReportService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const report = await this.abuseUserReportsRepository.findOneBy({ id: ps.reportId });
			if (!report) {
				throw new ApiError(meta.errors.noSuchAbuseReport);
			}

			await this.abuseReportService.forward(report.id, me).catch(err => {
				if (err instanceof Error && err.message === 'CANNOT_FORWARD_LOCAL_REPORT') throw new ApiError(meta.errors.cannotForwardLocalReport);
				if (err instanceof Error && err.message === 'REPORT_TARGET_UNAVAILABLE') throw new ApiError(meta.errors.reportTargetUnavailable);
				if (err instanceof Error && err.message === 'REPORT_FORWARD_FAILED') throw new ApiError(meta.errors.reportForwardFailed);
				throw err;
			});
		});
	}
}
