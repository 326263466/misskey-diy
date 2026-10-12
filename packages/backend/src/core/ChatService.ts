/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { assertContentLength } from '@/misc/content-limits.js';
import * as Redis from 'ioredis';
import * as mfm from 'mfm-js';
import { Brackets, In, IsNull, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { QueueService } from '@/core/QueueService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { bindThis } from '@/decorators.js';
import type { ChatApprovalsRepository, ChatMessagesRepository, ChatRoomInvitationsRepository, ChatRoomMembershipsRepository, ChatRoomsRepository, MiDriveFile, MutingsRepository, UsersRepository } from '@/models/_.js';
import { MiChatMessage } from '@/models/ChatMessage.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiChatRoomMembership } from '@/models/ChatRoomMembership.js';
import { MiUser } from '@/models/User.js';
import { RedPacketService } from '@/core/RedPacketService.js';
import { ChatRedPacketService, type ChatPasswordRedPacketClaim } from '@/core/ChatRedPacketService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { NotificationService } from '@/core/NotificationService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { getUserOnlineStatusAutoReply } from '@/misc/user-online-status.js';
import { ChatConversationService, ChatConversationAccessError } from '@/core/ChatConversationService.js';
import type Logger from '@/logger.js';

export class ChatMessageAccessError extends Error {}
export class ChatRoomAccessError extends Error {}
export class ChatRoomMemberError extends Error {}
export class ChatRoomFullError extends Error {}
export class ChatRoomJoinDeniedError extends Error {}
export class ChatRoomInvitationError extends Error {
	constructor(public readonly reason: 'invalid' | 'privacy' | 'blocked' | 'unavailable' | 'remote' | 'alreadyMember' | 'closed' = 'invalid', public readonly userId?: MiUser['id'], public readonly chatScope?: MiUser['chatScope']) {
		super(`Room invitation rejected: ${reason}`);
	}
}
export class ChatRoomSilencedError extends Error {}
export class ChatPokeError extends Error {}
export class ChatMessageEditError extends Error {}
export class ChatSilenceDurationError extends Error {}
/** 发送方无权发送消息；reason 供 API 层映射为具体错误码。 */
export class ChatSendDeniedError extends Error {
	constructor(public reason: 'scope' | 'unavailable' | 'blocked' | 'notMember', message: string) {
		super(message);
	}
}

const MAX_ROOM_MEMBERS = 50;
const MAX_REACTION_TYPES_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;

// 标记和确认必须原子执行，防止旧页面把同时到达的新消息清成已读。
const markUnreadScript = `
local cursor = redis.call('GET', KEYS[3])
if cursor and ARGV[1] <= cursor then return 0 end
local latest = redis.call('GET', KEYS[1])
if not latest or latest < ARGV[1] then redis.call('SET', KEYS[1], ARGV[1]) end
local first = redis.call('GET', KEYS[2])
if not first or first > ARGV[1] then redis.call('SET', KEYS[2], ARGV[1]) end
redis.call('SADD', KEYS[4], ARGV[2])
return 1
`;
const acknowledgeUnreadScript = `
local latest = redis.call('GET', KEYS[1])
if not latest then return 0 end
local untilId = ARGV[1]
if untilId > latest then untilId = latest end
local cursor = redis.call('GET', KEYS[3])
if not cursor or cursor < untilId then redis.call('SET', KEYS[3], untilId) end
if latest <= untilId then
 redis.call('DEL', KEYS[1], KEYS[2])
 redis.call('SREM', KEYS[4], ARGV[2])
end
return 1
`;

// TODO: ReactionServiceのやつと共通化
function normalizeEmojiString(x: string) {
	const match = emojiRegex.exec(x);
	if (match) {
		// 合字を含む1つの絵文字
		const unicode = match[0];

		// 異体字セレクタ除去
		return unicode.match('\u200d') ? unicode : unicode.replace(/\ufe0f/g, '');
	} else {
		throw new Error('invalid emoji');
	}
}

@Injectable()
export class ChatService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatApprovalsRepository)
		private chatApprovalsRepository: ChatApprovalsRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private userEntityService: UserEntityService,
		private chatEntityService: ChatEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private queueService: QueueService,
		private pushNotificationService: PushNotificationService,
		private notificationService: NotificationService,
		private userBlockingService: UserBlockingService,
		private queryService: QueryService,
		private roleService: RoleService,
		private userFollowingService: UserFollowingService,
		private customEmojiService: CustomEmojiService,
		private moderationLogService: ModerationLogService,
		private loggerService: LoggerService,
		private chatRedPacketService: ChatRedPacketService,
		private chatConversationService: ChatConversationService,
	) {
		this.logger = this.loggerService.getLogger('chat');
	}

	@bindThis
	public async getChatAvailability(userId: MiUser['id']): Promise<{ read: boolean; write: boolean; }> {
		const policies = await this.roleService.getUserPolicies(userId);

		switch (policies.chatAvailability) {
			case 'available':
				return {
					read: true,
					write: true,
				};
			case 'readonly':
				return {
					read: true,
					write: false,
				};
			case 'unavailable':
				return {
					read: false,
					write: false,
				};
			default:
				throw new Error('invalid chat availability (unreachable)');
		}
	}

	/** getChatAvailabilityの糖衣。主にAPI呼び出し時に走らせて、権限的に問題ない場合はそのまま続行する */
	@bindThis
	public async checkChatAvailability(userId: MiUser['id'], permission: 'read' | 'write') {
		const policy = await this.getChatAvailability(userId);
		if (policy[permission] === false) {
			throw new Error('ROLE_PERMISSION_DENIED');
		}
	}

	@bindThis
	public async createMessageToUser(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toUser: MiUser, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		redPacketId?: string | null;
		pokeUserId?: string;
		replyId?: string;
		replyType?: 'reply' | 'quote';
		/** Internal only; never accepted from a public chat endpoint. */
		isAutoReply?: boolean;
		allowPasswordClaim?: boolean;
	}): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		if (fromUser.id === toUser.id) {
			await this.checkChatAvailability(fromUser.id, 'write');
			if (toUser.host !== null || toUser.isSuspended || toUser.isDeleted || toUser.movedToUri) throw new ChatSendDeniedError('unavailable', 'self chat unavailable');
			if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
			this.validatePokeContent(params);
			if (params.pokeUserId && params.pokeUserId !== fromUser.id) throw new ChatPokeError();
			await this.checkReply(params.replyId, fromUser.id, toUser.id, null);
			const message = await this.chatMessagesRepository.insertOne({
				id: this.idService.gen(), fromUserId: fromUser.id, toUserId: toUser.id,
				text: params.text?.trim() || null, fileId: params.file?.id ?? null,
				isPoke: params.pokeUserId != null, pokeUserId: params.pokeUserId ?? null,
				replyId: params.replyId ?? null, replyType: params.replyId ? params.replyType ?? 'reply' : null,
			});
			const packed = await this.chatEntityService.packMessageLiteFor1on1(message);
			await this.restoreConversationForMessage(message);
			this.globalEventService.publishChatUserStream(fromUser.id, toUser.id, 'message', packed);
			await this.publishHistoryUpdate(message);
			return packed;
		}
		this.validatePokeContent(params);
		if (params.pokeUserId) {
			const target = await this.usersRepository.findOneBy({ id: params.pokeUserId });
			if (params.pokeUserId !== toUser.id || !target || target.host !== null || target.isSuspended || target.isDeleted || target.movedToUri) throw new ChatPokeError();
		}
		if (params.redPacketId && (fromUser.host !== null || toUser.host !== null || params.isAutoReply)) throw new RedPacketService.AccessDeniedError();

		const approvals = await this.chatApprovalsRepository.createQueryBuilder('approval')
			.where(new Brackets(qb => { // 自分が相手を許可しているか
				qb.where('approval.userId = :fromUserId', { fromUserId: fromUser.id })
					.andWhere('approval.otherId = :toUserId', { toUserId: toUser.id });
			}))
			.orWhere(new Brackets(qb => { // 相手が自分を許可しているか
				qb.where('approval.userId = :toUserId', { toUserId: toUser.id })
					.andWhere('approval.otherId = :fromUserId', { fromUserId: fromUser.id });
			}))
			.take(2)
			.getMany();

		const otherApprovedMe = approvals.some(approval => approval.userId === toUser.id);
		const iApprovedOther = approvals.some(approval => approval.userId === fromUser.id);

		if (!otherApprovedMe) {
			if (toUser.chatScope === 'none') {
				if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
				throw new ChatSendDeniedError('scope', 'recipient is cannot chat (none)');
			} else if (toUser.chatScope === 'followers') {
				const isFollower = await this.userFollowingService.isFollowing(fromUser.id, toUser.id);
				if (!isFollower) {
					if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
					throw new ChatSendDeniedError('scope', 'recipient is cannot chat (followers)');
				}
			} else if (toUser.chatScope === 'following') {
				const isFollowing = await this.userFollowingService.isFollowing(toUser.id, fromUser.id);
				if (!isFollowing) {
					if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
					throw new ChatSendDeniedError('scope', 'recipient is cannot chat (following)');
				}
			} else if (toUser.chatScope === 'mutual') {
				const isMutual = await this.userFollowingService.isMutual(fromUser.id, toUser.id);
				if (!isMutual) {
					if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
					throw new ChatSendDeniedError('scope', 'recipient is cannot chat (mutual)');
				}
			}
		}

		if (!(await this.getChatAvailability(toUser.id)).write) {
			if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
			throw new ChatSendDeniedError('unavailable', 'recipient is cannot chat (policy)');
		}

		const blocked = await this.userBlockingService.checkBlocked(toUser.id, fromUser.id);
		if (blocked) {
			if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
			throw new ChatSendDeniedError('blocked', 'blocked');
		}

		await this.checkReply(params.replyId, fromUser.id, toUser.id, null);
		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toUserId: toUser.id,
			text: params.text ? params.text.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
			isAutoReply: params.isAutoReply ?? false,
			isPoke: params.pokeUserId != null,
			pokeUserId: params.pokeUserId ?? null,
			replyId: params.replyId ?? null,
			replyType: params.replyId ? params.replyType ?? 'reply' : null,
		} satisfies Partial<MiChatMessage>;

		const saved = params.redPacketId ? await this.insertMessageWithRedPacket(message, params.redPacketId) : { message: await this.chatMessagesRepository.insertOne(message), created: true };
		const inserted = saved.message;
		if (!saved.created) return this.chatEntityService.packMessageLiteFor1on1(inserted);

		// 相手を許可しておく
		if (!iApprovedOther && !params.isAutoReply) {
			await this.chatApprovalsRepository.createQueryBuilder()
				.insert()
				.values({ id: this.idService.gen(), userId: fromUser.id, otherId: toUser.id })
				.orIgnore()
				.execute();
		}

		const packedMessage = await this.chatEntityService.packMessageLiteFor1on1(inserted);
		await this.restoreConversationForMessage(inserted);
		const recipientMode = await this.chatConversationService.mode(toUser.id, { userId: fromUser.id });

		if (this.userEntityService.isLocalUser(toUser) && recipientMode !== 'blocked') {
			await this.markUnread(toUser.id, 'user', fromUser.id, message.id);
		}

		if (this.userEntityService.isLocalUser(fromUser)) {
			// 自分のストリーム
			this.globalEventService.publishChatUserStream(fromUser.id, toUser.id, 'message', packedMessage);
		}

		if (this.userEntityService.isLocalUser(toUser) && recipientMode !== 'blocked') {
			// 相手のストリーム
			this.globalEventService.publishChatUserStream(toUser.id, fromUser.id, 'message', packedMessage);
		}

		await this.publishHistoryUpdate(inserted);

		// 3秒経っても既読にならなかったらイベント発行
		if (this.userEntityService.isLocalUser(toUser) && recipientMode === 'all') {
			this.scheduleNotification(async () => {
				if (await this.chatConversationService.mode(toUser.id, { userId: fromUser.id }) !== 'all') return;
				const marker = await this.redisClient.get(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`);

				if (marker == null) return; // 既読

				const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted, toUser);
				this.globalEventService.publishMainStream(toUser.id, 'newChatMessage', packedMessageForTo);
				const currentRecipient = await this.usersRepository.findOneBy({ id: toUser.id });
				if (currentRecipient && currentRecipient.onlineStatusOverride !== 'doNotDisturb') {
					this.pushNotificationService.pushNotification(toUser.id, 'newChatMessage', packedMessageForTo);
				}
			});
		}

		if (!params.isAutoReply && fromUser.host === null && toUser.host === null && getUserOnlineStatusAutoReply(toUser)) {
			// A failed automatic reply must not make the sender retry an already saved message.
			await this.sendStatusAutoReply(toUser.id, fromUser.id).catch(() => {
				this.logger.warn('Could not send chat status auto reply.');
			});
		}

		const redPacketClaims = params.allowPasswordClaim && !params.isAutoReply && fromUser.host === null && toUser.host === null
			? await this.claimPasswordRedPackets(inserted, fromUser.id)
			: [];
		return redPacketClaims.length > 0 ? { ...packedMessage, redPacketClaims } : packedMessage;
	}

	@bindThis
	private async sendStatusAutoReply(fromUserId: MiUser['id'], toUserId: MiUser['id']): Promise<void> {
		// Re-read the recipient's settings so switching to invisible takes effect immediately.
		const fromUser = await this.usersRepository.findOneBy({ id: fromUserId });
		if (!fromUser || fromUser.host !== null || fromUser.isSuspended || fromUser.isDeleted || fromUser.movedToUri) return;
		const text = getUserOnlineStatusAutoReply(fromUser);
		if (!text) return;

		const toUser = await this.usersRepository.findOneBy({ id: toUserId });
		if (!toUser || toUser.host !== null || toUser.isSuspended || toUser.isDeleted || toUser.movedToUri) return;
		if (!(await this.getChatAvailability(fromUser.id)).write) return;
		if (await this.userBlockingService.checkBlocked(fromUser.id, toUser.id)) return;

		// This reuses the receiving user's scope, role, and block checks without approving new chats.
		await this.createMessageToUser(fromUser, toUser, { text, isAutoReply: true });
	}

	@bindThis
	public async createMessageToRoom(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toRoom: MiChatRoom, params: {
		allowPasswordClaim?: boolean;
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		redPacketId?: string | null;
		pokeUserId?: string;
		replyId?: string;
		replyType?: 'reply' | 'quote';
	}): Promise<Packed<'ChatMessageLiteForRoom'>> {
		this.validatePokeContent(params);
		if (params.redPacketId && (fromUser.host !== null || toRoom.isArchived)) throw new RedPacketService.AccessDeniedError();
		const memberships = await this.getRoomParticipants(toRoom.id);

		if (!memberships.some(member => member.userId === fromUser.id)) {
			if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
			throw new ChatSendDeniedError('notMember', 'you are not a member of the room');
		}

		const membershipsOtherThanMe = memberships.filter(member => member.userId !== fromUser.id && member.notificationMode !== 'blocked');
		await this.checkReply(params.replyId, fromUser.id, null, toRoom.id);

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toRoomId: toRoom.id,
			isPoke: params.pokeUserId != null,
			pokeUserId: params.pokeUserId ?? null,
			replyId: params.replyId ?? null,
			replyType: params.replyId ? params.replyType ?? 'reply' : null,
			text: params.text ? params.text.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
		} satisfies Partial<MiChatMessage>;

		const saved = params.redPacketId ? await this.insertMessageWithRedPacket(message, params.redPacketId) : { message: await this.insertRoomMessage(message, toRoom.id), created: true };
		const inserted = saved.message;
		if (!saved.created) return this.chatEntityService.packMessageLiteForRoom(inserted);

		const packedMessage = await this.chatEntityService.packMessageLiteForRoom(inserted);
		await this.restoreConversationForMessage(inserted);

		await Promise.all(membershipsOtherThanMe.map(membership => this.markUnread(membership.userId, 'room', toRoom.id, message.id)));
		this.globalEventService.publishChatRoomStream(toRoom.id, 'message', packedMessage);
		await this.publishHistoryUpdate(inserted);

		// 消息到达和实际通知时都必须允许提醒，解除静音不能补发静音期间的通知。
		const notificationRecipients = membershipsOtherThanMe.filter(member => member.notificationMode === 'all');
		if (notificationRecipients.length) this.scheduleNotification(async () => {
			// 发送后开启静音或退出群的用户也不应收到延迟通知。
			const currentRecipients = new Set((await this.getRoomParticipants(toRoom.id)).filter(member => member.notificationMode === 'all').map(member => member.userId));
			const redisPipeline = this.redisClient.pipeline();
			for (const membership of notificationRecipients) {
				redisPipeline.get(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`);
			}
			const markers = await redisPipeline.exec();
			if (markers == null) throw new Error('redis error');

			if (markers.every(marker => marker[1] == null)) return;

			const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted);
			const quietUsers = new Set((await this.usersRepository.find({
				where: {
					id: In(notificationRecipients.filter((_, i) => markers[i][1] != null).map(member => member.userId)),
					onlineStatusOverride: 'doNotDisturb',
				},
				select: { id: true },
			})).map(user => user.id));

			for (let i = 0; i < notificationRecipients.length; i++) {
				const marker = markers[i][1];
				if (marker == null || !currentRecipients.has(notificationRecipients[i].userId)) continue;

				this.globalEventService.publishMainStream(notificationRecipients[i].userId, 'newChatMessage', packedMessageForTo);
				if (!quietUsers.has(notificationRecipients[i].userId)) {
					this.pushNotificationService.pushNotification(notificationRecipients[i].userId, 'newChatMessage', packedMessageForTo);
				}
			}
		});

		const redPacketClaims = params.allowPasswordClaim && fromUser.host === null ? await this.claimPasswordRedPackets(inserted, fromUser.id) : [];
		return redPacketClaims.length > 0 ? { ...packedMessage, redPacketClaims } : packedMessage;
	}

	private async claimPasswordRedPackets(message: MiChatMessage, userId: string): Promise<ChatPasswordRedPacketClaim[]> {
		if (!message.text || message.redPacketId != null || message.isAutoReply) return [];
		try {
			return await this.chatRedPacketService.claimPasswordsForMessage(message.id, { id: userId });
		} catch {
			// 领取失败不能让已保存并广播的聊天消息被当作发送失败重试。
			this.logger.warn('Could not claim password red packets for a sent chat message.');
			return [];
		}
	}

	private validatePokeContent(params: { pokeUserId?: string; text?: string | null; file?: MiDriveFile | null; redPacketId?: string | null; replyId?: string; uri?: string | null; isAutoReply?: boolean }): void {
		if (params.pokeUserId && (params.text?.trim() || params.file || params.redPacketId || params.replyId || params.uri || params.isAutoReply)) throw new ChatPokeError();
	}

	private async assertRoomWriteAccess(manager: EntityManager, roomId: string, userId: string, pokeUserId?: string | null): Promise<void> {
		const room = await manager.findOne(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_read' } });
		if (!room || room.isArchived) throw new ChatSendDeniedError('notMember', 'room unavailable');
		if (room.ownerId !== userId) {
			const membership = await manager.findOne(MiChatRoomMembership, { where: { roomId, userId }, lock: { mode: 'pessimistic_read' } });
			if (!membership) throw new ChatSendDeniedError('notMember', 'not a current member');
			if (membership.isSilenced && (membership.silenceUntil == null || membership.silenceUntil.getTime() > Date.now())) throw new ChatRoomSilencedError();
			if (membership.role !== 'administrator' && room.isSilenced && (room.silenceUntil == null || room.silenceUntil.getTime() > Date.now())) throw new ChatRoomSilencedError();
		}
		if (pokeUserId) {
			if (room.ownerId !== pokeUserId && !await manager.findOne(MiChatRoomMembership, { where: { roomId, userId: pokeUserId }, lock: { mode: 'pessimistic_read' } })) throw new ChatPokeError();
			const target = await manager.findOne(MiUser, { where: { id: pokeUserId }, lock: { mode: 'pessimistic_read' } });
			if (!target || target.host !== null || target.isSuspended || target.isDeleted || target.movedToUri) throw new ChatPokeError();
		}
	}

	private async insertRoomMessage(message: Partial<MiChatMessage> & Pick<MiChatMessage, 'id' | 'fromUserId'>, roomId: string): Promise<MiChatMessage> {
		return this.chatMessagesRepository.manager.transaction(async manager => {
			await this.assertRoomWriteAccess(manager, roomId, message.fromUserId, message.pokeUserId);
			await manager.insert(MiChatMessage, message);
			return manager.findOneByOrFail(MiChatMessage, { id: message.id });
		});
	}

	private async checkReply(replyId: string | undefined, fromUserId: string, toUserId: string | null, toRoomId: string | null): Promise<void> {
		if (!replyId) return;
		const reply = await this.chatMessagesRepository.findOneBy({ id: replyId });
		// 引用只能来自当前会话，避免通过消息 ID 泄露其他私聊或群聊内容。
		const sameConversation = reply && (toRoomId ? reply.toRoomId === toRoomId : !reply.toRoomId && (
			(reply.fromUserId === fromUserId && reply.toUserId === toUserId) ||
			(reply.fromUserId === toUserId && reply.toUserId === fromUserId)
		));
		if (!sameConversation || reply?.systemEvent) throw new Error('NO_SUCH_REPLY');
	}

	private async insertMessageWithRedPacket(message: Partial<MiChatMessage> & Pick<MiChatMessage, 'id' | 'fromUserId'>, redPacketId: string): Promise<{ message: MiChatMessage; created: boolean }> {
		if (message.text?.trim() || message.fileId || message.replyId) throw new RedPacketService.InvalidDraftError();
		message = { ...message, text: null };
		if (!(await this.getChatAvailability(message.fromUserId)).write) throw new RedPacketService.AccessDeniedError();
		await this.chatRedPacketService.assertCanReference(redPacketId, message.fromUserId, { toUserId: message.toUserId, toRoomId: message.toRoomId });
		return this.chatMessagesRepository.manager.transaction(async manager => {
			if (message.toRoomId) await this.assertRoomWriteAccess(manager, message.toRoomId, message.fromUserId);
			// Serialize retries of this sender's reference without imposing a global packet binding.
			const sender = await manager.findOne(MiUser, { where: { id: message.fromUserId }, lock: { mode: 'for_no_key_update' } });
			if (!sender || sender.host !== null || sender.isSuspended || sender.isDeleted || sender.movedToUri) throw new RedPacketService.AccessDeniedError();
			const existing = await manager.findOneBy(MiChatMessage, {
				redPacketId, fromUserId: sender.id, toUserId: message.toUserId ?? IsNull(), toRoomId: message.toRoomId ?? IsNull(),
				text: message.text ?? IsNull(), fileId: message.fileId ?? IsNull(),
				replyId: message.replyId ?? IsNull(), replyType: message.replyType ?? IsNull(),
			});
			if (existing) return { message: existing, created: false };
			const inserted = manager.create(MiChatMessage, { ...message, redPacketId });
			await manager.insert(MiChatMessage, inserted);
			return { message: await manager.findOneByOrFail(MiChatMessage, { id: inserted.id }), created: true };
		});
	}

	@bindThis
	public async readUserChatMessage(
		readerId: MiUser['id'],
		senderId: MiUser['id'],
		untilId?: string | null,
		preserveManualUnread = false,
	): Promise<void> {
		await this.acknowledgeUnread(readerId, 'user', senderId, untilId);
		if (!preserveManualUnread) await this.chatConversationService.clearMarked(readerId, { userId: senderId });
		await this.publishUnreadState(readerId);
	}

	@bindThis
	public async readRoomChatMessage(
		readerId: MiUser['id'],
		roomId: MiChatRoom['id'],
		untilId?: string | null,
		preserveManualUnread = false,
	): Promise<void> {
		await this.acknowledgeUnread(readerId, 'room', roomId, untilId);
		if (!preserveManualUnread) await this.chatConversationService.clearMarked(readerId, { roomId });
		await this.publishUnreadState(readerId);
	}

	public async publishUnreadState(userId: string): Promise<void> {
		this.globalEventService.publishMainStream(userId, 'chatReadState', { hasUnreadChatMessages: await this.hasUnreadMessages(userId) });
	}

	public async clearManualUnread(userId: string, target: { userId?: string; roomId?: string }): Promise<void> {
		if (await this.chatConversationService.clearMarked(userId, target)) await this.publishUnreadState(userId);
	}

	private unreadKeys(readerId: string, type: 'user' | 'room', otherId: string): string[] {
		const suffix = `${readerId}:${otherId}`;
		return [
			`new${type === 'user' ? 'User' : 'Room'}ChatMessageExists:${suffix}`,
			`firstUnreadChatMessage:${type}:${suffix}`,
			`readChatMessageUntil:${type}:${suffix}`,
			`newChatMessagesExists:${readerId}`,
		];
	}

	private async markUnread(readerId: string, type: 'user' | 'room', otherId: string, messageId: string): Promise<void> {
		const keys = this.unreadKeys(readerId, type, otherId);
		await this.redisClient.eval(markUnreadScript, keys.length, ...keys, messageId, `${type}:${otherId}`).then(marked => {
			if (marked === 1) this.globalEventService.publishMainStream(readerId, 'chatReadState', { hasUnreadChatMessages: true });
		}).catch(() => {
			// 消息已经保存，未读缓存异常不能使客户端重发同一条消息。
			this.logger.warn('Could not mark a saved chat message as unread.');
		});
	}

	public async getUnreadLastMessageId(readerId: string, type: 'user' | 'room', otherId: string): Promise<string | null> {
		return this.redisClient.get(this.unreadKeys(readerId, type, otherId)[0]);
	}

	private async acknowledgeUnread(readerId: string, type: 'user' | 'room', otherId: string, untilId?: string | null): Promise<void> {
		const keys = this.unreadKeys(readerId, type, otherId);
		const snapshotId = untilId === undefined ? await this.redisClient.get(keys[0]) : untilId;
		if (!snapshotId) return;
		await this.redisClient.eval(acknowledgeUnreadScript, keys.length, ...keys, snapshotId, `${type}:${otherId}`);
	}

	@bindThis
	public async getUnreadSnapshot(readerId: string, type: 'user' | 'room', otherId: string, includeMentions = true): Promise<{ count: number; firstMessageId: string | null; firstMentionId: string | null; lastMessageId: string | null }> {
		const [latest, first, cursor] = await this.redisClient.mget(...this.unreadKeys(readerId, type, otherId).slice(0, 3));
		const empty = { count: 0, firstMessageId: null, firstMentionId: null, lastMessageId: latest };
		if (!latest) return empty;
		const query = this.chatMessagesRepository.createQueryBuilder('message')
			.where('message.id <= :latest', { latest })
			.andWhere('message.fromUserId != :readerId', { readerId });
		if (cursor) query.andWhere('message.id > :cursor', { cursor });
		if (first || !cursor) query.andWhere('message.id >= :first', { first: first ?? latest });
		if (type === 'room') query.andWhere('message.toRoomId = :otherId', { otherId });
		else query.andWhere('message.toUserId = :readerId AND message.fromUserId = :otherId', { readerId, otherId });
		const result = await query.clone().select('COUNT(*)', 'count')
			.addSelect('MIN(message.id)', 'firstMessageId')
			.getRawOne<{ count: string; firstMessageId: string | null }>();
		const snapshot = { count: Number(result?.count ?? 0), firstMessageId: result?.firstMessageId ?? null, firstMentionId: null, lastMessageId: latest };
		// 滚动阅读只同步剩余数量，不反复解析历史消息中的提及。
		if (!includeMentions || snapshot.count === 0) return snapshot;
		const reader = await this.usersRepository.findOneBy({ id: readerId });
		if (!reader) return empty;
		// 与前端使用同一 MFM 语义，完整本地提及有效，代码块和远站同名无效。
		const mentionQuery = query.clone().select(['message.id', 'message.text'])
			.andWhere('message.text ILIKE :mention', { mention: `%@${sqlLikeEscape(reader.username)}%` })
			.orderBy('message.id', 'ASC').take(100);
		let firstMentionId: string | null = null;
		let afterId: string | null = null;
		while (!firstMentionId) {
			const batchQuery = mentionQuery.clone();
			if (afterId) batchQuery.andWhere('message.id > :afterId', { afterId });
			const candidates = await batchQuery.getMany();
			for (const candidate of candidates) {
				const mentions = mfm.extract(mfm.parse(candidate.text ?? ''), node => node.type === 'mention') as mfm.MfmMention[];
				if (mentions.some(node => node.props.username.toLowerCase() === reader.username.toLowerCase() && (node.props.host == null || node.props.host.toLowerCase() === this.config.hostname.toLowerCase()))) {
					firstMentionId = candidate.id;
					break;
				}
			}
			if (candidates.length < 100) break;
			afterId = candidates.at(-1)!.id;
		}
		return { count: Number(result?.count ?? 0), firstMessageId: result?.firstMessageId ?? null, firstMentionId, lastMessageId: latest };
	}

	@bindThis
	public async readAllChatMessages(
		readerId: MiUser['id'],
	): Promise<void> {
		const conversations = await this.redisClient.smembers(`newChatMessagesExists:${readerId}`);
		await Promise.all(conversations.map(async conversation => {
			const [type, otherId] = conversation.split(':');
			if (type === 'user' || type === 'room') await this.acknowledgeUnread(readerId, type, otherId);
		}));
		await this.chatConversationService.clearMarked(readerId);
		await this.publishUnreadState(readerId);
	}

	@bindThis
	public findMessageById(messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId });
	}

	@bindThis
	public findMyMessageById(userId: MiUser['id'], messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId, fromUserId: userId });
	}

	@bindThis
	public async hasPermissionToViewRoomTimeline(meId: MiUser['id'], room: MiChatRoom) {
		if (await this.isRoomMember(room, meId)) {
			return true;
		} else {
			const iAmModerator = await this.roleService.isModerator({ id: meId });
			if (iAmModerator) {
				return true;
			}

			return false;
		}
	}

	@bindThis
	public async deleteMessage(message: MiChatMessage) {
		await this.chatMessagesRepository.manager.transaction(async manager => {
			if (message.toRoomId) await manager.findOne(MiChatRoom, { where: { id: message.toRoomId }, lock: { mode: 'pessimistic_read' } });
			const current = await manager.findOne(MiChatMessage, { where: { id: message.id }, lock: { mode: 'pessimistic_write' } });
			if (!current) return;
			await manager.delete(MiChatMessage, current.id);
		});

		if (message.toUserId) {
			const [fromUser, toUser] = await Promise.all([
				this.usersRepository.findOneByOrFail({ id: message.fromUserId }),
				this.usersRepository.findOneByOrFail({ id: message.toUserId }),
			]);

			if (this.userEntityService.isLocalUser(fromUser)) this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId, 'deleted', message.id);
			if (message.toUserId !== message.fromUserId && this.userEntityService.isLocalUser(toUser)) this.globalEventService.publishChatUserStream(message.toUserId, message.fromUserId, 'deleted', message.id);

			if (this.userEntityService.isLocalUser(fromUser) && this.userEntityService.isRemoteUser(toUser)) {
				//const activity = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${message.id}`), fromUser));
				//this.queueService.deliver(fromUser, activity, toUser.inbox);
			}
		} else if (message.toRoomId) {
			this.globalEventService.publishChatRoomStream(message.toRoomId, 'deleted', message.id);
		}
		await this.publishHistoryUpdate(message, true);
	}

	@bindThis
	public async editMessage(message: MiChatMessage, text: string | null): Promise<MiChatMessage> {
		const editedAt = new Date();
		const updated = await this.chatMessagesRepository.manager.transaction(async manager => {
			if (message.toRoomId) await this.assertRoomWriteAccess(manager, message.toRoomId, message.fromUserId);
			const current = await manager.findOne(MiChatMessage, { where: { id: message.id, fromUserId: message.fromUserId }, lock: { mode: 'pessimistic_write' } });
			if (!current) throw new ChatMessageAccessError();
			if (current.isPoke || current.systemEvent || current.redPacketId) throw new ChatMessageEditError();
			await manager.update(MiChatMessage, current.id, { text, editedAt });
			return { ...current, text, editedAt };
		});

		if (message.toUserId) {
			const packed = await this.chatEntityService.packMessageLiteFor1on1(updated);
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId, 'edited', packed);
			if (message.toUserId !== message.fromUserId) this.globalEventService.publishChatUserStream(message.toUserId, message.fromUserId, 'edited', packed);
		} else if (message.toRoomId) {
			const packed = await this.chatEntityService.packMessageLiteForRoom(updated);
			this.globalEventService.publishChatRoomStream(message.toRoomId, 'edited', packed);
		}

		await this.publishHistoryUpdate(updated);
		return updated;
	}

	@bindThis
	public async userTimeline(meId: MiUser['id'], otherId: MiUser['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
			.setParameter('meId', meId)
			.setParameter('otherId', otherId);

		const messages = await query.take(limit).getMany();

		return messages;
	}

	@bindThis
	public async roomTimeline(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.andWhere('message.toRoomId = :roomId', { roomId })
			.leftJoinAndSelect('message.file', 'file')
			.leftJoinAndSelect('message.fromUser', 'fromUser');

		const messages = await query.take(limit).getMany();

		return messages;
	}

	@bindThis
	public async userHistory(meId: MiUser['id'], limit: number, offset = 0, otherId?: MiUser['id']): Promise<MiChatMessage[]> {
		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('muting.muteeId')
			.where('muting.muterId = :muterId', { muterId: meId });
		const latestMessages = this.chatMessagesRepository.createQueryBuilder('latestMessage')
			.select('MAX(latestMessage.id)')
			.where('(latestMessage.fromUserId = :meId OR latestMessage.toUserId = :meId)', { meId })
			.andWhere('latestMessage.toRoomId IS NULL')
			.andWhere('latestMessage.toUserId IS NOT NULL')
			.andWhere(`latestMessage.fromUserId NOT IN (${mutingQuery.getQuery()})`)
			.andWhere(`latestMessage.toUserId NOT IN (${mutingQuery.getQuery()})`)
			.setParameters(mutingQuery.getParameters())
			.groupBy('CASE WHEN latestMessage.fromUserId = :meId THEN latestMessage.toUserId ELSE latestMessage.fromUserId END')
			.orderBy('MAX(latestMessage.id)', 'DESC')
			.limit(limit)
			.offset(offset);
		if (otherId) latestMessages.andWhere(otherId === meId
			? '(latestMessage.fromUserId = :otherId AND latestMessage.toUserId = :otherId)'
			: '(latestMessage.fromUserId = :otherId OR latestMessage.toUserId = :otherId)', { otherId });

		return this.chatMessagesRepository.createQueryBuilder('message')
			.where(`message.id IN (${latestMessages.getQuery()})`)
			.setParameters(latestMessages.getParameters())
			.orderBy('message.id', 'DESC')
			.getMany();
	}

	@bindThis
	public async roomHistory(meId: MiUser['id'], limit: number, offset = 0, roomId?: MiChatRoom['id']): Promise<MiChatMessage[]> {
		const memberships = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
			.select('membership.roomId')
			.where('membership.userId = :meId', { meId });
		const ownedRooms = this.chatRoomsRepository.createQueryBuilder('room')
			.select('room.id')
			.where('room.ownerId = :meId', { meId });
		const latestMessages = this.chatMessagesRepository.createQueryBuilder('latestMessage')
			.select('MAX(latestMessage.id)')
			.where(`(latestMessage.toRoomId IN (${memberships.getQuery()}) OR latestMessage.toRoomId IN (${ownedRooms.getQuery()}))`, { meId })
			.groupBy('latestMessage.toRoomId')
			.orderBy('MAX(latestMessage.id)', 'DESC')
			.limit(limit)
			.offset(offset);
		if (roomId) latestMessages.andWhere('latestMessage.toRoomId = :roomId', { roomId });

		return this.chatMessagesRepository.createQueryBuilder('message')
			.where(`message.id IN (${latestMessages.getQuery()})`)
			.setParameters(latestMessages.getParameters())
			.orderBy('message.id', 'DESC')
			.getMany();
	}

	@bindThis
	public async getUserReadStateMap(userId: MiUser['id'], otherIds: MiUser['id'][]) {
		const readStateMap: Record<MiUser['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const otherId of otherIds) {
			redisPipeline.get(`newUserChatMessageExists:${userId}:${otherId}`);
		}

		const [markers, marked] = await Promise.all([redisPipeline.exec(), this.chatConversationService.marked(userId, 'user', otherIds)]);
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < otherIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[otherIds[i]] = marker == null && !marked.has(otherIds[i]);
		}

		return readStateMap;
	}

	@bindThis
	public async getRoomReadStateMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]) {
		const readStateMap: Record<MiChatRoom['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const roomId of roomIds) {
			redisPipeline.get(`newRoomChatMessageExists:${userId}:${roomId}`);
		}

		const [markers, marked] = await Promise.all([redisPipeline.exec(), this.chatConversationService.marked(userId, 'room', roomIds)]);
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < roomIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[roomIds[i]] = marker == null && !marked.has(roomIds[i]);
		}

		return readStateMap;
	}

	@bindThis
	public async hasUnreadMessages(userId: MiUser['id']) {
		const card = await this.redisClient.scard(`newChatMessagesExists:${userId}`);
		return card > 0 || await this.chatConversationService.hasMarked(userId);
	}

	@bindThis
	public async createRoom(owner: MiUser, params: Partial<{
		name: string;
		description: string;
		joinPolicy: MiChatRoom['joinPolicy'];
		avatarId: MiChatRoom['avatarId'];
		initialUserIds: MiUser['id'][];
	}>) {
		const ids = params.initialUserIds ?? [];
		assertContentLength(params.name, CONTENT_LIMITS.chatRoomName);
		assertContentLength(params.description, CONTENT_LIMITS.chatRoomDescription);
		if (ids.length && (ids.length < 2 || ids.length >= MAX_ROOM_MEMBERS || new Set(ids).size !== ids.length || ids.includes(owner.id))) throw new ChatRoomInvitationError();
		const result = await this.chatRoomsRepository.manager.transaction(async manager => {
			const users = ids.length ? await manager.find(MiUser, { where: { id: In(ids) }, lock: { mode: 'pessimistic_read' } }) : [];
			if (users.length !== ids.length) throw new ChatRoomInvitationError('unavailable', ids.find(id => !users.some(user => user.id === id)));
			for (const invitee of users) await this.assertRoomInvitee(owner.id, invitee);
			const room = manager.create(MiChatRoom, {
				id: this.idService.gen(), name: params.name?.trim() || `${Array.from(owner.name || owner.username).slice(0, CONTENT_LIMITS.chatRoomName - 3).join('')}的群组`,
				description: params.description ?? '', joinPolicy: params.joinPolicy ?? 'public',
				avatarId: params.avatarId ?? null, ownerId: owner.id,
			});
			await manager.insert(MiChatRoom, room);
			if (ids.length) await manager.insert(MiChatRoomMembership, ids.map(userId => ({ id: this.idService.gen(), roomId: room.id, userId })));
			const message = ids.length ? await this.insertRoomJoinMessage(manager, room.id, owner.id, ids, true) : null;
			return { room: await manager.findOneByOrFail(MiChatRoom, { id: room.id }), message };
		});
		if (result.message) await this.publishRoomSystemMessage(result.message);
		return result.room;
	}

	private async assertRoomInvitee(inviterId: MiUser['id'], invitee: MiUser): Promise<void> {
		if (invitee.host !== null) throw new ChatRoomInvitationError('remote', invitee.id);
		if (invitee.isSuspended || invitee.isDeleted || invitee.movedToUri || !(await this.getChatAvailability(invitee.id)).write) throw new ChatRoomInvitationError('unavailable', invitee.id);
		if (await this.userBlockingService.checkBlocked(invitee.id, inviterId) || await this.userBlockingService.checkBlocked(inviterId, invitee.id)) throw new ChatRoomInvitationError('blocked', invitee.id);
		const approved = await this.chatApprovalsRepository.existsBy({ userId: invitee.id, otherId: inviterId });
		if (approved) return;
		if (invitee.chatScope === 'none' ||
			(invitee.chatScope === 'followers' && !await this.userFollowingService.isFollowing(inviterId, invitee.id)) ||
			(invitee.chatScope === 'following' && !await this.userFollowingService.isFollowing(invitee.id, inviterId)) ||
			(invitee.chatScope === 'mutual' && !await this.userFollowingService.isMutual(inviterId, invitee.id))) throw new ChatRoomInvitationError('privacy', invitee.id, invitee.chatScope);
	}

	private async insertRoomJoinMessage(manager: EntityManager, roomId: string, actorId: string, userIds: string[], invited: boolean): Promise<MiChatMessage> {
		const id = this.idService.gen();
		await manager.insert(MiChatMessage, { id, fromUserId: actorId, toRoomId: roomId, systemEvent: { type: 'membersJoined', userIds, invited } });
		return manager.findOneByOrFail(MiChatMessage, { id });
	}

	private async publishRoomSystemMessage(message: MiChatMessage): Promise<void> {
		try {
			const packed = await this.chatEntityService.packMessageLiteForRoom(message);
			await this.restoreConversationForMessage(message);
			const [recipients, blocked] = await Promise.all([this.getRoomRecipientIds(message.toRoomId!), this.getRoomBlockedRecipientIds(message.toRoomId!)]);
			await Promise.all([...recipients].filter(id => id !== message.fromUserId && !blocked.has(id)).map(id => this.markUnread(id, 'room', message.toRoomId!, message.id)));
			this.globalEventService.publishChatRoomStream(message.toRoomId!, 'message', packed);
			await this.publishHistoryUpdate(message);
			this.globalEventService.publishChatRoomStream(message.toRoomId!, 'membersChanged');
		} catch {
			// 群和系统消息已经提交，推送失败不能让客户端重试建出重复群。
			this.logger.warn('Could not publish a saved chat room system message.');
		}
	}

	private async restoreConversationForMessage(message: MiChatMessage): Promise<void> {
		await this.chatConversationService.restoreOnMessage(message).catch(() => this.logger.warn('Could not restore a hidden chat conversation.'));
	}

	private async publishHistoryUpdate(message: MiChatMessage, deleted = false): Promise<void> {
		try {
			const recipients = message.toRoomId
				? await this.getRoomRecipientIds(message.toRoomId)
				: new Set([message.fromUserId, message.toUserId].filter((id): id is string => id != null));
			// 只通知参与者重新读取有权限的历史，不广播消息正文，也不触发通知声音。
			for (const userId of recipients) this.globalEventService.publishMainStream(userId, 'chatHistoryUpdated', {
				messageId: message.id, deleted,
				...(message.toRoomId ? { roomId: message.toRoomId } : { userId: userId === message.fromUserId ? message.toUserId! : message.fromUserId }),
			});
		} catch {
			this.logger.warn('Could not refresh chat history for a saved message change.');
		}
	}

	@bindThis
	public async hasPermissionToViewRoomInfo(meId: MiUser['id'], room: MiChatRoom) {
		if ((room.joinPolicy === 'public' || room.joinPolicy === 'approval') && !room.isArchived) return true;

		if (room.ownerId === meId) {
			return true;
		}

		if (await this.isRoomMember(room, meId)) {
			return true;
		}

		if (await this.chatRoomInvitationsRepository.findOneBy({ roomId: room.id, userId: meId, ignored: false, isRequest: false })) {
			return true;
		}

		if (await this.roleService.isModerator({ id: meId })) {
			return true;
		}

		return false;
	}

	@bindThis
	public async hasPermissionToDeleteRoom(meId: MiUser['id'], room: MiChatRoom) {
		if (room.ownerId === meId) {
			return true;
		}

		const iAmModerator = await this.roleService.isModerator({ id: meId });
		if (iAmModerator) {
			return true;
		}

		return false;
	}

	@bindThis
	public async deleteRoom(room: MiChatRoom, deleter?: MiUser) {
		const memberships = (await this.chatRoomMembershipsRepository.findBy({ roomId: room.id })).map(m => ({
			userId: m.userId,
		})).concat({ // ownerはmembershipレコードを作らないため
			userId: room.ownerId,
		});

		// 未読フラグ削除
		const redisPipeline = this.redisClient.pipeline();
		for (const membership of memberships) {
			redisPipeline.del(...this.unreadKeys(membership.userId, 'room', room.id).slice(0, 3));
			redisPipeline.srem(`newChatMessagesExists:${membership.userId}`, `room:${room.id}`);
		}
		await redisPipeline.exec();

		await this.chatRoomsRepository.manager.transaction(async manager => {
			const current = await manager.findOne(MiChatRoom, { where: { id: room.id }, lock: { mode: 'pessimistic_write' } });
			if (!current) return;
			await manager.delete(MiChatRoom, room.id);
		});
		this.globalEventService.publishChatRoomStream(room.id, 'membersChanged');

		if (deleter) {
			const deleterIsModerator = await this.roleService.isModerator(deleter);

			if (deleterIsModerator) {
				this.moderationLogService.log(deleter, 'deleteChatRoom', {
					roomId: room.id,
					room: room,
				});
			}
		}
	}

	@bindThis
	public async findMyRoomById(ownerId: MiUser['id'], roomId: MiChatRoom['id']) {
		return this.chatRoomsRepository.findOneBy({ id: roomId, ownerId: ownerId });
	}

	@bindThis
	public async findRoomById(roomId: MiChatRoom['id']) {
		return this.chatRoomsRepository.findOne({
			where: { id: roomId },
			relations: { owner: true },
		});
	}

	@bindThis
	public async isRoomMember(room: MiChatRoom, userId: MiUser['id']) {
		if (room.ownerId === userId) return true;
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		return membership != null;
	}

	@bindThis
	public async getRoomRole(room: MiChatRoom, userId: MiUser['id'], manager?: EntityManager): Promise<'owner' | MiChatRoomMembership['role'] | null> {
		if (room.ownerId === userId) return 'owner';
		const membership = manager
			? await manager.findOneBy(MiChatRoomMembership, { roomId: room.id, userId })
			: await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		return membership?.role ?? null;
	}

	@bindThis
	public async updateRoomMember(actorId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id'], params: {
		role?: MiChatRoomMembership['role']; nickname?: string; isSilenced?: boolean; silenceUntil?: Date | null;
	}) {
		if (params.silenceUntil && (!Number.isFinite(params.silenceUntil.getTime()) || params.silenceUntil.getTime() <= Date.now())) throw new ChatSilenceDurationError();
		const result = await this.chatRoomsRepository.manager.transaction(async manager => {
			// 角色变更、退群和群管理共用群行锁，撤销权限后不能继续写入。
			const room = await manager.findOne(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_write' } });
			if (!room) throw new ChatRoomAccessError();
			const actorRole = await this.getRoomRole(room, actorId, manager);
			if (!actorRole) throw new ChatRoomAccessError();
			const manages = params.role !== undefined || params.isSilenced !== undefined || params.silenceUntil !== undefined;
			if (room.ownerId === userId) {
				if (actorId !== userId || manages || params.nickname === undefined) throw new ChatRoomMemberError();
				await manager.update(MiChatRoom, roomId, { ownerNickname: params.nickname.trim() });
				return { membership: null, room: { ...room, ownerNickname: params.nickname.trim() } };
			}
			const member = await manager.findOneBy(MiChatRoomMembership, { roomId, userId });
			if (!member) throw new ChatRoomMemberError();
			if (manages && actorId === userId) throw new ChatRoomMemberError();
			if (params.role !== undefined && actorRole !== 'owner') throw new ChatRoomAccessError();
			if (actorId !== userId && actorRole !== 'owner' && (actorRole !== 'administrator' || member.role !== 'member')) throw new ChatRoomAccessError();
			const updates: Partial<MiChatRoomMembership> = {};
			if (params.role !== undefined) updates.role = params.role;
			if (params.nickname !== undefined) updates.nickname = params.nickname.trim();
			if (params.isSilenced !== undefined) updates.isSilenced = params.isSilenced;
			if (params.silenceUntil !== undefined) updates.silenceUntil = params.silenceUntil;
			if (params.isSilenced === false || (params.isSilenced === true && params.silenceUntil === undefined)) updates.silenceUntil = null;
			if (!Object.keys(updates).length) throw new ChatRoomMemberError();
			await manager.update(MiChatRoomMembership, member.id, updates);
			return { membership: { ...member, ...updates } as MiChatRoomMembership, room };
		});
		this.globalEventService.publishChatRoomStream(roomId, 'membersChanged');
		this.globalEventService.publishChatRoomStream(roomId, 'roomUpdated');
		return result;
	}

	@bindThis
	public async removeRoomMember(actorId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id']) {
		await this.chatRoomsRepository.manager.transaction(async manager => {
			const room = await manager.findOne(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_write' } });
			if (!room) throw new ChatRoomAccessError();
			const actorRole = await this.getRoomRole(room, actorId, manager);
			if (actorRole !== 'owner' && actorRole !== 'administrator') throw new ChatRoomAccessError();
			if (room.ownerId === userId || actorId === userId) throw new ChatRoomMemberError();
			const membership = await manager.findOneBy(MiChatRoomMembership, { roomId, userId });
			if (!membership || (actorRole === 'administrator' && membership.role === 'administrator')) throw new ChatRoomMemberError();
			await manager.delete(MiChatRoomMembership, membership.id);
			await manager.delete(MiChatRoomInvitation, { roomId, userId });
		});
		this.globalEventService.publishChatRoomStream(roomId, 'membersChanged');
		await this.clearRoomUnread(userId, roomId);
	}

	@bindThis
	public async createRoomInvitation(inviterId: MiUser['id'], roomId: MiChatRoom['id'], inviteeId: MiUser['id']) {
		if (inviterId === inviteeId) throw new ChatRoomInvitationError();
		const result = await this.chatRoomsRepository.manager.transaction(async manager => {
			const room = await manager.findOneOrFail(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_write' } });
			const inviterRole = await this.getRoomRole(room, inviterId, manager);
			if (inviterRole !== 'owner' && inviterRole !== 'administrator') throw new ChatRoomAccessError();
			if (room.joinPolicy === 'closed' || room.isArchived) throw new ChatRoomInvitationError('closed');
			if (inviteeId === room.ownerId) throw new ChatRoomInvitationError('alreadyMember', inviteeId);
			const invitee = await manager.findOneBy(MiUser, { id: inviteeId });
			if (!invitee) throw new ChatRoomInvitationError('unavailable', inviteeId);
			if (await manager.existsBy(MiChatRoomMembership, { roomId, userId: inviteeId })) throw new ChatRoomInvitationError('alreadyMember', inviteeId);
			await this.assertRoomInvitee(inviterId, invitee);
			const existing = await manager.findOneBy(MiChatRoomInvitation, { roomId, userId: inviteeId });
			if (existing && !existing.isRequest) return { invitation: existing, created: false };
			if (await manager.countBy(MiChatRoomMembership, { roomId }) + 1 >= MAX_ROOM_MEMBERS) throw new ChatRoomFullError('room is full');
			if (existing) {
				const accepted = { isRequest: false, requestMessage: null, ignored: false, inviterId };
				await manager.update(MiChatRoomInvitation, existing.id, accepted);
				return { invitation: { ...existing, ...accepted }, created: true };
			}
			const invitation = manager.create(MiChatRoomInvitation, { id: this.idService.gen(), roomId: room.id, userId: inviteeId, inviterId });
			await manager.insert(MiChatRoomInvitation, invitation);
			return { invitation, created: true };
		});
		if (result.created) this.notificationService.createNotification(inviteeId, 'chatRoomInvitationReceived', { invitationId: result.invitation.id }, inviterId);
		return result.invitation;
	}

	@bindThis
	public async getSentRoomInvitationsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null, isRequest = false) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.roomId = :roomId', { roomId })
			.andWhere('invitation.isRequest = :isRequest', { isRequest });

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async getOwnedRoomsWithPagination(ownerId: MiUser['id'], limit: number, sinceId?: MiChatRoom['id'] | null, untilId?: MiChatRoom['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomsRepository.createQueryBuilder('room'), sinceId, untilId)
			.andWhere('room.ownerId = :ownerId', { ownerId });

		const rooms = await query.take(limit).getMany();

		return rooms;
	}

	@bindThis
	public async getReceivedRoomInvitationsWithPagination(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.userId = :userId', { userId })
			.andWhere('invitation.ignored = FALSE')
			.andWhere('invitation.isRequest = FALSE');

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async joinToRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const joined = await this.chatRoomsRepository.manager.transaction(async manager => {
			// 锁住群，避免同时入群突破容量；创建者没有成员记录，也占一人。
			const room = await manager.findOneOrFail(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_write' } });
			if (room.ownerId === userId || await manager.existsBy(MiChatRoomMembership, { roomId, userId })) return;
			if (room.joinPolicy === 'closed' || room.isArchived) throw new ChatRoomJoinDeniedError();
			const invitation = await manager.findOneBy(MiChatRoomInvitation, { roomId, userId, ignored: false, isRequest: false });
			if (room.joinPolicy !== 'public' && !invitation) throw new ChatRoomJoinDeniedError();
			const membershipsCount = await manager.countBy(MiChatRoomMembership, { roomId });
			if (membershipsCount + 1 >= MAX_ROOM_MEMBERS) throw new ChatRoomFullError('room is full');
			await manager.insert(MiChatRoomMembership, { id: this.idService.gen(), roomId, userId });
			await manager.delete(MiChatRoomInvitation, { roomId, userId });
			return this.insertRoomJoinMessage(manager, roomId, invitation?.inviterId ?? (invitation ? room.ownerId : userId), [userId], invitation != null);
		});
		if (joined) await this.publishRoomSystemMessage(joined);
	}

	@bindThis
	public async requestToJoinRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], requestMessage?: string): Promise<void> {
		const created = await this.chatRoomsRepository.manager.transaction(async manager => {
			const room = await manager.findOneOrFail(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_write' } });
			if (room.ownerId === userId || await manager.existsBy(MiChatRoomMembership, { roomId, userId })) return false;
			if (room.joinPolicy !== 'approval' || room.isArchived || (requestMessage?.trim().length ?? 0) > 500) throw new ChatRoomJoinDeniedError();
			const user = await manager.findOneBy(MiUser, { id: userId });
			if (!user || user.host != null || user.isSuspended || user.isDeleted || user.movedToUri || !(await this.getChatAvailability(userId)).write) throw new ChatRoomJoinDeniedError();
			if (await this.userBlockingService.checkBlocked(userId, room.ownerId) || await this.userBlockingService.checkBlocked(room.ownerId, userId)) throw new ChatRoomJoinDeniedError();
			const existing = await manager.findOneBy(MiChatRoomInvitation, { roomId, userId });
			if (existing && !existing.ignored) return false;
			if (await manager.countBy(MiChatRoomMembership, { roomId }) + 1 >= MAX_ROOM_MEMBERS) throw new ChatRoomFullError('room is full');
			if (existing) await manager.delete(MiChatRoomInvitation, existing.id);
			await manager.insert(MiChatRoomInvitation, {
				id: this.idService.gen(), roomId, userId, inviterId: null,
				isRequest: true, requestMessage: requestMessage?.trim() || null, ignored: false,
			});
			return true;
		});
		if (created) this.globalEventService.publishChatRoomStream(roomId, 'membersChanged');
	}

	@bindThis
	public async answerRoomJoinRequest(actorId: MiUser['id'], roomId: MiChatRoom['id'], requestId: MiChatRoomInvitation['id'], approve: boolean): Promise<void> {
		const result = await this.chatRoomsRepository.manager.transaction(async manager => {
			const room = await manager.findOneOrFail(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_write' } });
			const role = await this.getRoomRole(room, actorId, manager);
			if (role !== 'owner' && role !== 'administrator') throw new ChatRoomAccessError();
			const request = await manager.findOneBy(MiChatRoomInvitation, { id: requestId, roomId, isRequest: true, ignored: false });
			if (!request) return null;
			if (!approve) {
				await manager.delete(MiChatRoomInvitation, request.id);
				return { message: null };
			}
			if (room.isArchived || room.joinPolicy === 'closed') throw new ChatRoomJoinDeniedError();
			const userId = request.userId;
			if (room.ownerId === userId || await manager.existsBy(MiChatRoomMembership, { roomId, userId })) {
				await manager.delete(MiChatRoomInvitation, request.id);
				return { message: null };
			}
			const user = await manager.findOneBy(MiUser, { id: userId });
			if (!user || user.host != null || user.isSuspended || user.isDeleted || user.movedToUri || !(await this.getChatAvailability(userId)).write) throw new ChatRoomJoinDeniedError();
			if (await this.userBlockingService.checkBlocked(userId, room.ownerId) || await this.userBlockingService.checkBlocked(room.ownerId, userId)) throw new ChatRoomJoinDeniedError();
			// 与直接入群共用群行锁，审核并发也不能超过50人。
			if (await manager.countBy(MiChatRoomMembership, { roomId }) + 1 >= MAX_ROOM_MEMBERS) throw new ChatRoomFullError('room is full');
			await manager.insert(MiChatRoomMembership, { id: this.idService.gen(), roomId, userId });
			await manager.delete(MiChatRoomInvitation, request.id);
			return { message: await this.insertRoomJoinMessage(manager, roomId, userId, [userId], false) };
		});
		if (result?.message) await this.publishRoomSystemMessage(result.message);
		else if (result) this.globalEventService.publishChatRoomStream(roomId, 'membersChanged');
	}

	@bindThis
	public async ignoreRoomInvitation(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const invitation = await this.chatRoomInvitationsRepository.findOneByOrFail({ roomId, userId, isRequest: false });
		await this.chatRoomInvitationsRepository.update(invitation.id, { ignored: true });
	}

	@bindThis
	public async leaveRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		await this.chatRoomsRepository.manager.transaction(async manager => {
			const room = await manager.findOne(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_write' } });
			if (!room || room.ownerId === userId) throw new ChatRoomAccessError();
			await manager.delete(MiChatRoomMembership, { roomId, userId });
			await manager.delete(MiChatRoomInvitation, { roomId, userId });
		});
		this.globalEventService.publishChatRoomStream(roomId, 'membersChanged');
		await this.clearRoomUnread(userId, roomId);
		this.globalEventService.publishMainStream(userId, 'chatRoomLeft', { roomId });
		await this.publishUnreadState(userId);
	}

	private async clearRoomUnread(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		await this.chatConversationService.forget(userId, { roomId });
		// 未読フラグを消す (「既読にする」というわけでもないのでreadメソッドは使わないでおく)
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(...this.unreadKeys(userId, 'room', roomId).slice(0, 3));
		redisPipeline.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async muteRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], mute: boolean, duration?: number) {
		const mutedUntil = mute && duration != null ? new Date(Date.now() + duration * 1000) : null;
		await this.chatConversationService.update(userId, { roomId }, { notificationMode: mute ? 'silent' : 'all' }, mutedUntil).catch(error => {
			if (error instanceof ChatConversationAccessError) throw new ChatRoomAccessError();
			throw error;
		});
	}

	public async getConversationNotificationMode(userId: string, target: { userId?: string; roomId?: string }) {
		return this.chatConversationService.mode(userId, target);
	}

	public async getRoomBlockedRecipientIds(roomId: string): Promise<Set<string>> {
		const settings = await this.chatConversationService.roomSettings(roomId);
		return new Set(settings.filter(setting => this.chatConversationService.effectiveMode(setting) === 'blocked').map(setting => setting.ownerId));
	}

	private scheduleNotification(callback: () => Promise<void>) {
		setTimeout(() => {
			void callback().catch(() => this.logger.warn('Could not deliver delayed chat notification.'));
		}, 3000);
	}

	@bindThis
	public async getRoomRecipientIds(roomId: MiChatRoom['id']): Promise<Set<MiUser['id']>> {
		const members = await this.chatRoomsRepository.createQueryBuilder('room')
			.leftJoin(MiChatRoomMembership, 'membership', 'membership.roomId = room.id')
			.select('room.ownerId', 'ownerId')
			.addSelect('membership.userId', 'userId')
			.where('room.id = :roomId', { roomId })
			.getRawMany<{ ownerId: string; userId: string | null }>();
		return new Set(members.flatMap(member => member.userId ? [member.ownerId, member.userId] : [member.ownerId]));
	}

	private async getRoomParticipants(roomId: MiChatRoom['id']) {
		const [room, memberships, settings] = await Promise.all([
			this.chatRoomsRepository.findOneBy({ id: roomId }),
			this.chatRoomMembershipsRepository.findBy({ roomId }),
			this.chatConversationService.roomSettings(roomId),
		]);
		if (!room) return [];
		const now = Date.now();
		const mode = (userId: string, isMuted: boolean) => {
			const setting = settings.find(item => item.ownerId === userId);
			return setting ? this.chatConversationService.effectiveMode(setting) : isMuted ? 'silent' as const : 'all' as const;
		};
		return memberships.map(membership => ({
			userId: membership.userId,
			isMuted: Boolean(membership.isMuted && (membership.mutedUntil == null || membership.mutedUntil.getTime() > now)),
			notificationMode: mode(membership.userId, Boolean(membership.isMuted && (membership.mutedUntil == null || membership.mutedUntil.getTime() > now))),
		})).concat({
			userId: room.ownerId,
			isMuted: Boolean(room.ownerIsMuted && (room.ownerMutedUntil == null || room.ownerMutedUntil.getTime() > now)),
			notificationMode: mode(room.ownerId, Boolean(room.ownerIsMuted && (room.ownerMutedUntil == null || room.ownerMutedUntil.getTime() > now))),
		});
	}

	@bindThis
	public async updateRoom(room: MiChatRoom, params: {
		name?: string;
		description?: string;
		announcement?: string;
		joinPolicy?: MiChatRoom['joinPolicy'];
		avatarId?: MiChatRoom['avatarId'];
		isSilenced?: boolean;
		silenceUntil?: Date | null;
	}, updaterId: MiUser['id']): Promise<MiChatRoom> {
		if (params.silenceUntil && (!Number.isFinite(params.silenceUntil.getTime()) || params.silenceUntil.getTime() <= Date.now())) throw new ChatSilenceDurationError();
		if (params.isSilenced === false) params = { ...params, silenceUntil: null };
		if (params.isSilenced === true && params.silenceUntil === undefined) params = { ...params, silenceUntil: null };
		const updated = await this.chatRoomsRepository.manager.transaction(async manager => {
			const current = await manager.findOne(MiChatRoom, { where: { id: room.id }, lock: { mode: 'pessimistic_write' } });
			if (!current) throw new ChatRoomAccessError();
			const role = await this.getRoomRole(current, updaterId, manager);
			if (role !== 'owner' && (role !== 'administrator' || params.name !== undefined || params.description !== undefined || params.joinPolicy !== undefined || params.avatarId !== undefined)) throw new ChatRoomAccessError();
			assertContentLength(params.name, CONTENT_LIMITS.chatRoomName, current.name);
			assertContentLength(params.description, CONTENT_LIMITS.chatRoomDescription, current.description);
			if (Object.values(params).some(value => value !== undefined)) await manager.update(MiChatRoom, current.id, params);
			return manager.findOneByOrFail(MiChatRoom, { id: current.id });
		});
		this.globalEventService.publishChatRoomStream(room.id, 'roomUpdated');
		return updated;
	}

	@bindThis
	public async getRoomMembershipsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.andWhere('membership.roomId = :roomId', { roomId });

		const memberships = await query.take(limit).getMany();

		return memberships;
	}

	@bindThis
	public async searchMessages(meId: MiUser['id'], query: string, limit: number, params: {
		userId?: MiUser['id'] | null;
		roomId?: MiChatRoom['id'] | null;
	}) {
		const q = this.chatMessagesRepository.createQueryBuilder('message');

		if (params.userId) {
			q.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
				.setParameter('meId', meId)
				.setParameter('otherId', params.userId);
		} else if (params.roomId) {
			q.where('message.toRoomId = :roomId', { roomId: params.roomId });
		} else {
			const membershipsQuery = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
				.select('membership.roomId')
				.where('membership.userId = :meId', { meId: meId });

			const ownedRoomsQuery = this.chatRoomsRepository.createQueryBuilder('room')
				.select('room.id')
				.where('room.ownerId = :meId', { meId });

			q.andWhere(new Brackets(qb => {
				qb
					.where('message.fromUserId = :meId')
					.orWhere('message.toUserId = :meId')
					.orWhere(`message.toRoomId IN (${membershipsQuery.getQuery()})`)
					.orWhere(`message.toRoomId IN (${ownedRoomsQuery.getQuery()})`);
			}));

			q.setParameters(membershipsQuery.getParameters());
			q.setParameters(ownedRoomsQuery.getParameters());
		}

		q.andWhere('LOWER(message.text) LIKE :q', { q: `%${ sqlLikeEscape(query.toLowerCase()) }%` });

		q.leftJoinAndSelect('message.file', 'file');
		q.leftJoinAndSelect('message.fromUser', 'fromUser');
		q.leftJoinAndSelect('message.toUser', 'toUser');
		q.leftJoinAndSelect('message.toRoom', 'toRoom');
		q.leftJoinAndSelect('toRoom.owner', 'toRoomOwner');

		const messages = await q.orderBy('message.id', 'DESC').take(limit).getMany();

		return messages;
	}

	@bindThis
	public async react(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else {
			const name = custom[1];
			const emoji = (await this.customEmojiService.localEmojisCache.fetch()).get(name);

			if (emoji == null) {
				throw new Error('no such emoji');
			} else {
				reaction = `:${name}:`;
			}
		}

		const message = await this.chatMessagesRepository.findOneBy({ id: messageId });
		if (message == null || message.systemEvent) throw new ChatMessageAccessError('no such message');

		if (message.fromUserId === userId) {
			throw new ChatMessageAccessError('cannot react to own message');
		}

		if (message.toRoomId === null && message.toUserId !== userId) {
			throw new ChatMessageAccessError('cannot react to others message');
		}

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		if (room) {
			if (!(await this.isRoomMember(room, userId))) {
				throw new ChatMessageAccessError('cannot react to others message');
			}
		}

		const added = await this.chatMessagesRepository.manager.transaction(async manager => {
			// 锁定消息后再计算占位，避免并发添加突破上限或重复计数。
			const current = await manager.findOne(MiChatMessage, { where: { id: message.id }, lock: { mode: 'pessimistic_write' } });
			if (current == null) throw new ChatMessageAccessError('no such message');

			const pair = `${userId}/${reaction}`;
			if (current.reactions.includes(pair)) return false;

			const reactionTypes = new Set(current.reactions.map(record => record.split('/')[1]));
			if (!reactionTypes.has(reaction) && reactionTypes.size >= MAX_REACTION_TYPES_PER_MESSAGE) {
				throw new Error('too many reactions');
			}

			await manager.update(MiChatMessage, current.id, { reactions: [...current.reactions, pair] });
			return true;
		});
		if (!added) return;

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'react', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'react', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'react', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async unreact(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else { // 削除されたカスタム絵文字のリアクションを削除したいかもしれないので絵文字の存在チェックはする必要なし
			const name = custom[1];
			reaction = `:${name}:`;
		}

		const message = await this.chatMessagesRepository.findOneBy({ id: messageId });
		if (message == null || message.systemEvent) throw new ChatMessageAccessError('no such message');

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		if (room) {
			if (!(await this.isRoomMember(room, userId))) {
				throw new ChatMessageAccessError('cannot unreact to others message');
			}
		} else if (message.fromUserId !== userId && message.toUserId !== userId) {
			throw new ChatMessageAccessError('cannot unreact to others message');
		}

		const result = await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_remove("reactions", :pair)`,
			})
			.where('id = :id', { id: message.id })
			.andWhere(':pair = ANY("reactions")')
			.setParameter('pair', `${userId}/${reaction}`)
			.execute();
		if (result.affected !== 1) return;

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'unreact', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'unreact', {
				messageId: message.id,
				reaction,
			});
			if (message.toUserId !== message.fromUserId) this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'unreact', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async getMyMemberships(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.andWhere('membership.userId = :userId', { userId });

		const memberships = await query.take(limit).getMany();

		return memberships;
	}
}
