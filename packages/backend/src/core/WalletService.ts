/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, LessThan, MoreThan, Not, type EntityManager, type FindOptionsWhere } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { MiWallet } from '@/models/Wallet.js';
import { MiWalletSettings } from '@/models/WalletSettings.js';
import { MiWalletTransaction, type WalletTransactionType } from '@/models/WalletTransaction.js';
import { MiTip } from '@/models/Tip.js';
import { MiTransfer } from '@/models/Transfer.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiRedPacketClaim } from '@/models/RedPacketClaim.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';
import { isCoinAmount, toCoinUnits } from '@/misc/coins.js';

export const WALLET_MAX_BALANCE = 2_000_000_000;
export const WALLET_MAX_EXCHANGE_RATE = 1_000_000;
export const WALLET_REQUEST_ID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

type BalanceChange = {
	type: WalletTransactionType;
	description?: string;
	relatedId?: string;
	requestId?: string;
	actorId?: string;
	pointsSpent?: number;
};

export type WalletFlowKind = 'user' | 'system' | 'redPacket' | 'reserved' | 'unknown';
export type WalletTransactionFlow = {
	from: WalletFlowKind;
	to: WalletFlowKind;
	fromUserId: string | null;
	toUserId: string | null;
};
export type WalletTransactionWithFlow = ReturnType<typeof packTransaction> & { flow: WalletTransactionFlow };

function packTransaction(transaction: MiWalletTransaction) {
	return {
		id: transaction.id, createdAt: transaction.createdAt.toISOString(), type: transaction.type,
		// Present historical coins rows in the unified points namespace.
		currency: 'points' as const, amount: transaction.amount, balance: transaction.balance,
		reservedAmount: transaction.reservedAmount, reservedBalance: transaction.reservedBalance, description: transaction.description,
		relatedId: transaction.relatedId, pointsSpent: transaction.pointsSpent, actorId: transaction.actorId,
	};
}

@Injectable()
export class WalletService {
	public static InvalidAmountError = class extends Error {};
	public static InsufficientBalanceError = class extends Error {};
	public static BalanceLimitError = class extends Error {};
	public static InsufficientPointsError = class extends Error {};
	public static ExchangeDisabledError = class extends Error {};
	public static RequestConflictError = class extends Error {};
	public static NoSuchUserError = class extends Error {};
	public static NotAllowedError = class extends Error {};
	public static InvalidSettingsError = class extends Error {};
	public static InsufficientReservationError = class extends Error {};

	constructor(
		@Inject(DI.db) private db: DataSource,
		private idService: IdService,
	) {
	}

	@bindThis
	public async show(userId: string) {
		return this.db.transaction('REPEATABLE READ', async manager => {
			const wallet = await manager.findOneBy(MiWallet, { userId });
			const settings = await this.getSettings(manager);
			const balance = wallet?.balance ?? 0;
			return { balance, reservedBalance: wallet?.reservedBalance ?? 0, points: balance, ...settings };
		});
	}

	@bindThis
	public async getSettings(manager: EntityManager = this.db.manager) {
		const settings = await manager.findOneBy(MiWalletSettings, { id: 'default' });
		const pointsPerCoin = settings == null ? 1 : settings.pointsPerCoin;
		// The legacy coins exchange is permanently disabled after points unification.
		return { exchangeEnabled: false, exchangeRate: pointsPerCoin == null ? settings?.exchangeRate ?? 1 : 1 / pointsPerCoin, pointsPerCoin };
	}

	@bindThis
	public async updateSettings(settings: { exchangeEnabled: boolean; exchangeRate?: number; pointsPerCoin?: number }) {
		const rate = settings.pointsPerCoin ?? settings.exchangeRate;
		if (typeof settings.exchangeEnabled !== 'boolean' || (settings.pointsPerCoin != null) === (settings.exchangeRate != null) ||
			!Number.isSafeInteger(rate) || rate == null || rate < 1 || rate > WALLET_MAX_EXCHANGE_RATE) {
			throw new WalletService.InvalidSettingsError();
		}
		const values = { exchangeEnabled: false, exchangeRate: settings.exchangeRate ?? 1, pointsPerCoin: settings.pointsPerCoin ?? null };
		await this.db.getRepository(MiWalletSettings).upsert({ id: 'default', ...values }, ['id']);
		return { exchangeEnabled: values.exchangeEnabled, exchangeRate: values.pointsPerCoin == null ? values.exchangeRate : 1 / values.pointsPerCoin, pointsPerCoin: values.pointsPerCoin };
	}

	@bindThis
	public async transactions(userId: string, limit: number, untilId?: string, category: 'all' | 'income' | 'expense' | 'transfer' | 'online' = 'all') {
		const rows = await this.findTransactions(userId, limit, untilId, category);
		return rows.map(packTransaction);
	}

	/**
	 * Packs the business direction of each ledger row without packing users. The
	 * API endpoint resolves the returned participant IDs through UserEntityService.
	 */
	@bindThis
	public async transactionsWithFlow(userId: string, limit: number, untilId?: string, category: 'all' | 'income' | 'expense' | 'transfer' | 'online' = 'all'): Promise<WalletTransactionWithFlow[]> {
		const rows = await this.findTransactions(userId, limit, untilId, category);
		if (rows.length === 0) return [];
		const flows = await this.resolveFlows(userId, rows);
		return rows.map((row, index) => ({ ...packTransaction(row), flow: flows[index] }));
	}

	private async findTransactions(userId: string, limit: number, untilId: string | undefined, category: 'all' | 'income' | 'expense' | 'transfer' | 'online') {
		const where: FindOptionsWhere<MiWalletTransaction> = { userId, type: Not('pointsUnification'), ...(untilId ? { id: LessThan(untilId) } : {}) };
		if (category === 'income') where.amount = MoreThan(0);
		if (category === 'expense') where.amount = LessThan(0);
		if (category === 'transfer') where.type = In(['transferSend', 'transferReceive', 'transferRefund', 'transferReservationRelease']);
		if (category === 'online') where.type = In(['redPacketSend', 'redPacketClaim', 'redPacketRefund', 'redPacketReservationRelease', 'tipSend', 'tipReceive']);
		return this.db.getRepository(MiWalletTransaction).find({ where, order: { id: 'DESC' }, take: limit });
	}

	private async resolveFlows(userId: string, rows: MiWalletTransaction[]): Promise<WalletTransactionFlow[]> {
		const idsFor = (...types: WalletTransactionType[]) => [...new Set(rows.filter(row => types.includes(row.type)).map(row => row.relatedId).filter((id): id is string => id != null))];
		const tipIds = idsFor('tipSend', 'tipReceive');
		const transferIds = idsFor('transferSend', 'transferReceive', 'transferRefund', 'transferReservationRelease');
		const packetIds = idsFor('redPacketSend', 'redPacketClaim', 'redPacketRefund', 'redPacketReservationRelease');
		const [tips, transfers, packets, claims] = await Promise.all([
			tipIds.length ? this.db.getRepository(MiTip).findBy({ id: In(tipIds) }) : [],
			transferIds.length ? this.db.getRepository(MiTransfer).findBy({ id: In(transferIds) }) : [],
			packetIds.length ? this.db.getRepository(MiRedPacket).findBy({ id: In(packetIds) }) : [],
			packetIds.length ? this.db.getRepository(MiRedPacketClaim).findBy({ redPacketId: In(packetIds) }) : [],
		]);
		const tipById = new Map(tips.map(row => [row.id, row]));
		const transferById = new Map(transfers.map(row => [row.id, row]));
		const packetById = new Map(packets.map(row => [row.id, row]));
		const claimsByPacket = new Map<string, MiRedPacketClaim[]>();
		for (const claim of claims) claimsByPacket.set(claim.redPacketId, [...(claimsByPacket.get(claim.redPacketId) ?? []), claim]);
		const userIds = new Set<string>();
		const flows = rows.map(row => {
			const flow = this.resolveFlow(userId, row, tipById, transferById, packetById, claimsByPacket);
			if (flow.fromUserId) userIds.add(flow.fromUserId);
			if (flow.toUserId) userIds.add(flow.toUserId);
			return flow;
		});
		if (userIds.size > 0) {
			const validUsers = await this.db.getRepository(MiUser).findBy({ id: In([...userIds]) });
			const validIds = new Set(validUsers.filter(user => !user.isDeleted).map(user => user.id));
			for (const flow of flows) {
				if (flow.fromUserId && !validIds.has(flow.fromUserId)) { flow.from = 'unknown'; flow.fromUserId = null; }
				if (flow.toUserId && !validIds.has(flow.toUserId)) { flow.to = 'unknown'; flow.toUserId = null; }
			}
		}
		return flows;
	}

	private resolveFlow(
		userId: string,
		row: MiWalletTransaction,
		tips: Map<string, MiTip>,
		transfers: Map<string, MiTransfer>,
		packets: Map<string, MiRedPacket>,
		claims: Map<string, MiRedPacketClaim[]>,
	): WalletTransactionFlow {
		const user = (from: string | null, to: string | null): WalletTransactionFlow => ({ from: from ? 'user' : 'unknown', to: to ? 'user' : 'unknown', fromUserId: from, toUserId: to });
		const system = (positive: boolean): WalletTransactionFlow => positive ? { from: 'system', to: 'user', fromUserId: null, toUserId: userId } : { from: 'user', to: 'system', fromUserId: userId, toUserId: null };
		const unknown = (): WalletTransactionFlow => ({ from: 'unknown', to: 'unknown', fromUserId: null, toUserId: null });
		const relatedId = row.relatedId;
		if (row.type === 'tipSend' || row.type === 'tipReceive') {
			const tip = relatedId ? tips.get(relatedId) : undefined;
			if (tip && ((row.type === 'tipSend' && tip.senderId === userId) || (row.type === 'tipReceive' && tip.recipientId === userId))) {
				return user(row.type === 'tipSend' ? userId : tip.senderId, row.type === 'tipSend' ? tip.recipientId : userId);
			}
			return unknown();
		}
		const transfer = relatedId ? transfers.get(relatedId) : undefined;
		if (row.type === 'transferSend' && transfer?.senderId === userId) return user(userId, transfer.recipientId);
		if (row.type === 'transferReceive' && transfer?.recipientId === userId) return user(transfer.senderId, userId);
		if (row.type === 'transferReservationRelease' && transfer?.senderId === userId && transfer.status === 'accepted') return user(userId, transfer.recipientId);
		if (row.type === 'transferRefund' && transfer?.senderId === userId && ['refunded', 'expired'].includes(transfer.status)) return { from: 'reserved', to: 'user', fromUserId: null, toUserId: userId };
		const packet = relatedId ? packets.get(relatedId) : undefined;
		if (row.type === 'redPacketSend' && packet?.userId === userId) {
			return { from: 'user', to: 'redPacket', fromUserId: userId, toUserId: null };
		}
		if (row.type === 'redPacketClaim' && packet && (claims.get(packet.id) ?? []).some(claim => claim.userId === userId)) return user(packet.userId, userId);
		if (row.type === 'redPacketRefund' && packet?.userId === userId) return { from: 'redPacket', to: 'user', fromUserId: null, toUserId: userId };
		if (row.type === 'redPacketReservationRelease' && packet?.userId === userId) {
			const claim = row.actorId && (claims.get(packet.id) ?? []).find(item => item.userId === row.actorId);
			return claim ? user(userId, claim.userId) : { from: 'user', to: 'redPacket', fromUserId: userId, toUserId: null };
		}
		if (row.type === 'orderPayment' && row.amount < 0) return user(userId, row.actorId);
		if (row.type === 'orderIncome' && row.amount > 0) return user(row.actorId, userId);
		if (row.type === 'adminAdjustment' || row.type === 'checkinReward' || row.type === 'checkinAdminGrant' || row.type === 'exchange' || row.type === 'pointsOpeningBalance' || row.type === 'checkinMakeupExchange' || row.type === 'checkinAdminRevoke') return system(row.amount > 0);
		return unknown();
	}

	/** Lock every participant before transferring, in the same order in every transaction. */
	@bindThis
	public async lockWalletsInTransaction(manager: EntityManager, userIds: string[]): Promise<void> {
		if (!manager.queryRunner?.isTransactionActive) throw new Error('Wallet mutations require an active transaction.');
		const ids = [...new Set(userIds)].sort();
		for (const userId of ids) {
			const user = await manager.findOne(MiUser, { where: { id: userId }, lock: { mode: 'for_no_key_update' } });
			if (!user) throw new WalletService.NoSuchUserError();
			if (user.host !== null) throw new WalletService.NotAllowedError();
		}
		for (const userId of ids) {
			await manager.createQueryBuilder().insert().into(MiWallet).values({ userId, balance: 0, reservedBalance: 0 }).orIgnore().execute();
			await manager.findOneOrFail(MiWallet, { where: { userId }, lock: { mode: 'pessimistic_write' } });
		}
	}

	/** Return the canonical points balance while participating in an active transaction. */
	@bindThis
	public async getBalanceInTransaction(manager: EntityManager, userId: string): Promise<number> {
		// Reads must stay side-effect free: inserting a missing wallet here can
		// serialize-conflict with a concurrent balance update under REPEATABLE READ.
		const wallet = await manager.findOneBy(MiWallet, { userId });
		return wallet?.balance ?? 0;
	}

	@bindThis
	public async changeBalanceInTransaction(manager: EntityManager, userId: string, amount: number, options: BalanceChange): Promise<number> {
		this.validateAmount(amount);
		if ((options.type === 'exchange' || options.type === 'redPacketClaim' || options.type === 'tipReceive' || options.type === 'transferReceive' || options.type === 'orderIncome') && amount < 0) throw new WalletService.InvalidAmountError();
		if ((options.type === 'tipSend' || options.type === 'orderPayment') && amount > 0) throw new WalletService.InvalidAmountError();
		if (options.requestId != null) this.validateRequestId(options.requestId);
		if (options.description != null && Array.from(options.description).length > 500) throw new WalletService.InvalidAmountError();
		await this.lockWalletsInTransaction(manager, [userId]);
		const wallet = await manager.findOneByOrFail(MiWallet, { userId });
		if (options.requestId) {
			// Query all currencies so a request cannot be replayed after the legacy
			// coins account has been unified into points.
			const existing = await manager.findOneBy(MiWalletTransaction, { userId, requestId: options.requestId.toLowerCase() });
			if (existing) {
				this.assertSameRequest(existing, amount, options);
				return wallet.balance;
			}
		}
		const units = toCoinUnits(amount);
		const balanceUnits = toCoinUnits(wallet.balance) + units;
		const previousReservedUnits = toCoinUnits(wallet.reservedBalance);
		let reservedUnits = previousReservedUnits;
		if (options.type === 'redPacketSend' || options.type === 'transferSend') {
			if (amount >= 0) throw new WalletService.InvalidAmountError();
			reservedUnits -= units;
		} else if (options.type === 'redPacketRefund' || options.type === 'transferRefund') {
			if (amount <= 0) throw new WalletService.InvalidAmountError();
			if (reservedUnits < units) throw new WalletService.InsufficientReservationError();
			reservedUnits -= units;
		}
		if (balanceUnits < 0) throw new WalletService.InsufficientBalanceError();
		if (!Number.isSafeInteger(balanceUnits + reservedUnits) || balanceUnits + reservedUnits > toCoinUnits(WALLET_MAX_BALANCE)) throw new WalletService.BalanceLimitError();
		const balance = balanceUnits / 100;
		const reservedBalance = reservedUnits / 100;
		await manager.update(MiWallet, { userId }, { balance, reservedBalance });
		await manager.insert(MiWalletTransaction, {
			id: this.idService.gen(), userId, createdAt: new Date(), type: options.type, currency: 'points', amount, balance,
			reservedAmount: (reservedUnits - previousReservedUnits) / 100, reservedBalance,
			description: options.description ?? null, relatedId: options.relatedId ?? null,
			requestId: options.requestId?.toLowerCase() ?? null, actorId: options.actorId ?? null, pointsSpent: options.pointsSpent ?? null,
		});
		return balance;
	}

	@bindThis
	public async releaseReservationInTransaction(manager: EntityManager, userId: string, amount: number, options: { type: 'redPacketReservationRelease' | 'transferReservationRelease'; relatedId: string; actorId?: string }): Promise<void> {
		this.validateAmount(amount);
		if (amount <= 0) throw new WalletService.InvalidAmountError();
		await this.lockWalletsInTransaction(manager, [userId]);
		const wallet = await manager.findOneByOrFail(MiWallet, { userId });
		const remainingUnits = toCoinUnits(wallet.reservedBalance) - toCoinUnits(amount);
		if (remainingUnits < 0) throw new WalletService.InsufficientReservationError();
		const reservedBalance = remainingUnits / 100;
		await manager.update(MiWallet, { userId }, { reservedBalance });
		await manager.insert(MiWalletTransaction, {
			id: this.idService.gen(), userId, createdAt: new Date(), type: options.type, currency: 'points', amount: 0,
			balance: wallet.balance, reservedAmount: -amount, reservedBalance,
			description: null, relatedId: options.relatedId, requestId: null, actorId: options.actorId ?? null, pointsSpent: null,
		});
	}

	/** Change the canonical points balance and append a points ledger row atomically. */
	@bindThis
	public async changePointsInTransaction(manager: EntityManager, userId: string, amount: number, options: { type: WalletTransactionType; description?: string; relatedId?: string; requestId?: string; actorId?: string }): Promise<number> {
		if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > WALLET_MAX_BALANCE) throw new WalletService.InvalidAmountError();
		try {
			return await this.changeBalanceInTransaction(manager, userId, amount, {
				...options,
				pointsSpent: amount < 0 ? -amount : undefined,
			});
		} catch (error) {
			if (amount < 0 && error instanceof WalletService.InsufficientBalanceError) {
				throw new WalletService.InsufficientPointsError();
			}
			throw error;
		}
	}

	@bindThis
	public async exchange(userId: string, points: number, requestId: string): Promise<never> {
		if (!Number.isSafeInteger(points) || points <= 0 || points > WALLET_MAX_BALANCE) throw new WalletService.InvalidAmountError();
		this.validateRequestId(requestId);
		throw new WalletService.ExchangeDisabledError();
	}

	@bindThis
	public async adjust(userId: string, amount: number, reason: string, requestId: string, actorId: string) {
		this.validateAmount(amount);
		this.validateRequestId(requestId);
		const description = reason.trim();
		if (Array.from(description).length > 500) throw new WalletService.InvalidAmountError();
		return this.db.transaction(async manager => {
			await this.lockWalletsInTransaction(manager, [userId]);
			const existing = await manager.findOneBy(MiWalletTransaction, { userId, requestId: requestId.toLowerCase() });
			const balance = await this.changeBalanceInTransaction(manager, userId, amount, { type: 'adminAdjustment', description: description || undefined, requestId, actorId });
			return { balance, adjusted: existing == null };
		});
	}

	private validateAmount(amount: number): void {
		if (!isCoinAmount(amount) || amount === 0 || Math.abs(amount) > WALLET_MAX_BALANCE) throw new WalletService.InvalidAmountError();
	}

	private validateRequestId(requestId: string): void {
		if (!new RegExp(WALLET_REQUEST_ID_PATTERN).test(requestId)) throw new WalletService.InvalidAmountError();
	}

	private assertSameRequest(existing: MiWalletTransaction, amount: number, options: BalanceChange): void {
		if (existing.amount !== amount || existing.type !== options.type || existing.description !== (options.description ?? null) ||
			existing.relatedId !== (options.relatedId ?? null) || existing.actorId !== (options.actorId ?? null) || existing.pointsSpent !== (options.pointsSpent ?? null)) {
			throw new WalletService.RequestConflictError();
		}
	}
}
