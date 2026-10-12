/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ChatService } from '@/core/ChatService.js';
import { ChatConversationService, ChatConversationAccessError } from '@/core/ChatConversationService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { chatConversationSchema } from '@/server/api/chat-conversation-schema.js';

export const meta = {
	tags: ['chat'], requireCredential: true, prohibitMoved: true, kind: 'write:chat',
	limit: { duration: 60000, max: 120 },
	res: chatConversationSchema,
	errors: { noSuchConversation: { message: 'No accessible conversation.', code: 'NO_SUCH_CONVERSATION', id: '368a7c85-fab3-41ac-9635-3fdc43adcf3c' } },
} as const;
const properties = {
	userId: { type: 'string', format: 'misskey:id' }, roomId: { type: 'string', format: 'misskey:id' },
	notificationMode: { type: 'string', enum: ['all', 'silent', 'assistant', 'blocked'] },
	hidden: { type: 'boolean' }, unread: { type: 'boolean' },
} as const;

export const paramDef = {
	type: 'object',
	properties,
	// 分支必须保留完整对象形状，避免 SDK 将仅含 required 的分支生成为 unknown。
	oneOf: [
		{ type: 'object', properties, required: ['userId'], not: { required: ['roomId'] } },
		{ type: 'object', properties, required: ['roomId'], not: { required: ['userId'] } },
	],
	anyOf: [
		{ type: 'object', properties, required: ['notificationMode'] },
		{ type: 'object', properties, required: ['hidden'] },
		{ type: 'object', properties, required: ['unread'] },
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private chatService: ChatService, private chatConversationService: ChatConversationService) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');
			const target = ps.roomId ? { roomId: ps.roomId } : { userId: ps.userId! };
			const result = await this.chatConversationService.update(me.id, target, ps).catch(error => {
				if (error instanceof ChatConversationAccessError) throw new ApiError(meta.errors.noSuchConversation);
				throw error;
			});
			// 屏蔽从当前游标重新起算，解除后不能把屏蔽期间的历史重新计为未读。
			if (ps.unread === false || ps.notificationMode === 'blocked') {
				if (ps.roomId) await this.chatService.readRoomChatMessage(me.id, ps.roomId, undefined, ps.unread === true);
				else await this.chatService.readUserChatMessage(me.id, ps.userId!, undefined, ps.unread === true);
				result.markedUnread = ps.unread === true;
			} else if (ps.unread === true) await this.chatService.publishUnreadState(me.id);
			return result;
		});
	}
}
