/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, LessThan, QueryFailedError, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiOrder } from '@/models/Order.js';
import { formatRedemptionCode, generateRedemptionCode } from '@/core/order/redemption-code.js';
import { NoSuchOrderError } from '@/core/commerce/types.js';
import { generateOrderNumber } from '@/core/order/order-number.js';

@Injectable()
export class OrderService {
	constructor(@Inject(DI.db) private db: DataSource) {}

	public async purchasedQuantities(manager: EntityManager, userId: string, productIds: string[]) {
		if (productIds.length === 0) return new Map<string, number>();
		const rows = await manager.createQueryBuilder(MiOrder, 'sale')
			.select('sale.productId', 'productId').addSelect('COALESCE(SUM(sale.quantity), 0)', 'quantity')
			.where('sale.buyerId = :userId AND sale.productId IN (:...productIds)', { userId, productIds })
			.groupBy('sale.productId').getRawMany<{ productId: string; quantity: string }>();
		return new Map(rows.map(row => [row.productId, Number(row.quantity)]));
	}

	public async findRequest(manager: EntityManager, buyerId: string, requestId: string) {
		return manager.findOneBy(MiOrder, { buyerId, requestId });
	}

	public async create(manager: EntityManager, values: Omit<MiOrder, 'id' | 'number' | 'redemptionCode'>) {
		// PostgreSQL 在并发、回滚和进程重启下维护唯一序列；显式转文本绕过 bigint 数值解析。
		const [{ id }] = await manager.query<{ id: string }[]>('SELECT nextval(\'order_number_seq\')::text AS id');
		for (let attempt = 0; attempt < 5; attempt++) {
			const order = manager.create(MiOrder, { ...values, id, number: generateOrderNumber(values), redemptionCode: generateRedemptionCode() });
			try {
				// 保存点让唯一编号/CDK碰撞可重试，且不会中止外层购买事务。
				await manager.transaction(async insertion => { await insertion.insert(MiOrder, order); });
				return order;
			} catch (error) {
				if (!(error instanceof QueryFailedError)) throw error;
				const { code, constraint } = error.driverError as { code?: string; constraint?: string };
				if (code !== '23505' || !['IDX_order_number', 'IDX_order_redemption_code'].includes(constraint ?? '')) throw error;
			}
		}
		throw new Error('无法生成唯一的订单号或兑换码。');
	}

	public async attachPayment(manager: EntityManager, orderId: string, payment: { transactionId: string; sellerTransactionId: string | null }) {
		await manager.update(MiOrder, { id: orderId }, { transactionId: payment.transactionId, sellerTransactionId: payment.sellerTransactionId });
	}

	private pack(order: MiOrder, userId: string) {
		return {
			id: order.id, orderNumber: order.number, createdAt: order.createdAt.toISOString(), productId: order.productId,
			name: order.receipt.name, quantity: order.quantity, total: order.total, unit: order.receipt.unit,
			feeRateBps: order.feeRateBps, platformFee: order.platformFee, sellerAmount: order.sellerAmount,
			type: order.receipt.type, deliveryText: order.receipt.deliveryText,
			sellerId: order.sellerId, buyerId: order.buyerId,
			transactionId: order.sellerId === userId ? order.sellerTransactionId : order.transactionId,
			redemptionCode: order.redemptionCode ? formatRedemptionCode(order.redemptionCode) : null,
		};
	}

	public async list(userId: string, limit: number, untilId?: string, mode: 'purchases' | 'sales' = 'purchases') {
		const rows = await this.db.getRepository(MiOrder).find({
			where: { ...(mode === 'sales' ? { sellerId: userId } : { buyerId: userId }), ...(untilId ? { id: LessThan(untilId) } : {}) }, order: { id: 'DESC' }, take: limit,
		});
		return rows.map(row => this.pack(row, userId));
	}

	public async show(userId: string, orderId: string) {
		const order = await this.db.getRepository(MiOrder).findOne({ where: [{ id: orderId, buyerId: userId }, { id: orderId, sellerId: userId }] });
		if (!order) throw new NoSuchOrderError();
		return this.pack(order, userId);
	}
}
