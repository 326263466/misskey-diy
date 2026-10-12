/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomInt } from 'node:crypto';
import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource, In, LessThanOrEqual, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { Packed } from '@/misc/json-schema.js';
import { MiUser } from '@/models/User.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiChatRoomMembership } from '@/models/ChatRoomMembership.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { MiRedPacket, redPacketCoverIds, type RedPacketCoverId, type RedPacketMode, type RedPacketStatus } from '@/models/RedPacket.js';
import { MiRedPacketRecipient } from '@/models/RedPacketRecipient.js';
import { MiRedPacketClaim } from '@/models/RedPacketClaim.js';
import { IdService } from '@/core/IdService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { WalletService } from '@/core/WalletService.js';
import { isCoinAmount, toCoinUnits } from '@/misc/coins.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type Logger from '@/logger.js';

export type RedPacketDraft = {
	kind: 'direct' | 'group';
	audience: 'public' | 'recipients' | 'room';
	roomId?: string;
	recipientIds?: string[];
	mode: RedPacketMode;
	totalCoins: number;
	count: number;
	message: string;
	password?: string | null;
	expiresInHours: number;
	/** 仅用于恢复历史预约请求，新建红包不接受预约。 */
	startsAt?: string;
	requestId: string;
	coverId?: RedPacketCoverId;
	coverFileId?: string | null;
};

export type RedPacketSummary = {
	id: string;
	senderId: string;
	kind: RedPacketDraft['kind'];
	audience: RedPacketDraft['audience'];
	roomId: string | null;
	mode: RedPacketMode;
	message: string;
	password: string | null;
	coverId: RedPacketCoverId;
	coverFileId: string | null;
	coverUrl: string | null;
	totalCoins: number;
	count: number;
	remainingCoins: number;
	remainingCount: number;
	expiresAt: string;
	startsAt: string | null;
	serverTime: string;
	status: RedPacketStatus | 'scheduled';
	claimedCoins: number | null;
};

type Viewer = { id: MiUser['id'] };
export type RedPacketClaimContext = {
	password?: string;
	beforeClaim?: (em: EntityManager, packet: MiRedPacket) => Promise<void>;
};

@Injectable()
export class RedPacketService implements OnApplicationBootstrap, OnApplicationShutdown {
	public static InvalidDraftError = class extends Error {};
	public static RequestIdConflictError = class extends Error {};
	public static NoSuchRedPacketError = class extends Error {};
	public static AccessDeniedError = class extends Error {};
	public static ExpiredError = class extends Error {};
	public static NotStartedError = class extends Error {};
	public static ExhaustedError = class extends Error {};
	public static CancelledError = class extends Error {};
	public static PasswordRequiredError = class extends Error {};

	private logger: Logger;
	private expirationTimer: ReturnType<typeof setInterval> | undefined;
	private expirationSweep: Promise<void> | undefined;

	constructor(
		@Inject(DI.db)
		private db: DataSource,
		private idService: IdService,
		private walletService: WalletService,
		private userEntityService: UserEntityService,
		private loggerService: LoggerService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		this.logger = this.loggerService.getLogger('red-packet');
	}

	public onApplicationBootstrap(): void {
		// A database scan also catches packets that expired while every worker was offline.
		const sweep = () => this.sweepExpired().catch(err => this.logger.error('Failed to refund expired red packets', { error: err }));
		void sweep();
		this.expirationTimer = setInterval(() => { void sweep(); }, 60_000);
		this.expirationTimer.unref();
	}

	public async onApplicationShutdown(): Promise<void> {
		if (this.expirationTimer) clearInterval(this.expirationTimer);
		await this.expirationSweep;
	}

	@bindThis
	public validateDraft(draft: RedPacketDraft): void {
		const units = toCoinUnits(draft.totalCoins);
		if (!['direct', 'group'].includes(draft.kind) ||
			!['public', 'recipients', 'room'].includes(draft.audience) ||
			!['equal', 'random'].includes(draft.mode) ||
			!Number.isSafeInteger(draft.count) || draft.count < 1 || draft.count > 100 ||
			!isCoinAmount(draft.totalCoins) || draft.totalCoins < 1 || draft.totalCoins > 1000 || units < draft.count ||
			(draft.mode === 'equal' && units % draft.count !== 0) ||
			!Number.isSafeInteger(draft.expiresInHours) || draft.expiresInHours < 1 || draft.expiresInHours > 24 ||
			(draft.startsAt == null ? draft.expiresInHours !== 24 :
				typeof draft.startsAt !== 'string' || draft.startsAt.length > 40 ||
				!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(draft.startsAt) ||
				!Number.isFinite(Date.parse(draft.startsAt))) ||
			(draft.kind !== 'group' && draft.mode !== 'equal' && draft.password == null) ||
			(draft.coverId != null && !redPacketCoverIds.includes(draft.coverId)) ||
			typeof draft.message !== 'string' || [...draft.message].length > 18 ||
			typeof draft.requestId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(draft.requestId)) {
			throw new RedPacketService.InvalidDraftError();
		}
		const recipients = draft.recipientIds ?? [];
		if (!Array.isArray(recipients) || recipients.length > 10000 || recipients.some(id => typeof id !== 'string' || !id || id.length > 32) ||
			new Set(recipients).size !== recipients.length ||
			(draft.audience === 'room' && (draft.kind !== 'group' || typeof draft.roomId !== 'string' || !draft.roomId || recipients.length !== 0)) ||
			(draft.audience !== 'room' && draft.roomId != null) ||
			(draft.audience === 'public' && recipients.length !== 0) ||
			(draft.audience === 'recipients' && recipients.length === 0) ||
			(draft.kind !== 'group' && (draft.count !== 1 || draft.audience !== 'recipients' || recipients.length !== 1)) ||
			(draft.audience === 'recipients' && draft.count > recipients.length)) throw new RedPacketService.InvalidDraftError();
		if (draft.password != null && (typeof draft.password !== 'string' ||
			[...draft.password].length > 32 || !draft.password.trim() || /[\r\n]/.test(draft.password) ||
			draft.mode !== 'random' || draft.audience === 'public' ||
			(draft.audience === 'recipients' && (recipients.length !== 1 || draft.count !== 1)))) {
			throw new RedPacketService.InvalidDraftError();
		}
	}

	private recipientIdsHash(draft: RedPacketDraft): string {
		return createHash('sha256').update(JSON.stringify([...(draft.recipientIds ?? [])].sort())).digest('hex');
	}

	@bindThis
	private async assertSameDraft(packet: MiRedPacket, draft: RedPacketDraft): Promise<void> {
		if (packet.kind !== draft.kind || packet.audience !== draft.audience || (packet.roomId ?? null) !== (draft.roomId ?? null) ||
			packet.recipientIdsHash !== this.recipientIdsHash(draft) || packet.mode !== draft.mode || packet.totalCoins !== draft.totalCoins || packet.count !== draft.count ||
			(packet.startsAt?.getTime() ?? null) !== (draft.startsAt == null ? null : Date.parse(draft.startsAt)) ||
			packet.message !== draft.message.trim() || packet.expiresInHours !== draft.expiresInHours || packet.coverId !== (draft.coverId ?? 'classic') || (packet.coverFileId ?? null) !== (draft.coverFileId ?? null)) {
			throw new RedPacketService.RequestIdConflictError();
		}
		if ((packet.password ?? null) !== (draft.password?.trim() ?? null)) throw new RedPacketService.RequestIdConflictError();
	}

	@bindThis
	public async create(draft: RedPacketDraft, me: Viewer): Promise<RedPacketSummary> {
		this.validateDraft(draft);
		const user = await this.db.getRepository(MiUser).findOneBy({ id: me.id });
		if (!user || user.host != null || user.isSuspended || user.isDeleted || user.movedToUri) throw new RedPacketService.AccessDeniedError();
		const existing = await this.db.getRepository(MiRedPacket).findOneBy({ userId: me.id, requestId: draft.requestId.toLowerCase() });
		if (existing) {
			await this.assertSameDraft(existing, draft);
			return this.summarize(existing, null);
		}
		// 先允许旧请求按 requestId 恢复，避免响应丢失后重复扣款。
		if (draft.startsAt != null || draft.expiresInHours !== 24 || (draft.password != null && [...draft.password.trim()].length > 18)) throw new RedPacketService.InvalidDraftError();
		try {
			return await this.db.transaction(async em => {
				const createdAt = Date.now();
				if (draft.roomId) await this.assertRoomAccess(em, draft.roomId, me.id);
				if (draft.coverFileId) await this.lockCover(em, draft.coverFileId);
				const cover = draft.coverFileId ? await em.findOneBy(MiDriveFile, { id: draft.coverFileId, userId: me.id }) : null;
				if (draft.coverFileId && (!cover || cover.isSensitive || !['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(cover.type))) throw new RedPacketService.InvalidDraftError();
				const packet = em.create(MiRedPacket, {
					id: this.idService.gen(), kind: draft.kind, audience: draft.audience, roomId: draft.roomId ?? null, recipientIdsHash: this.recipientIdsHash(draft), userId: me.id, requestId: draft.requestId.toLowerCase(),
					mode: draft.mode, message: draft.message.trim(), password: draft.password?.trim() ?? null, coverId: draft.coverId ?? 'classic', totalCoins: draft.totalCoins, count: draft.count,
					coverFileId: cover?.id ?? null, coverUrl: cover ? this.driveFileEntityService.getPublicUrl(cover) : null,
					remainingCoins: draft.totalCoins, remainingCount: draft.count, expiresInHours: 24,
					startsAt: null,
					expiresAt: new Date(createdAt + 86_400_000), status: 'active',
				});
				await em.insert(MiRedPacket, packet);
				const recipientIds = draft.recipientIds ?? [];
				if (recipientIds.includes(me.id)) throw new RedPacketService.InvalidDraftError();
				await this.walletService.lockWalletsInTransaction(em, [me.id]);
				if (recipientIds.length > 0) {
					const recipients = await em.findBy(MiUser, { id: In(recipientIds) });
					if (recipients.length !== recipientIds.length || recipients.some(user => !this.isEligible(user))) throw new RedPacketService.AccessDeniedError();
					if (await em.existsBy(MiBlocking, [{ blockerId: me.id, blockeeId: In(recipientIds) }, { blockerId: In(recipientIds), blockeeId: me.id }])) throw new RedPacketService.AccessDeniedError();
					await em.insert(MiRedPacketRecipient, recipientIds.map(userId => ({ redPacketId: packet.id, userId })));
				}
				const actor = await em.findOneByOrFail(MiUser, { id: me.id });
				if (actor.isSuspended || actor.isDeleted || actor.movedToUri) throw new RedPacketService.AccessDeniedError();
				await this.walletService.changeBalanceInTransaction(em, me.id, -draft.totalCoins, {
					type: 'redPacketSend', relatedId: packet.id, description: packet.message,
				});
				return this.summarize(packet, null);
			});
		} catch (err) {
			if ((err as { code?: string; constraint?: string }).code === '23505' &&
				(err as { constraint?: string }).constraint === 'IDX_red_packet_request') {
				const previous = await this.db.getRepository(MiRedPacket).findOneByOrFail({ userId: me.id, requestId: draft.requestId.toLowerCase() });
				await this.assertSameDraft(previous, draft);
				return this.summarize(previous, null);
			}
			throw err;
		}
	}

	private async lockCover(em: EntityManager, fileId: string): Promise<void> {
		await em.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`red-packet-cover:${fileId}`]);
	}

	/** The caller must authorize file deletion before entering this guard. */
	@bindThis
	public async withUnusedCover(fileId: string, remove: () => Promise<void>): Promise<void> {
		await this.db.transaction(async em => {
			// Serialize cleanup against creation, including requests from another tab.
			await this.lockCover(em, fileId);
			if (await em.existsBy(MiRedPacket, { coverFileId: fileId })) return;
			await remove();
		});
	}

	@bindThis
	public async assertCanReference(redPacketId: string, senderId: string): Promise<MiRedPacket> {
		const packet = await this.db.getRepository(MiRedPacket).findOneBy({ id: redPacketId });
		if (!packet) throw new RedPacketService.NoSuchRedPacketError();
		if (packet.userId !== senderId) throw new RedPacketService.AccessDeniedError();
		if (packet.status === 'cancelled') throw new RedPacketService.CancelledError();
		return packet;
	}

	private summarize(packet: MiRedPacket, claimedCoins: number | null): RedPacketSummary {
		return {
			id: packet.id, senderId: packet.userId, kind: packet.kind, audience: packet.audience, roomId: packet.roomId ?? null,
			mode: packet.mode, message: packet.message, password: packet.password ?? null, coverId: packet.coverId, totalCoins: packet.totalCoins, count: packet.count,
			coverFileId: packet.coverFileId ?? null, coverUrl: packet.coverUrl ?? null,
			remainingCoins: packet.remainingCoins, remainingCount: packet.remainingCount,
			expiresAt: packet.expiresAt.toISOString(),
			startsAt: packet.startsAt?.toISOString() ?? null,
			serverTime: new Date().toISOString(),
			status: packet.status !== 'active' ? packet.status : packet.expiresAt.getTime() <= Date.now() ? 'expired' : (packet.startsAt?.getTime() ?? 0) > Date.now() ? 'scheduled' : 'active',
			claimedCoins,
		};
	}

	@bindThis
	public async list(me: Viewer, limit: number, untilId?: string, scope: 'sent' | 'received' | 'claimable' = 'sent'): Promise<RedPacketSummary[]> {
		const query = this.db.getRepository(MiRedPacket).createQueryBuilder('packet');
		if (scope === 'sent') query.where('packet.userId = :userId', { userId: me.id });
		else {
			const user = await this.db.getRepository(MiUser).findOneBy({ id: me.id });
			if (!user || !this.isEligible(user)) throw new RedPacketService.AccessDeniedError();
			query.where(`(((packet.userId = :userId OR packet.audience = 'public' OR (packet.audience = 'room' AND EXISTS (SELECT 1 FROM chat_room room WHERE room.id = packet."roomId" AND room."isArchived" = false AND (room."ownerId" = :userId OR EXISTS (SELECT 1 FROM chat_room_membership member WHERE member."roomId" = room.id AND member."userId" = :userId))))) AND packet.status = 'active' AND packet."expiresAt" > CURRENT_TIMESTAMP) OR EXISTS (SELECT 1 FROM red_packet_recipient recipient WHERE recipient."redPacketId" = packet.id AND recipient."userId" = :userId) OR EXISTS (SELECT 1 FROM red_packet_claim claim WHERE claim."redPacketId" = packet.id AND claim."userId" = :userId))`, { userId: me.id })
				.innerJoin(MiUser, 'sender', 'sender.id = packet.userId')
				.andWhere('sender.host IS NULL AND sender."isSuspended" = false AND sender."isDeleted" = false AND sender."movedToUri" IS NULL')
				.andWhere('NOT EXISTS (SELECT 1 FROM blocking b WHERE (b."blockerId" = :userId AND b."blockeeId" = packet."userId") OR (b."blockeeId" = :userId AND b."blockerId" = packet."userId"))');
		}
		if (scope === 'claimable') query.andWhere("packet.status = 'active' AND packet.\"expiresAt\" > CURRENT_TIMESTAMP").andWhere('NOT EXISTS (SELECT 1 FROM red_packet_claim claim WHERE claim."redPacketId" = packet.id AND claim."userId" = :userId)');
		if (scope === 'claimable') query.andWhere('(packet."startsAt" IS NULL OR packet."startsAt" <= CURRENT_TIMESTAMP)');
		if (untilId) query.andWhere('packet.id < :untilId', { untilId });
		const packets = await query.orderBy('packet.id', 'DESC').take(limit).getMany();
		const claims = packets.length ? await this.db.getRepository(MiRedPacketClaim).findBy({ redPacketId: In(packets.map(packet => packet.id)), userId: me.id }) : [];
		const claimed = new Map(claims.map(claim => [claim.redPacketId, claim.coins]));
		return packets.map(packet => this.summarize(packet, claimed.get(packet.id) ?? null));
	}

	@bindThis
	public async packById(redPacketId: string, me?: Viewer | null): Promise<RedPacketSummary | null> {
		return (await this.packByIds([redPacketId], me)).get(redPacketId) ?? null;
	}

	@bindThis
	public async packByIds(redPacketIds: string[], me?: Viewer | null): Promise<Map<string, RedPacketSummary>> {
		if (redPacketIds.length === 0) return new Map();
		const packets = await this.db.getRepository(MiRedPacket).findBy({ id: In(redPacketIds) });
		const claims = me ? await this.db.getRepository(MiRedPacketClaim).findBy({ redPacketId: In(redPacketIds), userId: me.id }) : [];
		const claimed = new Map(claims.map(claim => [claim.redPacketId, claim.coins]));
		return new Map(packets.map(packet => [packet.id, this.summarize(packet, claimed.get(packet.id) ?? null)]));
	}

	private async assertUsersAccess(em: EntityManager, authorId: string, me: Viewer): Promise<void> {
		const users = await em.findBy(MiUser, { id: In([me.id, authorId]) });
		const actor = users.find(user => user.id === me.id);
		const author = users.find(user => user.id === authorId);
		if (!actor || !author || !this.isEligible(actor) || !this.isEligible(author)) {
			throw new RedPacketService.AccessDeniedError();
		}
		const blocked = await em.existsBy(MiBlocking, [
			{ blockerId: me.id, blockeeId: authorId },
			{ blockerId: authorId, blockeeId: me.id },
		]);
		if (blocked) throw new RedPacketService.AccessDeniedError();
	}

	private isEligible(user: MiUser): boolean {
		return user.host == null && !user.isSuspended && !user.isDeleted && !user.movedToUri;
	}

	private async assertRoomAccess(em: EntityManager, roomId: string | null, userId: string): Promise<void> {
		if (!roomId) throw new RedPacketService.AccessDeniedError();
		const room = await em.findOne(MiChatRoom, { where: { id: roomId }, lock: { mode: 'pessimistic_read' } });
		if (!room || room.isArchived) throw new RedPacketService.AccessDeniedError();
		if (room.ownerId === userId) return;
		const membership = await em.findOne(MiChatRoomMembership, { where: { roomId, userId }, lock: { mode: 'pessimistic_read' } });
		if (!membership) throw new RedPacketService.AccessDeniedError();
	}

	private async withPacketTransaction<T>(redPacketId: string, me: Viewer | undefined, action: (em: EntityManager, packet: MiRedPacket) => Promise<T>): Promise<T> {
		return this.db.transaction(async em => {
			if (me) {
				const candidate = await em.findOneBy(MiRedPacket, { id: redPacketId });
				if (!candidate) throw new RedPacketService.NoSuchRedPacketError();
				// 与删群保持相同锁序：先群再红包，避免外键清空 roomId 时死锁。
				if (candidate.audience === 'room' && (candidate.userId !== me.id || candidate.password != null)) await this.assertRoomAccess(em, candidate.roomId, me.id);
			}
			const packet = await em.findOne(MiRedPacket, { where: { id: redPacketId }, lock: { mode: 'pessimistic_write' } });
			if (!packet) throw new RedPacketService.NoSuchRedPacketError();
			if (me) {
				await this.assertUsersAccess(em, packet.userId, me);
				if (packet.userId !== me.id && packet.audience === 'recipients' && !await em.existsBy(MiRedPacketRecipient, { redPacketId, userId: me.id })) throw new RedPacketService.AccessDeniedError();
			}
			return action(em, packet);
		});
	}

	private async refund(em: EntityManager, packet: MiRedPacket, status: 'expired' | 'cancelled'): Promise<void> {
		if (packet.status !== 'active') return;
		if (packet.remainingCoins > 0) {
			await this.walletService.changeBalanceInTransaction(em, packet.userId, packet.remainingCoins, {
				type: 'redPacketRefund', relatedId: packet.id, description: packet.message,
			});
		}
		packet.remainingCoins = 0;
		packet.status = status;
		await em.update(MiRedPacket, packet.id, { remainingCoins: 0, status });
	}

	/** 调用方须先校验删除权限，并与宿主删除使用同一事务。 */
	@bindThis
	public async cancelInTransaction(em: EntityManager, redPacketIds: string[]): Promise<void> {
		if (redPacketIds.length === 0) return;
		const packets = await em.find(MiRedPacket, {
			where: { id: In([...new Set(redPacketIds)]) }, order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' },
		});
		// 批量删除先锁全部红包，再按用户顺序锁钱包，避免与并发领取互相等待。
		await this.walletService.lockWalletsInTransaction(em, packets.filter(packet => packet.status === 'active' && packet.remainingCoins > 0).map(packet => packet.userId));
		for (const packet of packets) {
			await this.refund(em, packet, packet.expiresAt.getTime() <= Date.now() ? 'expired' : 'cancelled');
		}
	}

	@bindThis
	public async cancel(redPacketId: string, me: Viewer) {
		const packet = await this.withPacketTransaction(redPacketId, undefined, async (em, locked) => {
			if (locked.userId !== me.id) throw new RedPacketService.AccessDeniedError();
			await this.cancelInTransaction(em, [locked.id]);
			return locked;
		});
		return this.details(packet, me);
	}

	/** Account deletion settles only packets issued by that account. */
	@bindThis
	public async refundForAccountDeletion(userId: string): Promise<void> {
		for (;;) {
			const packets = await this.db.getRepository(MiRedPacket).find({ where: { userId, status: 'active' }, order: { id: 'ASC' }, take: 100 });
			if (packets.length === 0) return;
			for (const candidate of packets) {
				await this.withPacketTransaction(candidate.id, undefined, async (em, packet) => this.refund(em, packet, 'cancelled'));
			}
		}
	}

	private async details(packet: MiRedPacket, me: Viewer) {
		const snapshot = await this.db.transaction('REPEATABLE READ', async em => ({
			packet: await em.findOneByOrFail(MiRedPacket, { id: packet.id }),
			claims: await em.find(MiRedPacketClaim, { where: { redPacketId: packet.id }, relations: { user: true }, order: { id: 'DESC' } }),
		}));
		const claims = snapshot.claims;
		const users = await this.userEntityService.packMany(claims.flatMap(claim => claim.user ? [claim.user] : []), me);
		const usersById = new Map<string, Packed<'UserLite'>>(users.map(user => [user.id, user]));
		return {
			...this.summarize(snapshot.packet, claims.find(claim => claim.userId === me.id)?.coins ?? null),
			claims: claims.map(claim => ({
				id: claim.id, coins: claim.coins, createdAt: claim.createdAt.toISOString(),
				user: claim.userId ? usersById.get(claim.userId) ?? null : null,
			})),
		};
	}

	@bindThis
	public async show(redPacketId: string, me: Viewer) {
		const packet = await this.withPacketTransaction(redPacketId, me, async (em, locked) => {
			if (locked.status === 'active' && locked.expiresAt.getTime() <= Date.now()) await this.refund(em, locked, 'expired');
			return locked;
		});
		return this.details(packet, me);
	}

	@bindThis
	public async claim(redPacketId: string, me: Viewer, password?: string) {
		const result = await this.claimWithContext(redPacketId, me, { password });
		return this.details(result.packet, me);
	}

	/** 适配层的附加权限检查在红包锁内执行，与领取共用事务。 */
	@bindThis
	public async claimWithContext(redPacketId: string, me: Viewer, context: RedPacketClaimContext = {}): Promise<{ packet: MiRedPacket; coins: number; created: boolean }> {
		const result = await this.withPacketTransaction(redPacketId, me, async (em, packet) => {
			if (packet.password != null) {
				// 定向口令只允许收件人领取，发送者仅有查看权限。
				if (packet.audience === 'recipients' && !await em.existsBy(MiRedPacketRecipient, { redPacketId: packet.id, userId: me.id })) throw new RedPacketService.AccessDeniedError();
				if (context.password?.trim() !== packet.password) throw new RedPacketService.PasswordRequiredError();
			}
			await context.beforeClaim?.(em, packet);
			const previous = await em.findOneBy(MiRedPacketClaim, { redPacketId: packet.id, userId: me.id });
			if (previous) return { packet, error: null, coins: previous.coins, created: false };
			await this.walletService.lockWalletsInTransaction(em, [packet.userId, me.id]);
			await this.assertUsersAccess(em, packet.userId, me);
			if (packet.status === 'active' && packet.expiresAt.getTime() <= Date.now()) await this.refund(em, packet, 'expired');
			// Throw after committing the transaction, so a late claim still refunds the sender.
			if (packet.status === 'expired') return { packet, error: new RedPacketService.ExpiredError(), coins: 0, created: false };
			if (packet.status === 'cancelled') return { packet, error: new RedPacketService.CancelledError(), coins: 0, created: false };
			if (packet.status === 'exhausted') return { packet, error: new RedPacketService.ExhaustedError(), coins: 0, created: false };
			if (packet.startsAt && packet.startsAt.getTime() > Date.now()) return { packet, error: new RedPacketService.NotStartedError(), coins: 0, created: false };
			const coins = this.drawCoins(packet);
			await this.walletService.releaseReservationInTransaction(em, packet.userId, coins, { type: 'redPacketReservationRelease', relatedId: packet.id, actorId: me.id });
			await this.walletService.changeBalanceInTransaction(em, me.id, coins, {
				type: 'redPacketClaim', relatedId: packet.id, description: packet.message,
			});
			await em.insert(MiRedPacketClaim, {
				id: this.idService.gen(), redPacketId: packet.id, userId: me.id, coins, createdAt: new Date(),
			});
			packet.remainingCoins = (toCoinUnits(packet.remainingCoins) - toCoinUnits(coins)) / 100;
			packet.remainingCount--;
			if (packet.remainingCount === 0) packet.status = 'exhausted';
			await em.update(MiRedPacket, packet.id, { remainingCoins: packet.remainingCoins, remainingCount: packet.remainingCount, status: packet.status });
			return { packet, error: null, coins, created: true };
		});
		if (result.error) throw result.error;
		return { packet: result.packet, coins: result.coins, created: result.created };
	}

	private drawCoins(packet: MiRedPacket): number {
		if (packet.remainingCount === 1) return packet.remainingCoins;
		if (packet.mode === 'equal') return (toCoinUnits(packet.totalCoins) / packet.count) / 100;
		// 以分为单位的二倍均值法；随机舍入上界，避免取整造成先领偏高。
		const doubled = 2 * toCoinUnits(packet.remainingCoins);
		const maximum = Math.floor(doubled / packet.remainingCount) - 1 +
			(randomInt(packet.remainingCount) < doubled % packet.remainingCount ? 1 : 0);
		return randomInt(1, maximum + 1) / 100;
	}

	@bindThis
	public sweepExpired(): Promise<void> {
		this.expirationSweep ??= this.runExpirationSweep().finally(() => { this.expirationSweep = undefined; });
		return this.expirationSweep;
	}

	private async runExpirationSweep(): Promise<void> {
		const expired = await this.db.getRepository(MiRedPacket).find({
			where: { status: 'active', expiresAt: LessThanOrEqual(new Date()) },
			order: { expiresAt: 'ASC', id: 'ASC' }, take: 1000,
		});
		for (const candidate of expired) {
			try {
				await this.withPacketTransaction(candidate.id, undefined, async (em, packet) => {
					if (packet.expiresAt.getTime() <= Date.now()) await this.refund(em, packet, 'expired');
				});
			} catch (err) {
				this.logger.error(`Failed to refund red packet ${candidate.id}`, { error: err });
			}
		}
	}
}
