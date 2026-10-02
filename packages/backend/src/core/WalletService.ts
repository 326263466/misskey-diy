/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, LessThan, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiWallet } from '@/models/Wallet.js';
import { MiWalletSettings } from '@/models/WalletSettings.js';
import { MiWalletTransaction, type WalletTransactionType } from '@/models/WalletTransaction.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';

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

function packTransaction(transaction: MiWalletTransaction) {
	return {
		id: transaction.id, createdAt: transaction.createdAt.toISOString(), type: transaction.type,
		amount: transaction.amount, balance: transaction.balance, description: transaction.description,
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
			const profile = await manager.findOneByOrFail(MiUserProfile, { userId });
			const settings = await this.getSettings(manager);
			return { balance: wallet?.balance ?? 0, reservedBalance: wallet?.reservedBalance ?? 0, points: profile.checkinPoints, ...settings };
		});
	}

	@bindThis
	public async getSettings(manager: EntityManager = this.db.manager) {
		const settings = await manager.findOneBy(MiWalletSettings, { id: 'default' });
		return { exchangeEnabled: settings?.exchangeEnabled ?? true, exchangeRate: settings?.exchangeRate ?? 1 };
	}

	@bindThis
	public async updateSettings(settings: { exchangeEnabled: boolean; exchangeRate: number }) {
		if (typeof settings.exchangeEnabled !== 'boolean' || !Number.isSafeInteger(settings.exchangeRate) || settings.exchangeRate < 1 || settings.exchangeRate > WALLET_MAX_EXCHANGE_RATE) {
			throw new WalletService.InvalidSettingsError();
		}
		const values = { exchangeEnabled: settings.exchangeEnabled, exchangeRate: settings.exchangeRate };
		await this.db.getRepository(MiWalletSettings).upsert({ id: 'default', ...values }, ['id']);
		return values;
	}

	@bindThis
	public async transactions(userId: string, limit: number, untilId?: string) {
		const rows = await this.db.getRepository(MiWalletTransaction).find({
			where: { userId, ...(untilId ? { id: LessThan(untilId) } : {}) }, order: { id: 'DESC' }, take: limit,
		});
		return rows.map(packTransaction);
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

	@bindThis
	public async changeBalanceInTransaction(manager: EntityManager, userId: string, amount: number, options: BalanceChange): Promise<number> {
		this.validateAmount(amount);
		if ((options.type === 'exchange' || options.type === 'redPacketClaim') && amount < 0) throw new WalletService.InvalidAmountError();
		if (options.requestId != null) this.validateRequestId(options.requestId);
		if (options.description != null && Array.from(options.description).length > 500) throw new WalletService.InvalidAmountError();
		await this.lockWalletsInTransaction(manager, [userId]);
		const wallet = await manager.findOneByOrFail(MiWallet, { userId });
		if (options.requestId) {
			const existing = await manager.findOneBy(MiWalletTransaction, { userId, requestId: options.requestId.toLowerCase() });
			if (existing) {
				this.assertSameRequest(existing, amount, options);
				return wallet.balance;
			}
		}
		const balance = wallet.balance + amount;
		let reservedBalance = wallet.reservedBalance;
		if (options.type === 'redPacketSend') {
			if (amount >= 0) throw new WalletService.InvalidAmountError();
			reservedBalance -= amount;
		} else if (options.type === 'redPacketRefund') {
			if (amount <= 0) throw new WalletService.InvalidAmountError();
			if (reservedBalance < amount) throw new WalletService.InsufficientReservationError();
			reservedBalance -= amount;
		}
		if (balance < 0) throw new WalletService.InsufficientBalanceError();
		if (!Number.isSafeInteger(balance + reservedBalance) || balance + reservedBalance > WALLET_MAX_BALANCE) throw new WalletService.BalanceLimitError();
		await manager.update(MiWallet, { userId }, { balance, reservedBalance });
		await manager.insert(MiWalletTransaction, {
			id: this.idService.gen(), userId, createdAt: new Date(), type: options.type, amount, balance,
			description: options.description ?? null, relatedId: options.relatedId ?? null,
			requestId: options.requestId?.toLowerCase() ?? null, actorId: options.actorId ?? null, pointsSpent: options.pointsSpent ?? null,
		});
		return balance;
	}

	@bindThis
	public async releaseReservationInTransaction(manager: EntityManager, userId: string, amount: number): Promise<void> {
		this.validateAmount(amount);
		if (amount <= 0) throw new WalletService.InvalidAmountError();
		await this.lockWalletsInTransaction(manager, [userId]);
		const wallet = await manager.findOneByOrFail(MiWallet, { userId });
		if (wallet.reservedBalance < amount) throw new WalletService.InsufficientReservationError();
		await manager.update(MiWallet, { userId }, { reservedBalance: wallet.reservedBalance - amount });
	}

	@bindThis
	public async exchange(userId: string, points: number, requestId: string) {
		this.validateAmount(points);
		if (points <= 0) throw new WalletService.InvalidAmountError();
		this.validateRequestId(requestId);
		return this.db.transaction(async manager => {
			await this.lockWalletsInTransaction(manager, [userId]);
			const user = await manager.findOneByOrFail(MiUser, { id: userId });
			if (user.isSuspended || user.isDeleted || user.movedToUri || user.username.includes('.')) throw new WalletService.NotAllowedError();
			// Check-in and makeup-card exchanges hold this same user row lock before changing points.
			const profile = await manager.findOneByOrFail(MiUserProfile, { userId });
			const existing = await manager.findOneBy(MiWalletTransaction, { userId, requestId: requestId.toLowerCase() });
			if (existing) {
				if (existing.type !== 'exchange' || existing.pointsSpent !== points) throw new WalletService.RequestConflictError();
				const wallet = await manager.findOneByOrFail(MiWallet, { userId });
				return { balance: wallet.balance, points: profile.checkinPoints, exchanged: false, amount: 0 };
			}
			const settings = await this.getSettings(manager);
			if (!settings.exchangeEnabled) throw new WalletService.ExchangeDisabledError();
			if (profile.checkinPoints < points) throw new WalletService.InsufficientPointsError();
			const amount = points * settings.exchangeRate;
			if (!Number.isSafeInteger(amount) || amount > WALLET_MAX_BALANCE) throw new WalletService.BalanceLimitError();
			const balance = await this.changeBalanceInTransaction(manager, userId, amount, { type: 'exchange', pointsSpent: points, requestId });
			await manager.update(MiUserProfile, { userId }, { checkinPoints: profile.checkinPoints - points });
			return { balance, points: profile.checkinPoints - points, exchanged: true, amount };
		});
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
		if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > WALLET_MAX_BALANCE) throw new WalletService.InvalidAmountError();
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
