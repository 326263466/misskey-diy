/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, IsNull, LessThan, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { MiChatMessage } from '@/models/ChatMessage.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiRedPacketRecipient } from '@/models/RedPacketRecipient.js';
import type { MiUser } from '@/models/User.js';
import { RedPacketService } from '@/core/RedPacketService.js';
import { WalletService } from '@/core/WalletService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

type Viewer = { id: MiUser['id'] };
export type ChatPasswordRedPacketClaim = { redPacketId: string; coins: number };

@Injectable()
export class ChatRedPacketService {
	private logger: Logger;

	constructor(
		@Inject(DI.db)
		private db: DataSource,
		private redPacketService: RedPacketService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('chat-red-packet');
	}

	@bindThis
	public async assertCanReference(redPacketId: string, senderId: string, destination: { toUserId?: string | null; toRoomId?: string | null }): Promise<void> {
		const packet = await this.redPacketService.assertCanReference(redPacketId, senderId);
		if (packet.password == null) return;
		if (packet.audience === 'room') {
			if (destination.toRoomId !== packet.roomId || destination.toUserId != null) throw new RedPacketService.AccessDeniedError();
		} else if (packet.audience !== 'recipients' || destination.toRoomId != null || !destination.toUserId ||
			!await this.db.getRepository(MiRedPacketRecipient).existsBy({ redPacketId, userId: destination.toUserId })) {
			throw new RedPacketService.AccessDeniedError();
		}
	}

	private async assertPasswordMessage(em: EntityManager, packet: MiRedPacket, messageId: string, me: Viewer): Promise<void> {
		const message = await em.findOne(MiChatMessage, { where: { id: messageId, fromUserId: me.id }, lock: { mode: 'pessimistic_read' } });
		if (!message || message.isAutoReply || message.uri != null || message.redPacketId != null || message.editedAt != null || message.text?.trim() !== packet.password) {
			throw new RedPacketService.PasswordRequiredError();
		}
		let host: MiChatMessage | null;
		if (packet.audience === 'room') {
			if (message.toRoomId !== packet.roomId || message.toUserId != null) throw new RedPacketService.AccessDeniedError();
			host = await em.findOne(MiChatMessage, {
				where: { redPacketId: packet.id, fromUserId: packet.userId, toRoomId: packet.roomId!, toUserId: IsNull(), id: LessThan(message.id) },
				lock: { mode: 'pessimistic_read' },
			});
		} else {
			if (packet.audience !== 'recipients' || message.toRoomId != null || !message.toUserId ||
				message.toUserId !== packet.userId || message.fromUserId === packet.userId) throw new RedPacketService.AccessDeniedError();
			const recipientId = message.fromUserId;
			if (!await em.existsBy(MiRedPacketRecipient, { redPacketId: packet.id, userId: recipientId })) throw new RedPacketService.AccessDeniedError();
			host = await em.findOne(MiChatMessage, {
				where: { redPacketId: packet.id, fromUserId: packet.userId, toUserId: recipientId, toRoomId: IsNull(), id: LessThan(message.id) },
				lock: { mode: 'pessimistic_read' },
			});
		}
		if (!host) throw new RedPacketService.AccessDeniedError();
	}

	/** 聊天只提供消息证明，红包受众、结算和幂等由独立红包服务校验。 */
	@bindThis
	public async claimPasswordsForMessage(messageId: string, me: Viewer): Promise<ChatPasswordRedPacketClaim[]> {
		const message = await this.db.getRepository(MiChatMessage).findOneBy({ id: messageId, fromUserId: me.id });
		const password = message?.text?.trim();
		if (!message || !password || [...password].length > 32 || message.isAutoReply || message.uri != null || message.redPacketId != null || message.editedAt != null) return [];
		const query = this.db.getRepository(MiRedPacket).createQueryBuilder('packet')
			.innerJoin(MiChatMessage, 'host', 'host."redPacketId" = packet.id AND host."fromUserId" = packet."userId"')
			.where('packet.password = :password', { password })
			.andWhere("packet.status = 'active' AND packet.\"expiresAt\" > CURRENT_TIMESTAMP")
			.andWhere('(packet."startsAt" IS NULL OR packet."startsAt" <= CURRENT_TIMESTAMP)')
			.andWhere('host.id < :messageId', { messageId })
			.andWhere('NOT EXISTS (SELECT 1 FROM red_packet_claim claim WHERE claim."redPacketId" = packet.id AND claim."userId" = :userId)', { userId: me.id });
		if (message.toRoomId) {
			query.andWhere("packet.audience = 'room' AND packet.\"roomId\" = :roomId AND host.\"toRoomId\" = :roomId AND host.\"toUserId\" IS NULL", { roomId: message.toRoomId });
		} else if (message.toUserId) {
			query.andWhere("packet.audience = 'recipients' AND host.\"toRoomId\" IS NULL")
				.andWhere('host."fromUserId" = :toUserId AND host."toUserId" = :fromUserId', { fromUserId: message.fromUserId, toUserId: message.toUserId });
		} else return [];
		const packets = await query.select('packet.id').distinct(true).orderBy('packet.id', 'ASC').take(100).getMany();
		const results: ChatPasswordRedPacketClaim[] = [];
		for (const packet of packets) {
			try {
				const result = await this.redPacketService.claimWithContext(packet.id, me, {
					password,
					beforeClaim: (em, locked) => this.assertPasswordMessage(em, locked, message.id, me),
				});
				if (result.created) results.push({ redPacketId: packet.id, coins: result.coins });
			} catch (error) {
				if (!(error instanceof RedPacketService.AccessDeniedError || error instanceof RedPacketService.PasswordRequiredError ||
					error instanceof RedPacketService.NoSuchRedPacketError || error instanceof RedPacketService.ExpiredError ||
					error instanceof RedPacketService.CancelledError || error instanceof RedPacketService.ExhaustedError ||
					error instanceof RedPacketService.NotStartedError || error instanceof WalletService.BalanceLimitError ||
					error instanceof WalletService.NotAllowedError || error instanceof WalletService.NoSuchUserError)) {
					this.logger.error('Failed to claim a password red packet from a chat message.');
				}
			}
		}
		return results;
	}
}
