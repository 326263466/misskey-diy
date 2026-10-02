/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Brackets, In, IsNull } from 'typeorm';
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
import type Logger from '@/logger.js';

export class ChatMessageAccessError extends Error {}
export class ChatRoomFullError extends Error {}
export class ChatRoomInvitationError extends Error {}

const MAX_ROOM_MEMBERS = 50;
const MAX_REACTIONS_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;

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
		private redPacketService: RedPacketService,
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
		/** Internal only; never accepted from a public chat endpoint. */
		isAutoReply?: boolean;
	}): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		if (fromUser.id === toUser.id) {
			throw new Error('yourself');
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
				throw new Error('recipient is cannot chat (none)');
			} else if (toUser.chatScope === 'followers') {
				const isFollower = await this.userFollowingService.isFollowing(fromUser.id, toUser.id);
				if (!isFollower) {
					if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
					throw new Error('recipient is cannot chat (followers)');
				}
			} else if (toUser.chatScope === 'following') {
				const isFollowing = await this.userFollowingService.isFollowing(toUser.id, fromUser.id);
				if (!isFollowing) {
					if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
					throw new Error('recipient is cannot chat (following)');
				}
			} else if (toUser.chatScope === 'mutual') {
				const isMutual = await this.userFollowingService.isMutual(fromUser.id, toUser.id);
				if (!isMutual) {
					if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
					throw new Error('recipient is cannot chat (mutual)');
				}
			}
		}

		if (!(await this.getChatAvailability(toUser.id)).write) {
			if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
			throw new Error('recipient is cannot chat (policy)');
		}

		const blocked = await this.userBlockingService.checkBlocked(toUser.id, fromUser.id);
		if (blocked) {
			if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
			throw new Error('blocked');
		}

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toUserId: toUser.id,
			text: params.text ? params.text.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
			isAutoReply: params.isAutoReply ?? false,
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

		if (this.userEntityService.isLocalUser(toUser)) {
			const redisPipeline = this.redisClient.pipeline();
			redisPipeline.set(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${toUser.id}`, `user:${fromUser.id}`);
			redisPipeline.exec();
		}

		if (this.userEntityService.isLocalUser(fromUser)) {
			// 自分のストリーム
			this.globalEventService.publishChatUserStream(fromUser.id, toUser.id, 'message', packedMessage);
		}

		if (this.userEntityService.isLocalUser(toUser)) {
			// 相手のストリーム
			this.globalEventService.publishChatUserStream(toUser.id, fromUser.id, 'message', packedMessage);
		}

		// 3秒経っても既読にならなかったらイベント発行
		if (this.userEntityService.isLocalUser(toUser)) {
			setTimeout(async () => {
				const marker = await this.redisClient.get(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`);

				if (marker == null) return; // 既読

				const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted, toUser);
				this.globalEventService.publishMainStream(toUser.id, 'newChatMessage', packedMessageForTo);
				const currentRecipient = await this.usersRepository.findOneBy({ id: toUser.id });
				if (currentRecipient && currentRecipient.onlineStatusOverride !== 'doNotDisturb') {
					this.pushNotificationService.pushNotification(toUser.id, 'newChatMessage', packedMessageForTo);
				}
			}, 3000);
		}

		if (!params.isAutoReply && fromUser.host === null && toUser.host === null && getUserOnlineStatusAutoReply(toUser)) {
			// A failed automatic reply must not make the sender retry an already saved message.
			await this.sendStatusAutoReply(toUser.id, fromUser.id).catch(() => {
				this.logger.warn('Could not send chat status auto reply.');
			});
		}

		return packedMessage;
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
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		redPacketId?: string | null;
	}): Promise<Packed<'ChatMessageLiteForRoom'>> {
		if (params.redPacketId && (fromUser.host !== null || toRoom.isArchived)) throw new RedPacketService.AccessDeniedError();
		const memberships = (await this.chatRoomMembershipsRepository.findBy({ roomId: toRoom.id })).map(m => ({
			userId: m.userId,
			isMuted: m.isMuted,
		})).concat({ // ownerはmembershipレコードを作らないため
			userId: toRoom.ownerId,
			isMuted: false,
		});

		if (!memberships.some(member => member.userId === fromUser.id)) {
			if (params.redPacketId) throw new RedPacketService.AccessDeniedError();
			throw new Error('you are not a member of the room');
		}

		const membershipsOtherThanMe = memberships.filter(member => member.userId !== fromUser.id);

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toRoomId: toRoom.id,
			text: params.text ? params.text.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
		} satisfies Partial<MiChatMessage>;

		const saved = params.redPacketId ? await this.insertMessageWithRedPacket(message, params.redPacketId) : { message: await this.chatMessagesRepository.insertOne(message), created: true };
		const inserted = saved.message;
		if (!saved.created) return this.chatEntityService.packMessageLiteForRoom(inserted);

		const packedMessage = await this.chatEntityService.packMessageLiteForRoom(inserted);

		this.globalEventService.publishChatRoomStream(toRoom.id, 'message', packedMessage);

		const redisPipeline = this.redisClient.pipeline();
		for (const membership of membershipsOtherThanMe) {
			if (membership.isMuted) continue;

			redisPipeline.set(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${membership.userId}`, `room:${toRoom.id}`);
		}
		redisPipeline.exec();

		// 3秒経っても既読にならなかったらイベント発行
		setTimeout(async () => {
			const redisPipeline = this.redisClient.pipeline();
			for (const membership of membershipsOtherThanMe) {
				redisPipeline.get(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`);
			}
			const markers = await redisPipeline.exec();
			if (markers == null) throw new Error('redis error');

			if (markers.every(marker => marker[1] == null)) return;

			const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted);
			const quietUsers = new Set((await this.usersRepository.find({
				where: {
					id: In(membershipsOtherThanMe.filter((_, i) => markers[i][1] != null).map(member => member.userId)),
					onlineStatusOverride: 'doNotDisturb',
				},
				select: { id: true },
			})).map(user => user.id));

			for (let i = 0; i < membershipsOtherThanMe.length; i++) {
				const marker = markers[i][1];
				if (marker == null) continue;

				this.globalEventService.publishMainStream(membershipsOtherThanMe[i].userId, 'newChatMessage', packedMessageForTo);
				if (!quietUsers.has(membershipsOtherThanMe[i].userId)) {
					this.pushNotificationService.pushNotification(membershipsOtherThanMe[i].userId, 'newChatMessage', packedMessageForTo);
				}
			}
		}, 3000);

		return packedMessage;
	}

	private async insertMessageWithRedPacket(message: Partial<MiChatMessage> & Pick<MiChatMessage, 'id' | 'fromUserId'>, redPacketId: string): Promise<{ message: MiChatMessage; created: boolean }> {
		if (!(await this.getChatAvailability(message.fromUserId)).write) throw new RedPacketService.AccessDeniedError();
		await this.redPacketService.assertCanReference(redPacketId, message.fromUserId);
		return this.chatMessagesRepository.manager.transaction(async manager => {
			// Serialize retries of this sender's reference without imposing a global packet binding.
			const sender = await manager.findOne(MiUser, { where: { id: message.fromUserId }, lock: { mode: 'for_no_key_update' } });
			if (!sender || sender.host !== null || sender.isSuspended || sender.isDeleted || sender.movedToUri) throw new RedPacketService.AccessDeniedError();
			const existing = await manager.findOneBy(MiChatMessage, {
				redPacketId, fromUserId: sender.id, toUserId: message.toUserId ?? IsNull(), toRoomId: message.toRoomId ?? IsNull(),
				text: message.text ?? IsNull(), fileId: message.fileId ?? IsNull(),
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
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newUserChatMessageExists:${readerId}:${senderId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `user:${senderId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async readRoomChatMessage(
		readerId: MiUser['id'],
		roomId: MiChatRoom['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${readerId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `room:${roomId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async readAllChatMessages(
		readerId: MiUser['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		// TODO: newUserChatMessageExists とか newRoomChatMessageExists も消したい(けどキーの列挙が必要になって面倒)
		redisPipeline.del(`newChatMessagesExists:${readerId}`);
		await redisPipeline.exec();
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
		await this.chatMessagesRepository.delete(message.id);

		if (message.toUserId) {
			const [fromUser, toUser] = await Promise.all([
				this.usersRepository.findOneByOrFail({ id: message.fromUserId }),
				this.usersRepository.findOneByOrFail({ id: message.toUserId }),
			]);

			if (this.userEntityService.isLocalUser(fromUser)) this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId, 'deleted', message.id);
			if (this.userEntityService.isLocalUser(toUser)) this.globalEventService.publishChatUserStream(message.toUserId, message.fromUserId, 'deleted', message.id);

			if (this.userEntityService.isLocalUser(fromUser) && this.userEntityService.isRemoteUser(toUser)) {
				//const activity = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${message.id}`), fromUser));
				//this.queueService.deliver(fromUser, activity, toUser.inbox);
			}
		} else if (message.toRoomId) {
			this.globalEventService.publishChatRoomStream(message.toRoomId, 'deleted', message.id);
		}
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
	public async userHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		const history: MiChatMessage[] = [];

		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('muting.muteeId')
			.where('muting.muterId = :muterId', { muterId: meId });

		for (let i = 0; i < limit; i++) {
			const found = history.map(m => (m.fromUserId === meId) ? m.toUserId! : m.fromUserId!);

			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.orderBy('message.id', 'DESC')
				.where(new Brackets(qb => {
					qb
						.where('message.fromUserId = :meId', { meId: meId })
						.orWhere('message.toUserId = :meId', { meId: meId });
				}))
				.andWhere('message.toRoomId IS NULL')
				.andWhere(`message.fromUserId NOT IN (${ mutingQuery.getQuery() })`)
				.andWhere(`message.toUserId NOT IN (${ mutingQuery.getQuery() })`);

			if (found.length > 0) {
				query.andWhere('message.fromUserId NOT IN (:...found)', { found: found });
				query.andWhere('message.toUserId NOT IN (:...found)', { found: found });
			}

			query.setParameters(mutingQuery.getParameters());

			const message = await query.getOne();

			if (message) {
				history.push(message);
			} else {
				break;
			}
		}

		return history;
	}

	@bindThis
	public async roomHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		// TODO: 一回のクエリにまとめられるかも
		const [memberRoomIds, ownedRoomIds] = await Promise.all([
			this.chatRoomMembershipsRepository.findBy({
				userId: meId,
			}).then(xs => xs.map(x => x.roomId)),
			this.chatRoomsRepository.findBy({
				ownerId: meId,
			}).then(xs => xs.map(x => x.id)),
		]);

		const roomIds = memberRoomIds.concat(ownedRoomIds);

		if (memberRoomIds.length === 0 && ownedRoomIds.length === 0) {
			return [];
		}

		const history: MiChatMessage[] = [];

		for (let i = 0; i < limit; i++) {
			const found = history.map(m => m.toRoomId!);

			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.orderBy('message.id', 'DESC')
				.where('message.toRoomId IN (:...roomIds)', { roomIds });

			if (found.length > 0) {
				query.andWhere('message.toRoomId NOT IN (:...found)', { found: found });
			}

			const message = await query.getOne();

			if (message) {
				history.push(message);
			} else {
				break;
			}
		}

		return history;
	}

	@bindThis
	public async getUserReadStateMap(userId: MiUser['id'], otherIds: MiUser['id'][]) {
		const readStateMap: Record<MiUser['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const otherId of otherIds) {
			redisPipeline.get(`newUserChatMessageExists:${userId}:${otherId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < otherIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[otherIds[i]] = marker == null;
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

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < roomIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[roomIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async hasUnreadMessages(userId: MiUser['id']) {
		const card = await this.redisClient.scard(`newChatMessagesExists:${userId}`);
		return card > 0;
	}

	@bindThis
	public async createRoom(owner: MiUser, params: Partial<{
		name: string;
		description: string;
	}>) {
		const room = {
			id: this.idService.gen(),
			name: params.name,
			description: params.description,
			ownerId: owner.id,
		} satisfies Partial<MiChatRoom>;

		const created = await this.chatRoomsRepository.insertOne(room);

		return created;
	}

	@bindThis
	public async hasPermissionToViewRoomInfo(meId: MiUser['id'], room: MiChatRoom) {
		if (room.ownerId === meId) {
			return true;
		}

		if (await this.isRoomMember(room, meId)) {
			return true;
		}

		if (await this.chatRoomInvitationsRepository.findOneBy({ roomId: room.id, userId: meId })) {
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
			redisPipeline.del(`newRoomChatMessageExists:${membership.userId}:${room.id}`);
			redisPipeline.srem(`newChatMessagesExists:${membership.userId}`, `room:${room.id}`);
		}
		await redisPipeline.exec();

		await this.chatRoomsRepository.delete(room.id);
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
	public async createRoomInvitation(inviterId: MiUser['id'], roomId: MiChatRoom['id'], inviteeId: MiUser['id']) {
		if (inviterId === inviteeId) throw new ChatRoomInvitationError();
		const result = await this.chatRoomsRepository.manager.transaction(async manager => {
			const room = await manager.findOneOrFail(MiChatRoom, { where: { id: roomId, ownerId: inviterId }, lock: { mode: 'pessimistic_write' } });
			const invitee = await manager.findOneBy(MiUser, { id: inviteeId });
			if (!invitee || invitee.host !== null || invitee.isSuspended || invitee.isDeleted || invitee.movedToUri || await manager.existsBy(MiChatRoomMembership, { roomId, userId: inviteeId })) throw new ChatRoomInvitationError();
			const existing = await manager.findOneBy(MiChatRoomInvitation, { roomId, userId: inviteeId });
			if (existing) return { invitation: existing, created: false };
			if (await manager.countBy(MiChatRoomMembership, { roomId }) + 1 >= MAX_ROOM_MEMBERS) throw new ChatRoomFullError('room is full');
			const invitation = manager.create(MiChatRoomInvitation, { id: this.idService.gen(), roomId: room.id, userId: inviteeId });
			await manager.insert(MiChatRoomInvitation, invitation);
			return { invitation, created: true };
		});
		if (result.created) this.notificationService.createNotification(inviteeId, 'chatRoomInvitationReceived', { invitationId: result.invitation.id }, inviterId);
		return result.invitation;
	}

	@bindThis
	public async getSentRoomInvitationsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.roomId = :roomId', { roomId });

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
			.andWhere('invitation.ignored = FALSE');

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async joinToRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const joined = await this.chatRoomsRepository.manager.transaction(async manager => {
			// 锁住群，避免同时入群突破容量；创建者没有成员记录，也占一人。
			const room = await manager.findOneOrFail(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_write' } });
			if (room.ownerId === userId || await manager.existsBy(MiChatRoomMembership, { roomId, userId })) return;
			const invitation = await manager.findOneByOrFail(MiChatRoomInvitation, { roomId, userId });
			const membershipsCount = await manager.countBy(MiChatRoomMembership, { roomId });
			if (membershipsCount + 1 >= MAX_ROOM_MEMBERS) throw new ChatRoomFullError('room is full');
			await manager.insert(MiChatRoomMembership, { id: this.idService.gen(), roomId, userId });
			await manager.delete(MiChatRoomInvitation, invitation.id);
			return true;
		});
		if (joined) this.globalEventService.publishChatRoomStream(roomId, 'membersChanged');
	}

	@bindThis
	public async ignoreRoomInvitation(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const invitation = await this.chatRoomInvitationsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomInvitationsRepository.update(invitation.id, { ignored: true });
	}

	@bindThis
	public async leaveRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.delete(membership.id);
		this.globalEventService.publishChatRoomStream(roomId, 'membersChanged');

		// 未読フラグを消す (「既読にする」というわけでもないのでreadメソッドは使わないでおく)
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${userId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async muteRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], mute: boolean) {
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.update(membership.id, { isMuted: mute });
	}

	@bindThis
	public async updateRoom(room: MiChatRoom, params: {
		name?: string;
		description?: string;
	}): Promise<MiChatRoom> {
		return this.chatRoomsRepository.createQueryBuilder().update()
			.set(params)
			.where('id = :id', { id: room.id })
			.returning('*')
			.execute()
			.then((response) => {
				return response.raw[0];
			});
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
		if (message == null) throw new ChatMessageAccessError('no such message');

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

		if (message.reactions.length >= MAX_REACTIONS_PER_MESSAGE) {
			throw new Error('too many reactions');
		}

		await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_append("reactions", :pair)`,
			})
			.where('id = :id', { id: message.id })
			.setParameter('pair', `${userId}/${reaction}`)
			.execute();

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
		if (message == null) throw new ChatMessageAccessError('no such message');

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		if (room) {
			if (!(await this.isRoomMember(room, userId))) {
				throw new ChatMessageAccessError('cannot unreact to others message');
			}
		} else if (message.fromUserId !== userId && message.toUserId !== userId) {
			throw new ChatMessageAccessError('cannot unreact to others message');
		}

		await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_remove("reactions", :pair)`,
			})
			.where('id = :id', { id: message.id })
			.setParameter('pair', `${userId}/${reaction}`)
			.execute();

		// TODO: 実際に削除が行われたときのみイベントを発行する

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
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'unreact', {
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
