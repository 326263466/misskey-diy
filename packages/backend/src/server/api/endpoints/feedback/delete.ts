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
	requireCredential: true,
	kind: 'write:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		noSuchFeedback: { message: 'No such feedback.', code: 'NO_SUCH_FEEDBACK', id: '9708c54c-4414-4f98-a14e-6f854d8c44cb' },
		accessDenied: { message: 'Access denied.', code: 'ACCESS_DENIED', id: '48813d00-2b04-4121-bcb1-66e2351e66bb', kind: 'permission' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		feedbackId: { type: 'string', format: 'misskey:id' },
	},
	required: ['feedbackId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private feedbackService: FeedbackService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.feedbackService.delete(ps.feedbackId, me);
			} catch (error) {
				if (error instanceof FeedbackService.NoSuchFeedbackError) throw new ApiError(meta.errors.noSuchFeedback);
				if (error instanceof FeedbackService.AccessDeniedError) throw new ApiError(meta.errors.accessDenied);
				throw error;
			}
		});
	}
}
