/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { DriveFileLifecycleService } from '@/core/DriveFileLifecycleService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['drive'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:drive',
	limit: { duration: 60_000, max: 120 },
	description: 'Register attachments used by a draft, or release its references after publishing or discarding it.',
	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'aa784d04-e938-44e5-8b4a-bb6f281a8a6e',
		},
		fileDeleting: {
			message: 'This file is being deleted.',
			code: 'FILE_DELETING',
			id: '1837d341-5cda-4304-a308-d19d9ce86a33',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		draftId: { type: 'string', minLength: 1, maxLength: 100 },
		fileIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, maxItems: 100, default: [] },
		text: { type: 'string', maxLength: 200000, nullable: true, default: null },
		delete: { type: 'boolean', default: false },
	},
	required: ['draftId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveFileLifecycleService: DriveFileLifecycleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.driveFileLifecycleService.saveDraft(me.id, ps.draftId, ps.fileIds ?? [], ps.text ?? null, ps.delete ?? false);
			} catch (error) {
				if (error instanceof DriveFileLifecycleService.NoSuchFileError) throw new ApiError(meta.errors.noSuchFile);
				if (error instanceof DriveFileLifecycleService.FileDeletingError) throw new ApiError(meta.errors.fileDeleting);
				throw error;
			}
		});
	}
}
