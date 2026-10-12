/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { WalletService, WALLET_REQUEST_ID_PATTERN } from '@/core/WalletService.js';
import { MiTip, type TipTarget } from '@/models/Tip.js';
import { MiUser } from '@/models/User.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiWallet } from '@/models/Wallet.js';
import { bindThis } from '@/decorators.js';
import { isCoinAmount } from '@/misc/coins.js';

@Injectable()
export class TipService {
	constructor(
		@Inject(DI.db) private db: DataSource,
		private idService: IdService,
		private walletService: WalletService,
	) {}

	@bindThis
	public async send(senderId: string, recipientId: string, amount: number, message: string, requestId: string, context?: { manager: EntityManager; target?: TipTarget }) {
		if (!isCoinAmount(amount) || amount < 1 || amount > 1000 || Array.from(message).length > 100 ||
			!new RegExp(WALLET_REQUEST_ID_PATTERN).test(requestId)) throw new WalletService.InvalidAmountError();
		if (senderId === recipientId) throw new WalletService.NotAllowedError();
		const description = message.trim();
		const normalizedRequestId = requestId.toLowerCase();
		const target = context?.target ?? null;
		const execute = async (manager: EntityManager) => {
			await this.walletService.lockWalletsInTransaction(manager, [senderId, recipientId]);
			const existing = await manager.findOneBy(MiTip, { senderId, requestId: normalizedRequestId });
			if (existing) {
				if (existing.recipientId !== recipientId || existing.amount !== amount || existing.message !== (description || null) ||
					existing.targetType !== (target?.targetType ?? null) || existing.targetId !== (target?.targetId ?? null)) {
					throw new WalletService.RequestConflictError();
				}
				// 成功重试只核对业务凭证，避免再次写入任一方的流水。
				const wallet = await manager.findOneByOrFail(MiWallet, { userId: senderId });
				return { balance: wallet.balance, amount, sent: false };
			}
			const users = await manager.findBy(MiUser, { id: In([senderId, recipientId]) });
			if (users.some(user => user.isSuspended || user.isDeleted || user.movedToUri || user.username.includes('.')) ||
				await manager.existsBy(MiBlocking, [{ blockerId: senderId, blockeeId: recipientId }, { blockerId: recipientId, blockeeId: senderId }])) {
				throw new WalletService.NotAllowedError();
			}
			const tipId = this.idService.gen();
			const balance = await this.walletService.changeBalanceInTransaction(manager, senderId, -amount, {
				type: 'tipSend', description, relatedId: tipId, requestId: normalizedRequestId,
			});
			await this.walletService.changeBalanceInTransaction(manager, recipientId, amount, {
				type: 'tipReceive', description, relatedId: tipId,
			});
			await manager.insert(MiTip, {
				id: tipId, senderId, recipientId, requestId: normalizedRequestId, amount, createdAt: new Date(),
				message: description || null,
				targetType: target?.targetType ?? null, targetId: target?.targetId ?? null,
			});
			return { balance, amount, sent: true };
		};
		return context ? execute(context.manager) : this.db.transaction(execute);
	}
}
