/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ChatRoomAccessError, ChatRoomMemberError, ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { chatInteractionApiErrors, toChatInteractionApiError } from '@/server/api/chat-interaction-errors.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: 60000, max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoomMembership',
	},
	errors: {
		invalidSilenceUntil: chatInteractionApiErrors.invalidSilenceUntil,
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '77b023e9-45d7-43e3-a50c-0f661923c6b0',
		},
		invalidMember: {
			message: 'The requested member changes are not allowed.',
			code: 'INVALID_CHAT_ROOM_MEMBER',
			id: '0926168a-fecc-428f-a2de-94a15b7de962',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		role: { type: 'string', enum: ['administrator', 'member'] },
		nickname: { type: 'string', maxLength: 32 },
		isSilenced: { type: 'boolean' },
		silenceUntil: { type: 'string', nullable: true, maxLength: 40 },
	},
	required: ['roomId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			const result = await this.chatService.updateRoomMember(me.id, ps.roomId, ps.userId, {
				role: ps.role, nickname: ps.nickname, isSilenced: ps.isSilenced,
				silenceUntil: ps.silenceUntil === undefined ? undefined : ps.silenceUntil === null ? null : new Date(ps.silenceUntil),
			}).catch(error => {
				if (error instanceof ChatRoomAccessError) throw new ApiError(meta.errors.noSuchRoom);
				if (error instanceof ChatRoomMemberError) throw new ApiError(meta.errors.invalidMember);
				throw toChatInteractionApiError(error) ?? error;
			});
			if (result.membership) return this.chatEntityService.packRoomMembership(result.membership, me, { populateUser: true });
			const room = await this.chatEntityService.packRoom(result.room, me);
			return { id: room.id, createdAt: room.createdAt, roomId: room.id, userId: room.ownerId, user: room.owner, role: 'owner' as const, nickname: room.ownerNickname, isSilenced: false, silenceUntil: null };
		});
	}
}
