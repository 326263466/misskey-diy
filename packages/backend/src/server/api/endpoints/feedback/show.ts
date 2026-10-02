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
		noSuchFeedback: { message: 'No such feedback.', code: 'NO_SUCH_FEEDBACK', id: 'e61a23c5-3671-4f14-bbc0-9b7190ff1600' },
	},
	res: { type: 'object', optional: false, nullable: false, ref: 'Feedback' },
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
				return await this.feedbackService.show(ps.feedbackId, me);
			} catch (error) {
				if (error instanceof FeedbackService.NoSuchFeedbackError) throw new ApiError(meta.errors.noSuchFeedback);
				throw error;
			}
		});
	}
}
