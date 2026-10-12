/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ReactionService } from '@/core/ReactionService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['reactions', 'notes'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:reactions',
	limit: { duration: 60_000, max: 300 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { reaction: { type: 'string', optional: false, nullable: false } },
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '033d0620-5bfe-4027-965d-980b0c85a3ea',
		},

		alreadyReacted: {
			message: 'You are already reacting to that note.',
			code: 'ALREADY_REACTED',
			id: '71efcf98-86d6-4e2b-b2ad-9d032369366b',
		},

		reactionLimitExceeded: {
			message: 'The note already has 100 different reactions.',
			code: 'REACTION_LIMIT_EXCEEDED',
			id: '87fd9f05-3d39-41d6-8d17-573b97a7b62c',
		},

		youHaveBeenBlocked: {
			message: 'You cannot react this note because you have been blocked by this user.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			id: '20ef5475-9f38-4e4c-bd33-de6d979498ec',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		reaction: { type: 'string' },
	},
	required: ['noteId', 'reaction'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private getterService: GetterService,
		private reactionService: ReactionService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});
			const reaction = await this.reactionService.create(me, note, ps.reaction).catch(err => {
				if (err.id === 'reaction-types-limit') throw new ApiError(meta.errors.reactionLimitExceeded);
				if (err.id === '51c42bb4-931a-456b-bff7-e5a8a70dd298') throw new ApiError(meta.errors.alreadyReacted);
				if (err.id === 'e70412a4-7197-4726-8e74-f3e0deb92aa7') throw new ApiError(meta.errors.youHaveBeenBlocked);
				if (err.id === '68e9d2d1-48bf-42c2-b90a-b20e09fd3d48') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});
			return { reaction };
		});
	}
}
