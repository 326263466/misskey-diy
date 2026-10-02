/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getVisitorContentVisibility } from '@/misc/visitor-content.js';
import * as WebSocket from 'ws';
import promiseLimit from 'promise-limit';
import { ContextIdFactory, ModuleRef, REQUEST } from '@nestjs/core';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import { ChannelFollowingService } from '@/core/ChannelFollowingService.js';
import type { GlobalEvents, StreamEventEmitter } from '@/core/GlobalEventService.js';
import { MiFollowing, MiUserProfile } from '@/models/_.js';
import type { MiMeta } from '@/models/_.js';
import { CacheService } from '@/core/CacheService.js';
import { bindThis } from '@/decorators.js';
import { NotificationService } from '@/core/NotificationService.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiUser } from '@/models/User.js';
import { MainChannel } from '@/server/api/stream/channels/main.js';
import { HomeTimelineChannel } from '@/server/api/stream/channels/home-timeline.js';
import { LocalTimelineChannel } from '@/server/api/stream/channels/local-timeline.js';
import { HybridTimelineChannel } from '@/server/api/stream/channels/hybrid-timeline.js';
import { GlobalTimelineChannel } from '@/server/api/stream/channels/global-timeline.js';
import { UserListChannel } from '@/server/api/stream/channels/user-list.js';
import { HashtagChannel } from '@/server/api/stream/channels/hashtag.js';
import { RoleTimelineChannel } from '@/server/api/stream/channels/role-timeline.js';
import { AntennaChannel } from '@/server/api/stream/channels/antenna.js';
import { ChannelChannel } from '@/server/api/stream/channels/channel.js';
import { DriveChannel } from '@/server/api/stream/channels/drive.js';
import { ServerStatsChannel } from '@/server/api/stream/channels/server-stats.js';
import { QueueStatsChannel } from '@/server/api/stream/channels/queue-stats.js';
import { AdminChannel } from '@/server/api/stream/channels/admin.js';
import { ChatUserChannel } from '@/server/api/stream/channels/chat-user.js';
import { ChatRoomChannel } from '@/server/api/stream/channels/chat-room.js';
import { ReversiChannel } from '@/server/api/stream/channels/reversi.js';
import { ReversiGameChannel } from '@/server/api/stream/channels/reversi-game.js';
import type { ChannelRequest } from './channel.js';
import type { ChannelConstructor } from './channel.js';
import type Channel from './channel.js';
import type { EventEmitter } from 'events';

const MAX_CHANNELS_PER_CONNECTION = 32;
const MAX_SUBSCRIBING_NOTES_PER_CONNECTION = 1536;
const MAX_USER_STATS_SUBSCRIPTIONS = 100;
const USER_STATS_BATCH_DELAY = 250;

/**
 * Main stream connection
 */

@Injectable({ scope: Scope.TRANSIENT })
export default class Connection {
	public user?: MiUser;
	public token?: MiAccessToken;
	private wsConnection: WebSocket.WebSocket;
	private messageQueue = promiseLimit<void>(1);
	public subscriber: StreamEventEmitter;
	private channels: Map<string, Channel> = new Map();
	private subscribingNotes: Map<string, number> = new Map();
	private subscribingUsers = new Map<string, number>();
	private pendingUserStats = new Set<string>();
	private userStatsTimer: NodeJS.Timeout | null = null;
	public userProfile: MiUserProfile | null = null;
	public following: Record<string, Pick<MiFollowing, 'withReplies'> | undefined> = {};
	public followingChannels: Set<string> = new Set();
	public mutingChannels: Set<string> = new Set();
	public userIdsWhoMeMuting: Set<string> = new Set();
	public userIdsWhoBlockingMe: Set<string> = new Set();
	public userIdsWhoMeMutingRenotes: Set<string> = new Set();
	public userMutedInstances: Set<string> = new Set();
	private fetchIntervalId: NodeJS.Timeout | null = null;

	constructor(
		private moduleRef: ModuleRef,
		private notificationService: NotificationService,
		private cacheService: CacheService,
		private channelFollowingService: ChannelFollowingService,
		private channelMutingService: ChannelMutingService,
		@Inject(DI.meta)
		private meta: MiMeta,
		@Inject(REQUEST)
		request: ConnectionRequest,
	) {
		if (request.user) this.user = request.user;
		if (request.token) this.token = request.token;
	}

	@bindThis
	public async fetch() {
		if (this.user == null) return;
		const [
			userProfile,
			following,
			followingChannels,
			mutingChannels,
			userIdsWhoMeMuting,
			userIdsWhoBlockingMe,
			userIdsWhoMeMutingRenotes,
		] = await Promise.all([
			this.cacheService.userProfileCache.fetch(this.user.id),
			this.cacheService.userFollowingsCache.fetch(this.user.id),
			this.channelFollowingService.userFollowingChannelsCache.fetch(this.user.id),
			this.channelMutingService.mutingChannelsCache.fetch(this.user.id),
			this.cacheService.userMutingsCache.fetch(this.user.id),
			this.cacheService.userBlockedCache.fetch(this.user.id),
			this.cacheService.renoteMutingsCache.fetch(this.user.id),
		]);
		this.userProfile = userProfile;
		this.following = following;
		this.followingChannels = followingChannels;
		this.mutingChannels = mutingChannels;
		this.userIdsWhoMeMuting = userIdsWhoMeMuting;
		this.userIdsWhoBlockingMe = userIdsWhoBlockingMe;
		this.userIdsWhoMeMutingRenotes = userIdsWhoMeMutingRenotes;
		this.userMutedInstances = new Set(userProfile.mutedInstances);
	}

	@bindThis
	public async init() {
		if (this.user != null) {
			await this.fetch();

			if (!this.fetchIntervalId) {
				this.fetchIntervalId = setInterval(this.fetch, 1000 * 10);
			}
		}
	}

	@bindThis
	public async listen(subscriber: EventEmitter, wsConnection: WebSocket.WebSocket) {
		this.subscriber = subscriber;

		this.wsConnection = wsConnection;
		this.wsConnection.on('message', this.onQueuedWsConnectionMessage);

		this.subscriber.on('broadcast', data => {
			this.onBroadcastMessage(data);
		});
	}

	/**
	 * クライアントからメッセージ受信時
	 */
	@bindThis
	private onQueuedWsConnectionMessage(data: WebSocket.RawData) {
		return this.messageQueue(() => this.onWsConnectionMessage(data));
	}

	@bindThis
	private async onWsConnectionMessage(data: WebSocket.RawData) {
		if (this.wsConnection.readyState !== WebSocket.WebSocket.OPEN) return;

		let obj: JsonObject;

		try {
			obj = JSON.parse(data.toString());
		} catch (_) {
			return;
		}

		const { type, body } = obj;

		switch (type) {
			case 'readNotification': this.onReadNotification(body); break;
			case 'subNote': this.onSubscribeNote(body); break;
			case 's': this.onSubscribeNote(body); break; // alias
			case 'sr': this.onSubscribeNote(body); break;
			case 'unsubNote': this.onUnsubscribeNote(body); break;
			case 'un': this.onUnsubscribeNote(body); break; // alias
			case 'subUser': this.onSubscribeUser(body); break;
			case 'unsubUser': this.onUnsubscribeUser(body); break;
			case 'connect': await this.onChannelConnectRequested(body); break;
			case 'disconnect': this.onChannelDisconnectRequested(body); break;
			case 'channel': this.onChannelMessageRequested(body); break;
			case 'ch': this.onChannelMessageRequested(body); break; // alias
		}
	}

	@bindThis
	private onBroadcastMessage(data: GlobalEvents['broadcast']['payload']) {
		this.sendMessageToWs(data.type, data.body);
	}

	@bindThis
	private onReadNotification(payload: JsonValue | undefined) {
		this.notificationService.readAllNotification(this.user!.id);
	}

	/**
	 * 投稿購読要求時
	 */
	@bindThis
	private onSubscribeNote(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		if (!payload.id || typeof payload.id !== 'string') return;

		const current = this.subscribingNotes.get(payload.id) ?? 0;

		if (current === 0 && this.subscribingNotes.size >= MAX_SUBSCRIBING_NOTES_PER_CONNECTION) {
			// 新規購読 かつ 購読上限に達している場合は、最も古い購読を解除して新規購読を追加する
			const oldestId = this.subscribingNotes.keys().next().value;
			if (oldestId != null) {
				this.subscriber.off(`noteStream:${oldestId}`, this.onNoteStreamMessage);
				this.subscribingNotes.delete(oldestId);
			}
		} else {
			// access 順を更新して LRU を保つ
			this.subscribingNotes.delete(payload.id);
		}

		const updated = current + 1;
		this.subscribingNotes.set(payload.id, updated);

		if (updated === 1) {
			this.subscriber.on(`noteStream:${payload.id}`, this.onNoteStreamMessage);
		}
	}

	/**
	 * 投稿購読解除要求時
	 */
	@bindThis
	private onUnsubscribeNote(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		if (!payload.id || typeof payload.id !== 'string') return;

		const current = this.subscribingNotes.get(payload.id);
		if (current == null) return;
		const updated = current - 1;
		if (updated <= 0) {
			this.subscribingNotes.delete(payload.id);
			this.subscriber.off(`noteStream:${payload.id}`, this.onNoteStreamMessage);
		} else {
			this.subscribingNotes.set(payload.id, updated);
		}
	}

	@bindThis
	private async onNoteStreamMessage(data: GlobalEvents['note']['payload']) {
		// 自分自身ではないかつ
		if (data.body.userId !== this.user?.id) {
			// 公開範囲が指名で自分が含まれてない
			if (data.body.visibility === 'specified' && (this.user == null || !data.body.visibleUserIds.includes(this.user.id))) {
				return;
			}

			// 公開範囲がフォロワーで自分がフォロワーでない
			if (data.body.visibility === 'followers' && !Object.hasOwn(this.following, data.body.userId)) {
				return;
			}
		}

		// TODO: ugcVisibilityForVisitor が local の場合の扱いを NoteEntityService.shouldHideNote と揃える
		if (this.user == null && getVisitorContentVisibility(this.meta) === 'none') return;

		this.sendMessageToWs('noteUpdated', {
			id: data.body.id,
			type: data.type,
			body: data.body.body,
		});
	}

	@bindThis
	private onSubscribeUser(payload: JsonValue | undefined) {
		if (!isJsonObject(payload) || typeof payload.id !== 'string' || payload.id.length === 0 || payload.id.length > 32) return;
		const current = this.subscribingUsers.get(payload.id) ?? 0;
		if (current === 0 && this.subscribingUsers.size >= MAX_USER_STATS_SUBSCRIPTIONS) return;
		this.subscribingUsers.set(payload.id, current + 1);
		if (current === 0) this.subscriber.on(`userStatsStream:${payload.id}`, this.onUserStatsMessage);
	}

	@bindThis
	private onUnsubscribeUser(payload: JsonValue | undefined) {
		if (!isJsonObject(payload) || typeof payload.id !== 'string') return;
		const current = this.subscribingUsers.get(payload.id);
		if (current == null) return;
		if (current > 1) {
			this.subscribingUsers.set(payload.id, current - 1);
			return;
		}
		this.subscribingUsers.delete(payload.id);
		this.pendingUserStats.delete(payload.id);
		this.subscriber.off(`userStatsStream:${payload.id}`, this.onUserStatsMessage);
	}

	@bindThis
	private onUserStatsMessage(data: GlobalEvents['userStats']['payload']) {
		if (!this.subscribingUsers.has(data.id)) return;
		this.pendingUserStats.add(data.id);
		if (this.userStatsTimer != null) return;
		this.userStatsTimer = setTimeout(() => {
			this.userStatsTimer = null;
			const userIds = [...this.pendingUserStats];
			this.pendingUserStats.clear();
			if (userIds.length > 0 && this.wsConnection.readyState === WebSocket.WebSocket.OPEN) {
				this.sendMessageToWs('userStatsUpdated', { userIds });
			}
		}, USER_STATS_BATCH_DELAY);
	}

	/**
	 * チャンネル接続要求時
	 */
	@bindThis
	private async onChannelConnectRequested(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		const { channel, id, params, pong } = payload;
		if (typeof id !== 'string') return;
		if (typeof channel !== 'string') return;
		if (typeof pong !== 'boolean' && typeof pong !== 'undefined' && pong !== null) return;
		if (typeof params !== 'undefined' && !isJsonObject(params)) return;
		await this.connectChannel(id, params, channel, pong ?? undefined);
	}

	/**
	 * チャンネル切断要求時
	 */
	@bindThis
	private onChannelDisconnectRequested(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		const { id } = payload;
		if (typeof id !== 'string') return;
		this.disconnectChannel(id);
	}

	/**
	 * クライアントにメッセージ送信
	 */
	@bindThis
	public sendMessageToWs(type: string, payload: JsonObject) {
		this.wsConnection.send(JSON.stringify({
			type: type,
			body: payload,
		}));
	}

	/**
	 * チャンネルに接続
	 */
	@bindThis
	public async connectChannel(id: string, params: JsonObject | undefined, channel: string, pong = false) {
		if (this.channels.has(id)) {
			this.disconnectChannel(id);
		}

		if (this.channels.size >= MAX_CHANNELS_PER_CONNECTION) {
			return;
		}

		const channelConstructor = this.getChannelConstructor(channel);

		if (channelConstructor.requireCredential && this.user == null) {
			return;
		}

		if (this.token && ((channelConstructor.kind && !this.token.permission.some(p => p === channelConstructor.kind))
			|| (!channelConstructor.kind && channelConstructor.requireCredential))) {
			return;
		}

		// 共有可能チャンネルに接続しようとしていて、かつそのチャンネルに既に接続していたら無意味なので無視
		if (channelConstructor.shouldShare) {
			for (const c of this.channels.values()) {
				if (c.chName === channel) {
					return;
				}
			}
		}

		const contextId = ContextIdFactory.create();
		this.moduleRef.registerRequestByContextId<ChannelRequest>({
			id: id,
			connection: this,
		}, contextId);
		const ch: Channel = await this.moduleRef.create<Channel>(channelConstructor, contextId);
		if (this.wsConnection.readyState !== WebSocket.WebSocket.OPEN) return;

		this.channels.set(ch.id, ch);
		const valid = await ch.init(params ?? {});
		if (typeof valid === 'boolean' && !valid) {
			// 初期化処理の結果、接続拒否されたので切断
			this.disconnectChannel(id);
			return;
		}

		if (pong) {
			this.sendMessageToWs('connected', {
				id: id,
			});
		}
	}

	@bindThis
	public getChannelConstructor(name: string): ChannelConstructor<boolean> {
		switch (name) {
			case 'main': return MainChannel;
			case 'homeTimeline': return HomeTimelineChannel;
			case 'localTimeline': return LocalTimelineChannel;
			case 'hybridTimeline': return HybridTimelineChannel;
			case 'globalTimeline': return GlobalTimelineChannel;
			case 'userList': return UserListChannel;
			case 'hashtag': return HashtagChannel;
			case 'roleTimeline': return RoleTimelineChannel;
			case 'antenna': return AntennaChannel;
			case 'channel': return ChannelChannel;
			case 'drive': return DriveChannel;
			case 'serverStats': return ServerStatsChannel;
			case 'queueStats': return QueueStatsChannel;
			case 'admin': return AdminChannel;
			case 'chatUser': return ChatUserChannel;
			case 'chatRoom': return ChatRoomChannel;
			case 'reversi': return ReversiChannel;
			case 'reversiGame': return ReversiGameChannel;

			default:
				throw new Error(`no such channel: ${name}`);
		}
	}

	/**
	 * チャンネルから切断
	 * @param id チャンネルコネクションID
	 */
	@bindThis
	public disconnectChannel(id: string) {
		const channel = this.channels.get(id);

		if (channel) {
			if (channel.dispose) channel.dispose();
			this.channels.delete(id);
		}
	}

	/**
	 * チャンネルへメッセージ送信要求時
	 * @param data メッセージ
	 */
	@bindThis
	private onChannelMessageRequested(data: JsonValue | undefined) {
		if (!isJsonObject(data)) return;
		if (typeof data.id !== 'string') return;
		if (typeof data.type !== 'string') return;
		if (typeof data.body === 'undefined') return;

		const channel = this.channels.get(data.id);
		if (channel != null && channel.onMessage != null) {
			channel.onMessage(data.type, data.body);
		}
	}

	/**
	 * ストリームが切れたとき
	 */
	@bindThis
	public dispose() {
		if (this.fetchIntervalId) clearInterval(this.fetchIntervalId);
		if (this.userStatsTimer) clearTimeout(this.userStatsTimer);
		this.userStatsTimer = null;
		this.pendingUserStats.clear();
		for (const userId of this.subscribingUsers.keys()) {
			this.subscriber.off(`userStatsStream:${userId}`, this.onUserStatsMessage);
		}
		this.subscribingUsers.clear();
		this.wsConnection?.off('message', this.onQueuedWsConnectionMessage);

		for (const c of this.channels.values()) {
			if (c.dispose) c.dispose();
		}
		this.channels.clear();

		for (const id of this.subscribingNotes.keys()) {
			this.subscriber.off(`noteStream:${id}`, this.onNoteStreamMessage);
		}
		this.subscribingNotes.clear();
	}
}

export interface ConnectionRequest {
	user: MiUser | null | undefined,
	token: MiAccessToken | null | undefined,
}
