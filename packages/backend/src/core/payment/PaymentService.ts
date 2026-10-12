/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { WalletService } from '@/core/WalletService.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import { MiPaymentSettings } from '@/models/PaymentSettings.js';
import { MiPlatformAccount } from '@/models/PlatformAccount.js';
import { MiPlatformTransaction } from '@/models/PlatformTransaction.js';
import { toCoinUnits } from '@/misc/coins.js';
import { COMMERCE_MAX_ORDER_TOTAL, InsufficientPointsError, LimitError, NotAllowedError, RequestConflictError, SellerBalanceLimitError } from '@/core/commerce/types.js';

export const DEFAULT_FEE_RATE_BPS = 1500;
export const PLATFORM_MAX_BALANCE_UNITS = 100_000_000_000_000;
export type PaymentQuote = Readonly<{ total: number; feeRateBps: number; platformFee: number; sellerAmount: number }>;

/** 集市支付边界：领域服务只处理订单，积分账本及其幂等键由此适配。 */
@Injectable()
export class PaymentService {
	public static InvalidSettingsError = class extends Error {};
	public static PlatformBalanceLimitError = class extends Error {};

	constructor(
		@Inject(DI.db) private db: DataSource,
		private walletService: WalletService,
	) {}

	public async getSettings(manager: EntityManager = this.db.manager) {
		const settings = await manager.findOneBy(MiPaymentSettings, { id: 'default' });
		const account = await manager.findOneBy(MiPlatformAccount, { id: 'platform' });
		return { feeRateBps: settings?.feeRateBps ?? DEFAULT_FEE_RATE_BPS, platformBalance: Number(account?.balanceUnits ?? 0) / 100 };
	}

	public async updateSettings(feeRateBps: number) {
		this.validateRate(feeRateBps);
		await this.db.getRepository(MiPaymentSettings).upsert({ id: 'default', feeRateBps }, ['id']);
		return this.getSettings();
	}

	private validateRate(feeRateBps: number) {
		if (!Number.isInteger(feeRateBps) || feeRateBps < 0 || feeRateBps > 10000) throw new PaymentService.InvalidSettingsError();
	}

	private calculateQuote(total: number, feeRateBps: number): PaymentQuote {
		this.validateRate(feeRateBps);
		if (!Number.isSafeInteger(total) || total < 1 || total > COMMERCE_MAX_ORDER_TOTAL) throw new LimitError();
		const totalUnits = BigInt(total) * 100n;
		// 向上取整到最小的 0.01 积分，既保持两位小数，也避免拆单少付手续费。
		const feeUnits = (totalUnits * BigInt(feeRateBps) + 9999n) / 10000n;
		return Object.freeze({ total, feeRateBps, platformFee: Number(feeUnits) / 100, sellerAmount: Number(totalUnits - feeUnits) / 100 });
	}

	public async quote(manager: EntityManager, total: number): Promise<PaymentQuote> {
		const settings = await manager.findOneBy(MiPaymentSettings, { id: 'default' });
		return this.calculateQuote(total, settings?.feeRateBps ?? DEFAULT_FEE_RATE_BPS);
	}

	public async lockParticipants(manager: EntityManager, userIds: string[]) {
		try {
			await this.walletService.lockWalletsInTransaction(manager, userIds);
		} catch (error) {
			if (error instanceof WalletService.NoSuchUserError || error instanceof WalletService.NotAllowedError) throw new NotAllowedError();
			throw error;
		}
	}

	public async balance(manager: EntityManager, userId: string) {
		return this.walletService.getBalanceInTransaction(manager, userId);
	}

	public async settle(manager: EntityManager, buyerId: string, sellerId: string, orderId: string, name: string, quote: PaymentQuote) {
		const verified = this.calculateQuote(quote.total, quote.feeRateBps);
		if (verified.platformFee !== quote.platformFee || verified.sellerAmount !== quote.sellerAmount) throw new RequestConflictError();
		if (buyerId === sellerId) throw new NotAllowedError();
		try {
			await this.lockParticipants(manager, [buyerId, sellerId]);
			const feeUnits = toCoinUnits(quote.platformFee);
			let platformBalanceUnits = 0;
			if (feeUnits > 0) {
				// 所有支付都先锁用户及钱包，平台账户始终最后锁定。
				await manager.createQueryBuilder().insert().into(MiPlatformAccount).values({ id: 'platform', balanceUnits: 0 }).orIgnore().execute();
				const account = await manager.findOneOrFail(MiPlatformAccount, { where: { id: 'platform' }, lock: { mode: 'pessimistic_write' } });
				if (await manager.existsBy(MiPlatformTransaction, { accountId: account.id, referenceId: orderId })) throw new RequestConflictError();
				const balanceUnits = Number(account.balanceUnits);
				if (!Number.isSafeInteger(balanceUnits) || balanceUnits < 0 || feeUnits > PLATFORM_MAX_BALANCE_UNITS - balanceUnits) throw new PaymentService.PlatformBalanceLimitError();
				platformBalanceUnits = balanceUnits + feeUnits;
			}
			const buyer = await this.record(manager, buyerId, -quote.total, 'orderPayment', orderId, sellerId, `集市购买：${name}`);
			const seller = quote.sellerAmount > 0 ? await this.record(manager, sellerId, quote.sellerAmount, 'orderIncome', orderId, buyerId, `集市售出：${name}`) : null;
			if (feeUnits > 0) {
				await manager.update(MiPlatformAccount, { id: 'platform' }, { balanceUnits: platformBalanceUnits });
				await manager.insert(MiPlatformTransaction, { id: randomUUID(), accountId: 'platform', referenceId: orderId, amountUnits: feeUnits, balanceUnits: platformBalanceUnits, createdAt: new Date() });
			}
			return { points: buyer.balance, transactionId: buyer.transactionId, sellerTransactionId: seller?.transactionId ?? null };
		} catch (error) {
			if (error instanceof WalletService.InsufficientBalanceError || error instanceof WalletService.InsufficientPointsError) throw new InsufficientPointsError();
			if (error instanceof WalletService.BalanceLimitError) throw new SellerBalanceLimitError();
			throw error;
		}
	}

	private async record(manager: EntityManager, userId: string, amount: number, type: 'orderPayment' | 'orderIncome', relatedId: string, actorId: string, description: string) {
		// 客户端请求键属于订单域，支付使用独立键，避免跨业务或不同买家互相占用。
		for (let attempt = 0; attempt < 5; attempt++) {
			const requestId = randomUUID();
			if (await manager.existsBy(MiWalletTransaction, { userId, requestId })) continue;
			const balance = await this.walletService.changeBalanceInTransaction(manager, userId, amount, { type, requestId, relatedId, actorId, description, pointsSpent: amount < 0 ? -amount : undefined });
			const transaction = await manager.findOneByOrFail(MiWalletTransaction, { userId, requestId });
			return { balance, transactionId: transaction.id };
		}
		throw new Error('Unable to allocate a marketplace payment request.');
	}
}
