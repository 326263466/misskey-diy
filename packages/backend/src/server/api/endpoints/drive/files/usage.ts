/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { DriveFileUsageService, driveFileUsageTypes } from '@/core/DriveFileUsageService.js';
import { RoleService } from '@/core/RoleService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['drive'],
	requireCredential: true,
	secure: true,
	kind: 'read:drive',
	limit: { duration: 60_000, max: 30 },
	description: 'List known persistent references to a drive file. Inaccessible sources are counted without exposing their details; coverage is partial.',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			fileId: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
			used: { type: 'boolean', optional: false, nullable: false },
			referenceCoverage: { type: 'string', enum: ['partial'], optional: false, nullable: false },
			registeredReferenceCount: { type: 'integer', optional: false, nullable: false },
			lifecycle: {
				type: 'object', optional: false, nullable: false,
				properties: {
					isManaged: { type: 'boolean', optional: false, nullable: false },
					isPinned: { type: 'boolean', optional: false, nullable: false },
					cleanupAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
					deleting: { type: 'boolean', optional: false, nullable: false },
				},
			},
			references: {
				type: 'array', optional: false, nullable: false,
				items: {
					type: 'object', optional: false, nullable: false,
					properties: {
						type: { type: 'string', enum: driveFileUsageTypes, optional: false, nullable: false },
						sourceId: { type: 'string', optional: false, nullable: false },
						name: { type: 'string', optional: false, nullable: true },
						url: { type: 'string', optional: false, nullable: true },
					},
				},
			},
			hiddenCount: { type: 'integer', optional: false, nullable: false },
			totalCount: { type: 'integer', optional: false, nullable: false },
			hasMore: { type: 'boolean', optional: false, nullable: false },
		},
	},
	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '41765b22-2d90-40e0-9244-98e00f58d1dc',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
		offset: { type: 'integer', minimum: 0, default: 0 },
	},
	required: ['fileId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,
		private driveFileUsageService: DriveFileUsageService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const file = await this.driveFilesRepository.findOneBy({ id: ps.fileId });
			if (file == null || (file.userId !== me.id && !await this.roleService.isModerator(me))) {
				throw new ApiError(meta.errors.noSuchFile);
			}
			return this.driveFileUsageService.getUsage(file, me, ps.limit, ps.offset);
		});
	}
}
