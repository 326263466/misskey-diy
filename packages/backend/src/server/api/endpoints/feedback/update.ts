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
	requireModerator: true,
	kind: 'write:account',
	limit: { duration: 60000, max: 60 },
	errors: {
		noSuchFeedback: { message: 'No such feedback.', code: 'NO_SUCH_FEEDBACK', id: 'a04428e6-cf0f-427d-bd9a-31dc01fce4fe' },
		accessDenied: { message: 'Access denied.', code: 'ACCESS_DENIED', id: '064cd685-9aaf-4695-bd29-8775d68d0487', kind: 'permission' },
	},
	res: { type: 'object', optional: false, nullable: false, ref: 'Feedback' },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		feedbackId: { type: 'string', format: 'misskey:id' },
		status: { type: 'string', enum: ['open', 'inProgress', 'resolved', 'closed'] },
		response: { type: 'string', nullable: true, maxLength: 10000 },
	},
	required: ['feedbackId'],
	anyOf: [{ required: ['status'] }, { required: ['response'] }],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private feedbackService: FeedbackService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.feedbackService.update(ps.feedbackId, ps, me);
			} catch (error) {
				if (error instanceof FeedbackService.NoSuchFeedbackError) throw new ApiError(meta.errors.noSuchFeedback);
				if (error instanceof FeedbackService.AccessDeniedError) throw new ApiError(meta.errors.accessDenied);
				throw error;
			}
		});
	}
}
