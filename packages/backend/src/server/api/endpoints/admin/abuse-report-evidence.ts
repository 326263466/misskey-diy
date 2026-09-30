/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { AbuseUserReportsRepository } from '@/models/_.js';
import { AbuseReportEvidenceService } from '@/core/AbuseReportEvidenceService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:abuse-user-reports',
	responseType: 'binary',
	limit: { duration: 60 * 1000, max: 120 },
	errors: {
		noSuchEvidence: {
			message: 'No such report evidence.',
			code: 'NO_SUCH_REPORT_EVIDENCE',
			id: 'b0ccb482-36b5-4216-bf3c-deca5e1a46aa',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'misskey:id' },
		fileId: { type: 'string', format: 'misskey:id' },
	},
	required: ['reportId', 'fileId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.abuseUserReportsRepository)
		private abuseUserReportsRepository: AbuseUserReportsRepository,
		private evidenceService: AbuseReportEvidenceService,
	) {
		super(meta, paramDef, async ps => {
			const report = await this.abuseUserReportsRepository.findOneBy({ id: ps.reportId });
			const file = report?.snapshot?.files.find(file => file.id === ps.fileId);
			if (file == null) throw new ApiError(meta.errors.noSuchEvidence);
			return await this.evidenceService.read(file.archive);
		});
	}
}
