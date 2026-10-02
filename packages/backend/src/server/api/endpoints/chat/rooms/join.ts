/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService, ChatRoomFullError } from '@/core/ChatService.js';
import { EntityNotFoundError } from 'typeorm';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		roomFull: {
			message: 'The room has reached its 50-member limit, including the owner.',
			code: 'CHAT_ROOM_FULL',
			id: 'c1c59967-f106-4771-a9da-c733d42f3154',
		},
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '84416476-5ce8-4a2c-b568-9569f1b10733',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			await this.chatService.joinToRoom(me.id, ps.roomId).catch(error => {
				if (error instanceof EntityNotFoundError) throw new ApiError(meta.errors.noSuchRoom);
				if (error instanceof ChatRoomFullError) throw new ApiError(meta.errors.roomFull);
				throw error;
			});
		});
	}
}
