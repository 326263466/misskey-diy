/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, DataSource, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { MiChatConversationSetting } from '@/models/ChatConversationSetting.js';
import { MiChatMessage } from '@/models/ChatMessage.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiChatRoomMembership } from '@/models/ChatRoomMembership.js';
import { MiUser } from '@/models/User.js';

export class ChatConversationAccessError extends Error {}
export type ChatConversationTarget = { userId?: string; roomId?: string };
export type ChatNotificationMode = MiChatConversationSetting['notificationMode'];

@Injectable()
export class ChatConversationService {
	constructor(@Inject(DI.db) private db: DataSource, private idService: IdService) {}

	private where(ownerId: string, target: ChatConversationTarget) {
		return target.roomId ? { ownerId, roomId: target.roomId } : { ownerId, userId: target.userId! };
	}

	private accessible(ownerId: string) {
		return this.db.getRepository(MiChatConversationSetting).createQueryBuilder('setting')
			.leftJoin(MiChatRoom, 'room', 'room.id = setting.roomId')
			.leftJoin(MiChatRoomMembership, 'member', 'member.roomId = setting.roomId AND member.userId = :ownerId', { ownerId })
			.leftJoin(MiUser, 'targetUser', 'targetUser.id = setting.userId')
			.where('setting.ownerId = :ownerId', { ownerId })
			.andWhere('((setting.userId IS NOT NULL AND targetUser.isDeleted = FALSE) OR (setting.roomId IS NOT NULL AND (room.ownerId = :ownerId OR member.id IS NOT NULL)))');
	}

	public effectiveMode(setting: Pick<MiChatConversationSetting, 'notificationMode' | 'mutedUntil'> | null | undefined): ChatNotificationMode {
		return setting && (setting.mutedUntil == null || setting.mutedUntil.getTime() > Date.now()) ? setting.notificationMode : 'all';
	}

	public async mode(ownerId: string, target: ChatConversationTarget): Promise<ChatNotificationMode> {
		return this.effectiveMode(await this.db.getRepository(MiChatConversationSetting).findOneBy(this.where(ownerId, target)));
	}

	public pack(setting: MiChatConversationSetting) {
		return { userId: setting.userId, roomId: setting.roomId, notificationMode: this.effectiveMode(setting), mutedUntil: setting.mutedUntil?.toISOString() ?? null, hidden: setting.hidden, hiddenThroughId: setting.hiddenThroughId, markedUnread: setting.markedUnread };
	}

	public async list(ownerId: string) {
		// 弥补隐藏操作与新消息提交交错时，消息推送先于偏好写入完成的窗口。
		await this.db.getRepository(MiChatConversationSetting).createQueryBuilder().update().set({ hidden: false })
			.where('"ownerId" = :ownerId AND "hidden" = true', { ownerId })
			.andWhere(`EXISTS (SELECT 1 FROM "chat_message" message WHERE ("chat_conversation_setting"."hiddenThroughId" IS NULL OR message.id > "chat_conversation_setting"."hiddenThroughId") AND (("chat_conversation_setting"."roomId" IS NOT NULL AND message."toRoomId" = "chat_conversation_setting"."roomId") OR ("chat_conversation_setting"."userId" IS NOT NULL AND ((message."fromUserId" = "chat_conversation_setting"."ownerId" AND message."toUserId" = "chat_conversation_setting"."userId") OR (message."toUserId" = "chat_conversation_setting"."ownerId" AND message."fromUserId" = "chat_conversation_setting"."userId")))))`).execute();
		return (await this.accessible(ownerId).getMany()).map(setting => this.pack(setting));
	}

	public async hasMarked(ownerId: string): Promise<boolean> {
		return this.accessible(ownerId).andWhere('setting.markedUnread = TRUE').getExists();
	}

	public async forget(ownerId: string, target: ChatConversationTarget): Promise<void> {
		await this.db.getRepository(MiChatConversationSetting).delete(this.where(ownerId, target));
	}

	public async roomSettings(roomId: string) {
		return this.db.getRepository(MiChatConversationSetting).findBy({ roomId });
	}

	public async marked(ownerId: string, type: 'user' | 'room', ids?: string[]): Promise<Set<string>> {
		const settings = await this.db.getRepository(MiChatConversationSetting).findBy({ ownerId, markedUnread: true, ...(ids ? type === 'room' ? { roomId: In(ids) } : { userId: In(ids) } : {}) });
		return new Set(settings.flatMap(setting => (type === 'room' ? setting.roomId : setting.userId) ? [(type === 'room' ? setting.roomId : setting.userId)!] : []));
	}

	public async clearMarked(ownerId: string, target?: ChatConversationTarget): Promise<boolean> {
		const result = await this.db.getRepository(MiChatConversationSetting).update({ ...(target ? this.where(ownerId, target) : { ownerId }), markedUnread: true }, { markedUnread: false });
		return Boolean(result.affected);
	}

	public async update(ownerId: string, target: ChatConversationTarget, params: { notificationMode?: ChatNotificationMode; hidden?: boolean; unread?: boolean }, mutedUntil?: Date | null) {
		return this.db.transaction(async manager => {
			let room: MiChatRoom | null = null;
			if (target.roomId) {
				// 与群消息、红包和成员变更保持先锁群再锁用户的顺序。
				room = await manager.findOne(MiChatRoom, { where: { id: target.roomId }, lock: { mode: 'pessimistic_write' } });
				if (!room || (room.ownerId !== ownerId && !await manager.existsBy(MiChatRoomMembership, { roomId: room.id, userId: ownerId }))) throw new ChatConversationAccessError();
			} else if (!target.userId || !await manager.existsBy(MiUser, { id: target.userId, isDeleted: false })) throw new ChatConversationAccessError();
			// 同一账号的偏好写入串行，避免并发首次创建重复行或互相覆盖不同字段。
			await manager.findOneOrFail(MiUser, { where: { id: ownerId }, lock: { mode: 'pessimistic_write' } });
			let setting = await manager.findOneBy(MiChatConversationSetting, this.where(ownerId, target));
			setting ??= manager.create(MiChatConversationSetting, { id: this.idService.gen(), ownerId, userId: target.userId ?? null, roomId: target.roomId ?? null, notificationMode: 'all', mutedUntil: null, hidden: false, hiddenThroughId: null, markedUnread: false });
			if (params.notificationMode !== undefined) {
				setting.notificationMode = params.notificationMode;
				setting.mutedUntil = mutedUntil ?? null;
				if (room) {
					const isMuted = params.notificationMode !== 'all';
					if (room.ownerId === ownerId) await manager.update(MiChatRoom, room.id, { ownerIsMuted: isMuted, ownerMutedUntil: setting.mutedUntil });
					else await manager.update(MiChatRoomMembership, { roomId: room.id, userId: ownerId }, { isMuted, mutedUntil: setting.mutedUntil });
				}
			}
			if (params.hidden !== undefined) {
				setting.hidden = params.hidden;
				const query = manager.createQueryBuilder(MiChatMessage, 'message');
				if (target.roomId) query.where('message.toRoomId = :roomId', target);
				else query.where(new Brackets(q => q.where('message.fromUserId = :ownerId AND message.toUserId = :userId').orWhere('message.fromUserId = :userId AND message.toUserId = :ownerId')), { ownerId, userId: target.userId });
				setting.hiddenThroughId = params.hidden ? (await query.orderBy('message.id', 'DESC').getOne())?.id ?? null : null;
			}
			if (params.unread !== undefined) setting.markedUnread = params.unread;
			await manager.save(setting);
			return this.pack(setting);
		});
	}

	public async restoreOnMessage(message: Pick<MiChatMessage, 'id' | 'fromUserId' | 'toUserId' | 'toRoomId'>): Promise<void> {
		const query = this.db.getRepository(MiChatConversationSetting).createQueryBuilder().update().set({ hidden: false });
		if (message.toRoomId) query.where('"roomId" = :roomId', { roomId: message.toRoomId });
		else query.where(new Brackets(q => q.where('"ownerId" = :fromUserId AND "userId" = :toUserId').orWhere('"ownerId" = :toUserId AND "userId" = :fromUserId')), message);
		await query.andWhere('"hidden" = true AND ("hiddenThroughId" IS NULL OR "hiddenThroughId" < :id)', { id: message.id }).execute();
	}
}
