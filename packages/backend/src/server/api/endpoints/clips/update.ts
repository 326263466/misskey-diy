/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { contentTooLongError, isContentTooLong } from '@/misc/content-limits.js';
import type { ClipsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ClipEntityService } from '@/core/entities/ClipEntityService.js';
import { ClipService } from '@/core/ClipService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['clips'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',

	errors: {
		contentTooLong: { ...contentTooLongError, id: 'd105c870-2ec7-48fc-8fc9-fdaf4918529f' },
		noSuchClip: {
			message: 'No such clip.',
			code: 'NO_SUCH_CLIP',
			id: 'b4d92d70-b216-46fa-9a3f-a8c811699257',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Clip',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		clipId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1 },
		isPublic: { type: 'boolean' },
		description: { type: 'string', nullable: true },
	},
	required: ['clipId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.clipsRepository)
		private clipsRepository: ClipsRepository,

		private clipService: ClipService,

		private clipEntityService: ClipEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const clip = await this.clipsRepository.findOneBy({ id: ps.clipId, userId: me.id });
			if (clip == null) throw new ApiError(meta.errors.noSuchClip);
			if (isContentTooLong(ps.name, CONTENT_LIMITS.collectionName, clip.name) ||
				isContentTooLong(ps.description, CONTENT_LIMITS.clipDescription, clip.description)) {
				throw new ApiError(meta.errors.contentTooLong);
			}
			try {
				await this.clipService.update(me, ps.clipId, ps.name, ps.isPublic, ps.description === '' ? null : ps.description);
			} catch (e) {
				if (e instanceof ClipService.NoSuchClipError) {
					throw new ApiError(meta.errors.noSuchClip);
				}
				throw e;
			}

			return await this.clipEntityService.pack(ps.clipId, me);
		});
	}
}
