/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService, ChatSendDeniedError } from '@/core/ChatService.js';
import { redPacketApiErrors, throwRedPacketApiError } from '@/server/api/red-packet-errors.js';
import { chatInteractionApiErrors, toChatInteractionApiError } from '@/server/api/chat-interaction-errors.js';
import type { DriveFilesRepository, MiUser } from '@/models/_.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1hour'),
		max: 500,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatMessageLiteForRoom',
	},

	errors: {
		...redPacketApiErrors,
		roomSilenced: chatInteractionApiErrors.roomSilenced,
		invalidPoke: chatInteractionApiErrors.invalidPoke,
		noSuchReply: {
			message: 'The original message is unavailable in this conversation.',
			code: 'NO_SUCH_REPLY',
			id: 'd03ec92d-28c7-419b-a83b-ffb49930e83d',
		},
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '8098520d-2da5-4e8f-8ee1-df78b55a4ec6',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'b6accbd3-1d7b-4d9f-bdb7-eb185bac06db',
		},

		contentRequired: {
			message: 'Content required. You need to set text, fileId or redPacketId.',
			code: 'CONTENT_REQUIRED',
			id: '340517b7-6d04-42c0-bac1-37ee804e3594',
		},

		notMemberOfRoom: {
			message: 'You are not a member of this room.',
			code: 'NOT_MEMBER_OF_ROOM',
			id: '20d5a53d-44a5-434d-81ff-c27ceaa319a2',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string', nullable: true, maxLength: CONTENT_LIMITS.chatMessage },
		replyId: { type: 'string', format: 'misskey:id' },
		replyType: { type: 'string', enum: ['reply', 'quote'] },
		fileId: { type: 'string', format: 'misskey:id' },
		redPacketId: { type: 'string', format: 'misskey:id' },
		pokeUserId: { type: 'string', format: 'misskey:id' },
		toRoomId: { type: 'string', format: 'misskey:id' },
	},
	required: ['toRoomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private getterService: GetterService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me, token) => {
			if (ps.redPacketId && token) throw new ApiError(meta.errors.accessDenied);
			await this.chatService.checkChatAvailability(me.id, 'write');

			const room = await this.chatService.findRoomById(ps.toRoomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			let file = null;
			if (ps.fileId != null) {
				file = await this.driveFilesRepository.findOneBy({
					id: ps.fileId,
					userId: me.id,
				});

				if (file == null) {
					throw new ApiError(meta.errors.noSuchFile);
				}
			}

			// テキストが無いかつ添付ファイルも無かったらエラー
			if (ps.text == null && file == null && ps.redPacketId == null && ps.pokeUserId == null) {
				throw new ApiError(meta.errors.contentRequired);
			}

			return await this.chatService.createMessageToRoom(me, room, {
				allowPasswordClaim: token == null,
				text: ps.text,
				replyId: ps.replyId,
				replyType: ps.replyType,
				file: file,
				redPacketId: ps.redPacketId,
				pokeUserId: ps.pokeUserId,
			}).catch(error => {
				const interactionError = toChatInteractionApiError(error);
				if (interactionError) throw interactionError;
				if (error instanceof Error && error.message === 'NO_SUCH_REPLY') throw new ApiError(meta.errors.noSuchReply);
				if (error instanceof ChatSendDeniedError && error.reason === 'notMember') throw new ApiError(meta.errors.notMemberOfRoom);
				throwRedPacketApiError(error);
			});
		});
	}
}
