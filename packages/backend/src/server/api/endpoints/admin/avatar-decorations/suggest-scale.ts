/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { DownloadService } from '@/core/DownloadService.js';
import { FileInfoService } from '@/core/FileInfoService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { FileServerFileResolver } from '@/server/file/FileServerFileResolver.js';
import { readAvatarDecorationFrames, suggestAvatarDecorationScale } from '@/misc/avatar-decoration-fit.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageAvatarDecorations',
	kind: 'read:admin:avatar-decorations',

	// 需要下载并解码图片，限制频率。
	limit: {
		duration: 1000 * 60,
		max: 30,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			scale: {
				type: 'number',
				optional: false, nullable: true,
			},
		},
	},

	errors: {
		failedToLoadImage: {
			message: 'Failed to load the image.',
			code: 'FAILED_TO_LOAD_IMAGE',
			id: 'aa507268-5136-4835-9cf0-fd415c3a2e36',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string', minLength: 1 },
	},
	required: ['url'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private fileInfoService: FileInfoService,
		private downloadService: DownloadService,
		private internalStorageService: InternalStorageService,
	) {
		super(meta, paramDef, async (ps) => {
			const resolver = new FileServerFileResolver(this.driveFilesRepository, this.fileInfoService, this.downloadService, this.internalStorageService);
			let file: { path: string; cleanup: () => void };
			try {
				// 本站文件直接读存储，避免下载自己时被私有网络限制拦截。
				const key = this.getLocalFileKey(ps.url);
				if (key != null) {
					const resolved = await resolver.resolveFileByAccessKey(key);
					if (resolved.kind === 'stored') file = { path: resolved.path, cleanup: () => {} };
					else if (resolved.kind === 'remote') file = resolved;
					else throw new Error(`file is ${resolved.kind}`);
				} else {
					file = await resolver.downloadAndDetectTypeFromUrl(ps.url);
				}
			} catch {
				throw new ApiError(meta.errors.failedToLoadImage);
			}

			try {
				const { frames, width, height } = await readAvatarDecorationFrames(file.path);
				return { scale: suggestAvatarDecorationScale(frames, width, height) };
			} catch {
				throw new ApiError(meta.errors.failedToLoadImage);
			} finally {
				file.cleanup();
			}
		});
	}

	private getLocalFileKey(url: string): string | null {
		let parsed: URL;
		try {
			parsed = new URL(url, this.config.url);
		} catch {
			return null;
		}
		if (parsed.origin !== new URL(this.config.url).origin) return null;
		return /^\/files\/([^/]+)/.exec(parsed.pathname)?.[1] ?? null;
	}
}
