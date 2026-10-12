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
	requireModerator: true,
	kind: 'write:account',
	limit: { duration: 60000, max: 60 },
	errors: {
		invalidFiles: { message: 'Invalid image attachments.', code: 'INVALID_FILES', id: 'ea492093-b4fc-4aca-8d1b-3091807afd1e' },
		contentTooLong: { ...contentTooLongError, id: '174ba773-ef48-47b5-b1a7-7c43d19f9f29' },
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
		response: { type: 'string', nullable: true, maxLength: CONTENT_LIMITS.feedbackText },
		responseFileIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, maxItems: 16, uniqueItems: true },
	},
	required: ['feedbackId'],
	anyOf: [{ required: ['status'] }, { required: ['response'] }, { required: ['responseFileIds'] }],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private feedbackService: FeedbackService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.feedbackService.update(ps.feedbackId, ps, me);
			} catch (error) {
				if (DriveFileLifecycleService.isInvalidImagesError(error)) throw new ApiError(meta.errors.invalidFiles);
				if (error instanceof IdentifiableError && error.id === contentTooLongError.id) throw new ApiError(meta.errors.contentTooLong);
				if (error instanceof FeedbackService.NoSuchFeedbackError) throw new ApiError(meta.errors.noSuchFeedback);
				if (error instanceof FeedbackService.AccessDeniedError) throw new ApiError(meta.errors.accessDenied);
				throw error;
			}
		});
	}
}
