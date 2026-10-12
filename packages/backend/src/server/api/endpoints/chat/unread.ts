/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: 60 * 1000, max: 120 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			count: { type: 'number', optional: false, nullable: false },
			firstMessageId: { type: 'string', optional: false, nullable: true, format: 'id' },
			firstMentionId: { type: 'string', optional: false, nullable: true, format: 'id' },
			lastMessageId: { type: 'string', optional: false, nullable: true, format: 'id' },
		},
	},
	errors: {
		noSuchUser: { message: 'No such user.', code: 'NO_SUCH_USER', id: 'ac099c8b-e212-41f4-9dab-9d0a1b2335f2' },
		noSuchRoom: { message: 'No such room.', code: 'NO_SUCH_ROOM', id: '61c284bb-5946-4b8e-8fd0-df8e77f4962f' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		roomId: { type: 'string', format: 'misskey:id' },
	},
	oneOf: [
		{ required: ['userId'], not: { required: ['roomId'] } },
		{ required: ['roomId'], not: { required: ['userId'] } },
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private chatService: ChatService, private getterService: GetterService) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');
			if (ps.userId) {
				await this.getterService.getUser(ps.userId).catch(error => {
					if (error.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
					throw error;
				});
				return this.chatService.getUnreadSnapshot(me.id, 'user', ps.userId);
			}
			const room = await this.chatService.findRoomById(ps.roomId!);
			if (!room || !await this.chatService.isRoomMember(room, me.id)) throw new ApiError(meta.errors.noSuchRoom);
			return this.chatService.getUnreadSnapshot(me.id, 'room', room.id);
		});
	}
}
