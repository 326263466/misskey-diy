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
	private roomId: string;
	private stopped = false;
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
			if (data.type === 'membersChanged') {
				const room = await this.chatRoomsRepository.findOneBy({ id: this.roomId });
				if (!room || !this.user || !await this.chatService.hasPermissionToViewRoomTimeline(this.user.id, room)) {
					this.dispose();
					return;
				}
			}
			if (!this.stopped) this.send(data.type, data.body);
		}).catch(() => { this.dispose(); });
		await this.eventQueue;
	}

	@bindThis
	public onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.roomId && !this.stopped) {
					this.chatService.readRoomChatMessage(this.user!.id, this.roomId);
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
