/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ChatService } from '@/core/ChatService.js';
import { ChatConversationService } from '@/core/ChatConversationService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { chatConversationSchema } from '@/server/api/chat-conversation-schema.js';

export const meta = {
	tags: ['chat'], requireCredential: true, kind: 'read:chat',
	limit: { duration: 60000, max: 120 },
	res: { type: 'array', optional: false, nullable: false, items: chatConversationSchema },
} as const;
export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private chatService: ChatService, private chatConversationService: ChatConversationService) {
		super(meta, paramDef, async (_ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');
			return this.chatConversationService.list(me.id);
		});
	}
}
