/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DB_MAX_IMAGE_COMMENT_LENGTH } from '@/const.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DriveService } from '@/core/DriveService.js';
import { DriveFileLifecycleService } from '@/core/DriveFileLifecycleService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	prohibitMoved: true,

	limit: {
		duration: ms('1hour'),
		max: 120,
	},

	requireFile: true,

	kind: 'write:drive',

	description: 'Upload a new drive file.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'DriveFile',
	},

	errors: {
		invalidFileName: {
			message: 'Invalid file name.',
			code: 'INVALID_FILE_NAME',
			id: 'f449b209-0c60-4e51-84d5-29486263bfd4',
		},

		inappropriate: {
			message: 'Cannot upload the file because it has been determined that it possibly contains inappropriate content.',
			code: 'INAPPROPRIATE',
			id: 'bec5bd69-fba3-43c9-b4fb-2894b66ad5d2',
		},

		noFreeSpace: {
			message: 'Cannot upload the file because you have no free space of drive.',
			code: 'NO_FREE_SPACE',
			id: 'd08dbc37-a6a9-463a-8c47-96c32ab5f064',
		},

		maxFileSizeExceeded: {
			message: 'Cannot upload the file because it exceeds the maximum file size.',
			code: 'MAX_FILE_SIZE_EXCEEDED',
			id: 'b9d8c348-33f0-4673-b9a9-5d4da058977a',
			httpStatusCode: 413,
		},

		unallowedFileType: {
			message: 'Cannot upload the file because it is an unallowed file type.',
			code: 'UNALLOWED_FILE_TYPE',
			id: '4becd248-7f2c-48c4-a9f0-75edc4f9a1ea',
		},
		fileDeleting: {
			message: 'This file is being deleted. Please upload it again.',
			code: 'FILE_DELETING',
			id: '0c4e40e3-48b7-4ec6-8019-6047eb00be9a',
		},
		draftClosed: {
			message: 'This draft has been closed.',
			code: 'DRAFT_CLOSED',
			id: '0c524d08-b18d-4712-ad75-3f6791a3dc7b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		name: { type: 'string', nullable: true, default: null },
		comment: { type: 'string', nullable: true, maxLength: DB_MAX_IMAGE_COMMENT_LENGTH, default: null },
		isSensitive: { type: 'boolean', default: false },
		force: { type: 'boolean', default: false },
		isManaged: { type: 'boolean', default: false, description: 'Automatically recycle this new attachment after its last registered reference is removed and the retention period has elapsed.' },
		draftId: { type: 'string', minLength: 1, maxLength: 100, description: 'Reserve this managed upload for a draft before returning it to the client.' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private logger: Logger;

	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private driveFileEntityService: DriveFileEntityService,
		private driveService: DriveService,
		private loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me, _, file, cleanup, ip, headers) => {
			// Get 'name' parameter
			let name = ps.name ?? file!.name ?? null;
			if (name != null) {
				name = name.trim();
				if (name.length === 0) {
					name = null;
				} else if (name === 'blob') {
					name = null;
				} else if (!this.driveFileEntityService.validateFileName(name)) {
					throw new ApiError(meta.errors.invalidFileName);
				}
			}

			try {
				// Create file
				const driveFile = await this.driveService.addFile({
					user: me,
					path: file!.path,
					name,
					comment: ps.comment,
					folderId: ps.folderId,
					force: ps.force,
					isManaged: ps.isManaged,
					draftId: ps.draftId,
					sensitive: ps.isSensitive,
					requestIp: this.serverSettings.enableIpLogging ? ip : null,
					requestHeaders: this.serverSettings.enableIpLogging ? headers : null,
				});
				return await this.driveFileEntityService.pack(driveFile, { self: true });
			} catch (err) {
				if (err instanceof DriveFileLifecycleService.FileDeletingError) throw new ApiError(meta.errors.fileDeleting);
				if (err instanceof DriveFileLifecycleService.DraftClosedError) throw new ApiError(meta.errors.draftClosed);
				if (err instanceof Error || typeof err === 'string') {
					this.logger.error('File upload failed', { userId: me.id, error: err });
				}
				if (err instanceof IdentifiableError) {
					if (err.id === '282f77bf-5816-4f72-9264-aa14d8261a21') throw new ApiError(meta.errors.inappropriate);
					if (err.id === 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6') throw new ApiError(meta.errors.noFreeSpace);
					if (err.id === 'f9e4e5f3-4df4-40b5-b400-f236945f7073') throw new ApiError(meta.errors.maxFileSizeExceeded);
					if (err.id === 'bd71c601-f9b0-4808-9137-a330647ced9b') throw new ApiError(meta.errors.unallowedFileType);
				}
				throw new ApiError();
			} finally {
				cleanup!();
			}
		});

		this.logger = this.loggerService.getLogger('drive.create');
	}
}
