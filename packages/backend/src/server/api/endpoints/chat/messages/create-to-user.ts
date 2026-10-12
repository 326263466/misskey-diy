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
		ref: 'ChatMessageLiteFor1on1',
	},

	errors: {
		...redPacketApiErrors,
		invalidPoke: chatInteractionApiErrors.invalidPoke,
		noSuchReply: {
			message: 'The original message is unavailable in this conversation.',
			code: 'NO_SUCH_REPLY',
			id: '1da48210-4a1f-4f3b-aa71-40c029b0b69c',
		},
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '11795c64-40ea-4198-b06e-3c873ed9039d',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '4372b8e2-185d-4146-8749-2f68864a3e5f',
		},

		contentRequired: {
			message: 'Content required. You need to set text, fileId or redPacketId.',
			code: 'CONTENT_REQUIRED',
			id: '25587321-b0e6-449c-9239-f8925092942c',
		},

		youHaveBeenBlocked: {
			message: 'You cannot send a message because you have been blocked by this user.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			id: 'c15a5199-7422-4968-941a-2a462c478f7d',
		},

		recipientRejectsChat: {
			message: 'The recipient does not accept chats from you.',
			code: 'RECIPIENT_REJECTS_CHAT',
			id: '6de83adf-6e3f-4896-bf47-9336239aff6b',
		},

		recipientChatUnavailable: {
			message: 'The recipient cannot use chat.',
			code: 'RECIPIENT_CHAT_UNAVAILABLE',
			id: '746166fa-539b-4f88-9b00-6c7ccd3d9321',
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
		toUserId: { type: 'string', format: 'misskey:id' },
	},
	required: ['toUserId'],
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

			const toUser = await this.getterService.getUser(ps.toUserId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			return await this.chatService.createMessageToUser(me, toUser, {
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
				if (error instanceof ChatSendDeniedError) {
					if (error.reason === 'scope') throw new ApiError(meta.errors.recipientRejectsChat);
					if (error.reason === 'unavailable') throw new ApiError(meta.errors.recipientChatUnavailable);
					if (error.reason === 'blocked') throw new ApiError(meta.errors.youHaveBeenBlocked);
				}
				throwRedPacketApiError(error);
			});
		});
	}
}
