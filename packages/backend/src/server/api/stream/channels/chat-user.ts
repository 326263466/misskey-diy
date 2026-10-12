/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.TRANSIENT })
export class ChatUserChannel extends Channel {
	public readonly chName = 'chatUser';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private static blockedCache = new WeakMap<GlobalEvents['chatUser']['payload'], Promise<boolean>>();
	private otherId: string;
	private stopped = false;
	private readRevision = 0;
	private eventQueue: Promise<void> = Promise.resolve();

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private chatService: ChatService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.otherId !== 'string') return false;
		if (!this.user) return false;

		this.otherId = params.otherId;

		this.subscriber.on(`chatUserStream:${this.user.id}-${this.otherId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['chatUser']['payload']) {
		this.eventQueue = this.eventQueue.then(async () => {
			if (this.stopped || !this.user) return;
			let blocked = ChatUserChannel.blockedCache.get(data);
			if (!blocked) {
				blocked = this.chatService.getConversationNotificationMode(this.user.id, { userId: this.otherId }).then(mode => mode === 'blocked');
				ChatUserChannel.blockedCache.set(data, blocked);
			}
			if (await blocked || this.stopped) return;
			this.send(data.type, data.body);
		}).catch(() => {});
		await this.eventQueue;
	}

	@bindThis
	public onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.otherId && !this.stopped) {
					const revision = ++this.readRevision;
					const id = typeof body?.id === 'string' ? body.id : undefined;
					void this.chatService.readUserChatMessage(this.user!.id, this.otherId, id).then(async () => {
						if (!body?.count || !id || this.stopped || revision !== this.readRevision) return;
						const unread = await this.chatService.getUnreadSnapshot(this.user!.id, 'user', this.otherId, false);
						if (!this.stopped && revision === this.readRevision) this.send('unreadCount', { ...unread, throughId: id });
					}).catch(() => {});
				}
				break;
		}
	}

	@bindThis
	public dispose() {
		this.stopped = true;
		this.subscriber.off(`chatUserStream:${this.user!.id}-${this.otherId}`, this.onEvent);
	}
}
