/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService, ChatMessageAccessError, ChatSendDeniedError } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApiError } from '@/server/api/error.js';
import { chatInteractionApiErrors, toChatInteractionApiError } from '@/server/api/chat-interaction-errors.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatMessageLite',
	},

	errors: {
		roomSilenced: chatInteractionApiErrors.roomSilenced,
		messageNotEditable: chatInteractionApiErrors.messageNotEditable,
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: '64f1b251-4338-4232-ad36-ddb90e7fa4ef',
		},

		contentRequired: {
			message: 'Content required. The message cannot be empty.',
			code: 'CONTENT_REQUIRED',
			id: 'a2c7f826-4f3d-41a2-8e3b-5169ab6b196a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		messageId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string', minLength: 0, maxLength: CONTENT_LIMITS.chatMessage, nullable: true },
	},
	required: ['messageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const message = await this.chatService.findMyMessageById(me.id, ps.messageId);
			if (message == null) {
				throw new ApiError(meta.errors.noSuchMessage);
			}
			if (message.isPoke) throw new ApiError(meta.errors.messageNotEditable);

			// 编辑后消息必须仍有内容（文字、文件、红包等，纯空白不算），才能清空文字
			const text = ps.text?.trim() ?? '';
			const hasContent = text !== '' || message.fileId != null || message.redPacketId != null;
			if (!hasContent) {
				throw new ApiError(meta.errors.contentRequired);
			}

			const updated = await this.chatService.editMessage(message, text === '' ? null : text).catch(error => {
				if (error instanceof ChatMessageAccessError || error instanceof ChatSendDeniedError) throw new ApiError(meta.errors.noSuchMessage);
				throw toChatInteractionApiError(error) ?? error;
			});

			return message.toRoomId
				? await this.chatEntityService.packMessageLiteForRoom(updated)
				: await this.chatEntityService.packMessageLiteFor1on1(updated);
		});
	}
}
