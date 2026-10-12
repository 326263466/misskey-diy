/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService, ChatRoomFullError, ChatRoomJoinDeniedError } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: 60_000, max: 20 },
	res: { type: 'object', optional: false, nullable: false, ref: 'ChatRoom' },
	errors: {
		noSuchRoom: { message: 'No such room.', code: 'NO_SUCH_ROOM', id: '51c0bcd4-6105-4245-b9d6-294137bb010e' },
		joinDenied: { message: 'This room does not accept join requests.', code: 'CHAT_ROOM_JOIN_DENIED', id: '14c571ec-afbb-475c-9adf-e9ec7a64d13c' },
		roomFull: { message: 'The room has reached its 50-member limit, including the owner.', code: 'CHAT_ROOM_FULL', id: '2ff62d74-11e3-465a-8550-451d4eaa667a' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		requestMessage: { type: 'string', maxLength: 500 },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private chatService: ChatService, private chatEntityService: ChatEntityService) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			try {
				await this.chatService.requestToJoinRoom(me.id, ps.roomId, ps.requestMessage);
				return await this.chatEntityService.packRoom(ps.roomId, me);
			} catch (error) {
				if (error instanceof EntityNotFoundError) throw new ApiError(meta.errors.noSuchRoom);
				if (error instanceof ChatRoomFullError) throw new ApiError(meta.errors.roomFull);
				if (error instanceof ChatRoomJoinDeniedError) throw new ApiError(meta.errors.joinDenied);
				throw error;
			}
		});
	}
}
