/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { contentTooLongError } from '@/misc/content-limits.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { FeedbackService } from '@/core/FeedbackService.js';
import { DriveFileLifecycleService } from '@/core/DriveFileLifecycleService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['feedback'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:account',
	limit: { duration: 3600000, max: 10 },
	errors: {
		contentTooLong: { ...contentTooLongError, id: 'e7b796b3-3e04-47a9-bdcc-49b15b4f520a' },
		invalidContent: { message: 'A title and feedback content are required.', code: 'INVALID_CONTENT', id: '69ed06c9-32fa-4c9f-9972-b0e0d9b7999e' },
		invalidFiles: { message: 'Invalid image attachments.', code: 'INVALID_FILES', id: '97d453af-414a-4d21-9960-4372c5930e5d' },
	},
	res: { type: 'object', optional: false, nullable: false, ref: 'Feedback' },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		title: { type: 'string', minLength: 1, maxLength: CONTENT_LIMITS.feedbackTitle },
		description: { type: 'string', maxLength: CONTENT_LIMITS.feedbackText },
		fileIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, maxItems: 16, uniqueItems: true },
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
				if (DriveFileLifecycleService.isInvalidImagesError(error)) throw new ApiError(meta.errors.invalidFiles);
				if (error instanceof IdentifiableError && error.id === contentTooLongError.id) throw new ApiError(meta.errors.contentTooLong);
				if (error instanceof FeedbackService.InvalidContentError) throw new ApiError(meta.errors.invalidContent);
				throw error;
			}
		});
	}
}
