/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { FeedbackService } from '@/core/FeedbackService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['feedback'],
	requireCredential: false,
	kind: 'read:account',
	limit: { duration: 60000, max: 120 },
	errors: {
		signinRequired: { message: 'Sign in to view your feedback.', code: 'CREDENTIAL_REQUIRED', id: '41ed0a69-5f10-4d45-a4d0-ddf84789e701', httpStatusCode: 401 },
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			items: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, ref: 'Feedback' } },
			total: { type: 'integer', optional: false, nullable: false },
			counts: {
				type: 'object', optional: false, nullable: false,
				properties: {
					all: { type: 'integer', optional: false, nullable: false },
					open: { type: 'integer', optional: false, nullable: false },
					inProgress: { type: 'integer', optional: false, nullable: false },
					resolved: { type: 'integer', optional: false, nullable: false },
					closed: { type: 'integer', optional: false, nullable: false },
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
		offset: { type: 'integer', minimum: 0, default: 0 },
		query: { type: 'string', maxLength: 100 },
		category: { type: 'string', enum: ['bug', 'feature', 'other'] },
		status: { type: 'string', enum: ['open', 'inProgress', 'resolved', 'closed'] },
		mine: { type: 'boolean', default: false },
		sort: { type: 'string', enum: ['latest', 'updated'], default: 'latest' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private feedbackService: FeedbackService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.feedbackService.list(ps, me);
			} catch (error) {
				if (error instanceof FeedbackService.SigninRequiredError) throw new ApiError(meta.errors.signinRequired);
				throw error;
			}
		});
	}
}
