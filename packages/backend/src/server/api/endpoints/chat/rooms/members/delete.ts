/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ChatRoomAccessError, ChatRoomMemberError, ChatService } from '@/core/ChatService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: 60000, max: 30 },
	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '73a67780-ee94-4fd0-b5e4-98acede89387',
		},
		invalidMember: {
			message: 'This member cannot be removed by the current user.',
			code: 'INVALID_CHAT_ROOM_MEMBER',
			id: 'a6e2cf9d-536e-472f-843f-baa644d06120',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roomId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private chatService: ChatService) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			await this.chatService.removeRoomMember(me.id, ps.roomId, ps.userId).catch(error => {
				if (error instanceof ChatRoomAccessError) throw new ApiError(meta.errors.noSuchRoom);
				if (error instanceof ChatRoomMemberError) throw new ApiError(meta.errors.invalidMember);
				throw error;
			});
		});
	}
}
