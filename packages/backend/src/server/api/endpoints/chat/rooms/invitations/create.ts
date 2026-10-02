/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { EntityNotFoundError } from 'typeorm';
import { ApiError } from '@/server/api/error.js';
import { ChatService, ChatRoomFullError, ChatRoomInvitationError } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1day'),
		max: 50,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoomInvitation',
	},

	errors: {
		invalidInvitee: { message: 'This user cannot be invited to the room.', code: 'INVALID_INVITEE', id: 'f7baf19c-e34c-4b4c-b7b8-031c3be41074' },
		roomFull: {
			message: 'The room has reached its 50-member limit, including the owner.',
			code: 'CHAT_ROOM_FULL',
			id: '945d2e56-62e9-4b1c-ad4e-8532c55dcdb9',
		},
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '916f9507-49ba-4e90-b57f-1fd4deaa47a5',
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
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const room = await this.chatService.findMyRoomById(me.id, ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}
			const invitation = await this.chatService.createRoomInvitation(me.id, room.id, ps.userId).catch(error => {
				if (error instanceof ChatRoomInvitationError) throw new ApiError(meta.errors.invalidInvitee);
				if (error instanceof EntityNotFoundError) throw new ApiError(meta.errors.noSuchRoom);
				if (error instanceof ChatRoomFullError) throw new ApiError(meta.errors.roomFull);
				throw error;
			});
			return await this.chatEntityService.packRoomInvitation(invitation, me);
		});
	}
}
