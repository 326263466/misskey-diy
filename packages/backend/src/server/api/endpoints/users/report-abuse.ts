/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { RoleService } from '@/core/RoleService.js';
import { AbuseReportService } from '@/core/AbuseReportService.js';
import { abuseReportReasons } from '@/models/AbuseUserReport.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'write:report-abuse',

	description: 'File a report.',
	limit: { duration: 3600000, max: 20 },

	errors: {
		reportRequestConflict: {
			message: 'This report request ID has already been used for different content.',
			code: 'REPORT_REQUEST_CONFLICT',
			id: '29711771-1825-46cf-9165-25cae928319d',
		},
		reportDescriptionRequired: {
			message: 'Please describe the reason for selecting Other.',
			code: 'REPORT_DESCRIPTION_REQUIRED',
			id: '1681bcfe-e84e-43c5-acf8-c01393c5ddfe',
		},
		reportEvidenceUnavailable: {
			message: 'The report evidence could not be archived. Please try again.',
			code: 'REPORT_EVIDENCE_UNAVAILABLE',
			id: 'c85e62e0-aa88-4174-9e74-4e5d4aaeb424',
		},
		invalidReportTarget: {
			message: 'The reported content is unavailable or does not belong to the reported user.',
			code: 'INVALID_REPORT_TARGET',
			id: '7f07a8ba-7951-446b-81ed-8375dde68d29',
		},

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '1acefcb5-0959-43fd-9685-b48305736cb5',
		},

		cannotReportYourself: {
			message: 'Cannot report yourself.',
			code: 'CANNOT_REPORT_YOURSELF',
			id: '1e13149e-b1e8-43cf-902e-c01dbfcb202f',
		},

		cannotReportAdmin: {
			message: 'Cannot report the admin.',
			code: 'CANNOT_REPORT_THE_ADMIN',
			id: '35e166f5-05fb-4f87-a2d5-adb42676d48f',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		requestId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
		userId: { type: 'string', format: 'misskey:id' },
		comment: { type: 'string', maxLength: 2048 },
		reason: { type: 'string', enum: abuseReportReasons },
		reportType: { type: 'string', enum: ['user', 'note', 'boost', 'chat', 'page', 'gallery', 'play'] },
		targetId: { type: 'string', format: 'misskey:id' },
		reaction: { type: 'string', minLength: 1, maxLength: 512 },
	},
	required: ['userId', 'comment', 'reason', 'reportType', 'requestId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private getterService: GetterService,
		private roleService: RoleService,
		private abuseReportService: AbuseReportService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const comment = ps.comment.trim();
			if (ps.reason === 'other' && comment.length === 0) throw new ApiError(meta.errors.reportDescriptionRequired);
			const request = {
				targetUserId: ps.userId,
				reporterId: me.id,
				comment,
				reason: ps.reason,
				target: { type: ps.reportType, id: ps.targetId, reaction: ps.reaction },
				requestId: ps.requestId,
			};
			const handleError = (err: unknown): never => {
				if (err instanceof Error && err.message === 'REPORT_REQUEST_CONFLICT') throw new ApiError(meta.errors.reportRequestConflict);
				if (err instanceof Error && err.message === 'INVALID_REPORT_TARGET') throw new ApiError(meta.errors.invalidReportTarget);
				if (err instanceof Error && err.message === 'REPORT_EVIDENCE_UNAVAILABLE') throw new ApiError(meta.errors.reportEvidenceUnavailable);
				throw err;
			};
			if (await this.abuseReportService.hasSubmittedReport(request).catch(handleError)) return;
			// Lookup user
			const targetUser = await this.getterService.getUser(ps.userId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			if (targetUser.id === me.id) {
				throw new ApiError(meta.errors.cannotReportYourself);
			}

			if (await this.roleService.isAdministrator(targetUser)) {
				throw new ApiError(meta.errors.cannotReportAdmin);
			}

			await this.abuseReportService.report([request]).catch(handleError);
		});
	}
}
