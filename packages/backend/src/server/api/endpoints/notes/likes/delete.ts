/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteLikeService } from '@/core/NoteLikeService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	prohibitMoved: true,

	kind: 'write:note-likes',

	limit: {
		duration: ms('1minute'),
		max: 120,
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '3bb8ef8e-0b29-42ba-a997-4d916524fc7d',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'LikeState',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private noteLikeService: NoteLikeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.noteLikeService.setLike(ps.noteId, me, false);
			} catch (error) {
				if (error instanceof IdentifiableError && error.id === 'like-target-unavailable') throw new ApiError(meta.errors.noSuchNote);
				throw error;
			}
		});
	}
}
