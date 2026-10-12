/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { REQUEST } from '@nestjs/core';
import type { ChatRoomsRepository } from '@/models/_.js';

@Injectable({ scope: Scope.TRANSIENT })
export class ChatRoomChannel extends Channel {
	public readonly chName = 'chatRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private static recipientCache = new WeakMap<GlobalEvents['chatRoom']['payload'], Promise<{ recipients: Set<string>; blocked: Set<string> }>>();
	private roomId: string;
	private stopped = false;
	private readRevision = 0;
	private eventQueue: Promise<void> = Promise.resolve();

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		private chatService: ChatService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.roomId !== 'string') return false;
		if (!this.user) return false;

		this.roomId = params.roomId;

		// 先订阅并暂停事件，避免初次查权限期间漏掉退群通知。
		let release!: () => void;
		this.eventQueue = new Promise<void>(resolve => { release = resolve; });
		this.subscriber.on(`chatRoomStream:${this.roomId}`, this.onEvent);
		try {
			const room = await this.chatRoomsRepository.findOneBy({ id: this.roomId });
			if (!room || !await this.chatService.hasPermissionToViewRoomTimeline(this.user.id, room)) {
				this.dispose();
				return false;
			}
			return !this.stopped;
		} catch {
			this.dispose();
			return false;
		} finally {
			release();
		}
	}

	@bindThis
	private async onEvent(data: GlobalEvents['chatRoom']['payload']) {
		// 权限检查与后续事件串行，退群校验期间不能先发出新消息。
		this.eventQueue = this.eventQueue.then(async () => {
			if (this.stopped) return;
			// 撤权通知可能晚于新消息到达；每个事件重验，同进程所有连接共享一次查询。
			let delivery = ChatRoomChannel.recipientCache.get(data);
			if (!delivery) {
				delivery = Promise.all([this.chatService.getRoomRecipientIds(this.roomId), this.chatService.getRoomBlockedRecipientIds(this.roomId)]).then(([recipients, blocked]) => ({ recipients, blocked }));
				ChatRoomChannel.recipientCache.set(data, delivery);
			}
			const { recipients, blocked } = await delivery;
			let allowed = this.user != null && recipients.has(this.user.id);
			if (!allowed && this.user) {
				// 保留站点审核员原有的非成员查看权限，不将群管理员等同于站点角色。
				const room = await this.chatRoomsRepository.findOneBy({ id: this.roomId });
				allowed = room != null && await this.chatService.hasPermissionToViewRoomTimeline(this.user.id, room);
			}
			if (this.stopped) return;
			if (!allowed) {
				this.send('accessRevoked', null);
				this.dispose();
				return;
			}
			if (this.user && blocked.has(this.user.id)) return;
			if (!this.stopped) this.send(data.type, data.body);
		}).catch(() => { this.dispose(); });
		await this.eventQueue;
	}

	@bindThis
	public onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.roomId && !this.stopped) {
					const revision = ++this.readRevision;
					const id = typeof body?.id === 'string' ? body.id : undefined;
					void this.chatService.readRoomChatMessage(this.user!.id, this.roomId, id).then(async () => {
						if (!body?.count || !id || this.stopped || revision !== this.readRevision) return;
						const unread = await this.chatService.getUnreadSnapshot(this.user!.id, 'room', this.roomId, false);
						if (!this.stopped && revision === this.readRevision) this.send('unreadCount', { ...unread, throughId: id });
					}).catch(() => {});
				}
				break;
		}
	}

	@bindThis
	public dispose() {
		this.stopped = true;
		this.subscriber.off(`chatRoomStream:${this.roomId}`, this.onEvent);
	}
}
