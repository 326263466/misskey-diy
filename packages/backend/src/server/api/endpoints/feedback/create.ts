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
	prohibitMoved: true,
	kind: 'write:account',
	limit: { duration: 3600000, max: 10 },
	errors: {
		invalidContent: { message: 'The title and description must not be blank.', code: 'INVALID_CONTENT', id: '69ed06c9-32fa-4c9f-9972-b0e0d9b7999e' },
	},
	res: { type: 'object', optional: false, nullable: false, ref: 'Feedback' },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		title: { type: 'string', minLength: 1, maxLength: 120 },
		description: { type: 'string', minLength: 1, maxLength: 10000 },
		category: { type: 'string', enum: ['bug', 'feature', 'other'] },
	},
	required: ['title', 'description', 'category'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private feedbackService: FeedbackService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.feedbackService.create(ps, me);
			} catch (error) {
				if (error instanceof FeedbackService.InvalidContentError) throw new ApiError(meta.errors.invalidContent);
				throw error;
			}
		});
	}
}
