/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService, ChatRoomAccessError, ChatRoomFullError, ChatRoomJoinDeniedError } from '@/core/ChatService.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: 60_000, max: 60 },
	errors: {
		noSuchRoom: { message: 'No such room.', code: 'NO_SUCH_ROOM', id: 'c2b5980a-8d68-4692-9218-2138b209b915' },
		joinDenied: { message: 'This request cannot be approved.', code: 'CHAT_ROOM_JOIN_DENIED', id: '9daa4d35-3259-4e6f-a35a-31e07b1eb574' },
		roomFull: { message: 'The room has reached its 50-member limit, including the owner.', code: 'CHAT_ROOM_FULL', id: '631be5a8-25b5-4ab3-84ff-a48bfb283114' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		requestId: { type: 'string', format: 'misskey:id' },
		approve: { type: 'boolean' },
	},
	required: ['roomId', 'requestId', 'approve'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private chatService: ChatService) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			try {
				await this.chatService.answerRoomJoinRequest(me.id, ps.roomId, ps.requestId, ps.approve);
			} catch (error) {
				if (error instanceof EntityNotFoundError || error instanceof ChatRoomAccessError) throw new ApiError(meta.errors.noSuchRoom);
				if (error instanceof ChatRoomFullError) throw new ApiError(meta.errors.roomFull);
				if (error instanceof ChatRoomJoinDeniedError) throw new ApiError(meta.errors.joinDenied);
				throw error;
			}
		});
	}
}
