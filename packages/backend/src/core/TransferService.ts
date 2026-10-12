/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource, LessThan, LessThanOrEqual, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { isCoinAmount } from '@/misc/coins.js';
import { MiTransfer } from '@/models/Transfer.js';
import { MiUser } from '@/models/User.js';
import { MiBlocking } from '@/models/Blocking.js';
import { IdService } from '@/core/IdService.js';
import { WalletService, WALLET_MAX_BALANCE, WALLET_REQUEST_ID_PATTERN } from '@/core/WalletService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

export type TransferDraft = { recipientId: string; amount: number; message?: string; requestId: string };

function pack(transfer: MiTransfer) {
	return {
		id: transfer.id, senderId: transfer.senderId, recipientId: transfer.recipientId,
		amount: transfer.amount, message: transfer.message, status: transfer.status,
		createdAt: transfer.createdAt.toISOString(), expiresAt: transfer.expiresAt.toISOString(),
		completedAt: transfer.completedAt?.toISOString() ?? null,
	};
}

@Injectable()
export class TransferService implements OnApplicationBootstrap, OnApplicationShutdown {
	public static InvalidDraftError = class extends Error {};
	public static RequestConflictError = class extends Error {};
	public static NoSuchTransferError = class extends Error {};
	public static AccessDeniedError = class extends Error {};
	public static AlreadyCompletedError = class extends Error {};
	private timer: ReturnType<typeof setInterval> | undefined;
	private sweep: Promise<void> | undefined;
	private logger: Logger;

	constructor(
		@Inject(DI.db) private db: DataSource,
		private idService: IdService,
		private walletService: WalletService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('transfer');
	}

	public onApplicationBootstrap(): void {
		const run = () => this.sweepExpired().catch(error => this.logger.error('Failed to refund expired transfers', { error }));
		void run();
		this.timer = setInterval(() => { void run(); }, 60_000);
		this.timer.unref();
	}

	public async onApplicationShutdown(): Promise<void> {
		if (this.timer) clearInterval(this.timer);
		await this.sweep;
	}

	@bindThis
	public async create(draft: TransferDraft, senderId: string) {
		if (!isCoinAmount(draft.amount) || draft.amount < 0.01 || draft.amount > WALLET_MAX_BALANCE ||
			!new RegExp(WALLET_REQUEST_ID_PATTERN).test(draft.requestId) ||
			typeof draft.recipientId !== 'string' || !draft.recipientId || draft.recipientId.length > 32 ||
			(draft.message != null && (typeof draft.message !== 'string' || [...draft.message].length > 200))) throw new TransferService.InvalidDraftError();
		const requestId = draft.requestId.toLowerCase();
		const message = draft.message?.trim() || null;
		return this.db.transaction(async manager => {
			// 与钱包和红包统一按用户 ID 排序取锁，避免相互转账死锁。
			await this.walletService.lockWalletsInTransaction(manager, [senderId, draft.recipientId]);
			const existing = await manager.findOneBy(MiTransfer, { senderId, requestId });
			if (existing) {
				if (existing.recipientId !== draft.recipientId || existing.amount !== draft.amount || existing.message !== message) throw new TransferService.RequestConflictError();
				return pack(existing);
			}
			for (const id of new Set([senderId, draft.recipientId])) {
				const user = await manager.findOneByOrFail(MiUser, { id });
				if (user.isDeleted || user.isSuspended || user.movedToUri || user.username.includes('.')) throw new TransferService.AccessDeniedError();
			}
			if (await manager.existsBy(MiBlocking, [{ blockerId: senderId, blockeeId: draft.recipientId }, { blockerId: draft.recipientId, blockeeId: senderId }])) throw new TransferService.AccessDeniedError();
			const now = new Date();
			const transfer = manager.create(MiTransfer, {
				id: this.idService.gen(now.getTime()), senderId, recipientId: draft.recipientId, requestId,
				amount: draft.amount, message, createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
				status: 'pending', completedAt: null,
			});
			await this.walletService.changeBalanceInTransaction(manager, senderId, -draft.amount, { type: 'transferSend', relatedId: transfer.id });
			await manager.insert(MiTransfer, transfer);
			return pack(transfer);
		});
	}

	@bindThis
	public async show(transferId: string, userId: string) {
		return this.settle(transferId, userId, 'show');
	}

	@bindThis
	public async accept(transferId: string, userId: string) {
		return this.settle(transferId, userId, 'accept');
	}

	@bindThis
	public async refund(transferId: string, userId: string) {
		return this.settle(transferId, userId, 'refund');
	}

	private async settle(transferId: string, userId: string | null, action: 'show' | 'accept' | 'refund' | 'expire') {
		return this.db.transaction(async manager => {
			const transfer = await manager.findOne(MiTransfer, { where: { id: transferId }, lock: { mode: 'pessimistic_write' } });
			if (!transfer) throw new TransferService.NoSuchTransferError();
			if (action !== 'expire' && userId !== transfer.recipientId && (action !== 'show' || userId !== transfer.senderId)) throw new TransferService.AccessDeniedError();
			if (transfer.status !== 'pending') {
				if ((action === 'accept' && transfer.status === 'refunded') || (action === 'refund' && transfer.status === 'accepted')) throw new TransferService.AlreadyCompletedError();
				return pack(transfer);
			}
			// 到期检查必须在钱包锁到手后进行，排队等待不能延长领取期限。
			const ids = action === 'accept' ? [transfer.senderId, transfer.recipientId] : [transfer.senderId];
			await this.walletService.lockWalletsInTransaction(manager, ids);
			const now = new Date();
			if (transfer.expiresAt.getTime() <= now.getTime()) {
				await this.refundInTransaction(manager, transfer, now, true);
			} else if (action === 'refund') {
				await this.refundInTransaction(manager, transfer, now, false);
			} else if (action === 'accept') {
				const recipient = await manager.findOneByOrFail(MiUser, { id: transfer.recipientId });
				if (recipient.isSuspended || recipient.isDeleted || recipient.movedToUri) throw new TransferService.AccessDeniedError();
				await this.walletService.releaseReservationInTransaction(manager, transfer.senderId, transfer.amount, { type: 'transferReservationRelease', relatedId: transfer.id });
				await this.walletService.changeBalanceInTransaction(manager, transfer.recipientId, transfer.amount, { type: 'transferReceive', relatedId: transfer.id });
				transfer.status = 'accepted';
				transfer.completedAt = now;
				await manager.update(MiTransfer, { id: transfer.id }, { status: transfer.status, completedAt: now });
			}
			return pack(transfer);
		});
	}

	private async refundInTransaction(manager: EntityManager, transfer: MiTransfer, now: Date, expired: boolean) {
		await this.walletService.changeBalanceInTransaction(manager, transfer.senderId, transfer.amount, { type: 'transferRefund', relatedId: transfer.id });
		transfer.status = expired ? 'expired' : 'refunded';
		transfer.completedAt = now;
		await manager.update(MiTransfer, { id: transfer.id }, { status: transfer.status, completedAt: now });
	}

	@bindThis
	public async list(userId: string, limit: number, untilId?: string, direction?: 'sent' | 'received') {
		const pagination = untilId ? { id: LessThan(untilId) } : {};
		const rows = await this.db.getRepository(MiTransfer).find({
			where: direction === 'sent' ? { senderId: userId, ...pagination } : direction === 'received' ? { recipientId: userId, ...pagination } : [{ senderId: userId, ...pagination }, { recipientId: userId, ...pagination }],
			order: { id: 'DESC' }, take: limit,
		});
		return Promise.all(rows.map(row => this.show(row.id, userId)));
	}

	@bindThis
	public sweepExpired(): Promise<void> {
		if (this.sweep) return this.sweep;
		this.sweep = this.runSweep().finally(() => { this.sweep = undefined; });
		return this.sweep;
	}

	private async runSweep(): Promise<void> {
		let cursor: string | undefined;
		while (true) {
			const rows = await this.db.getRepository(MiTransfer).find({
				where: { status: 'pending', expiresAt: LessThanOrEqual(new Date()), ...(cursor ? { id: LessThan(cursor) } : {}) },
				order: { id: 'DESC' }, take: 100,
			});
			for (const row of rows) {
				try {
					await this.settle(row.id, null, 'expire');
				} catch (error) {
					if (!(error instanceof TransferService.NoSuchTransferError)) this.logger.error('Failed to refund transfer', { error, transferId: row.id });
				}
			}
			if (rows.length < 100) break;
			cursor = rows.at(-1)!.id;
		}
	}
}
