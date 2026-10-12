/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { formatRedemptionCode } from '@/core/order/redemption-code.js';
import { ProductService } from '@/core/product/ProductService.js';
import { OrderService } from '@/core/order/OrderService.js';
import { PaymentService } from '@/core/payment/PaymentService.js';
import {
	COMMERCE_MAX_ORDER_TOTAL, COMMERCE_MAX_QUANTITY, COMMERCE_REQUEST_ID_PATTERN,
	LimitError, NoSuchProductError, NotAllowedError,
	PriceChangedError, RequestConflictError, canTrade, purchaseAvailability,
} from '@/core/commerce/types.js';

/** 同库事务编排。商品、订单和支付各自封装存储，原子性由此边界维护。 */
@Injectable()
export class CheckoutService {
	constructor(
		@Inject(DI.db) private db: DataSource,
		private productService: ProductService,
		private orderService: OrderService,
		private paymentService: PaymentService,
	) {}

	public async purchase(userId: string, productId: string, quantity: number, requestId: string, expectedPrice: number, expectedVersion: string) {
		if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > COMMERCE_MAX_QUANTITY) throw new LimitError();
		if (!Number.isSafeInteger(expectedPrice) || expectedPrice < 1 || expectedPrice > 1_000_000) throw new PriceChangedError();
		if (!new RegExp(COMMERCE_REQUEST_ID_PATTERN).test(requestId)) throw new RequestConflictError();
		const total = expectedPrice * quantity;
		if (!Number.isSafeInteger(total) || total > COMMERCE_MAX_ORDER_TOTAL) throw new LimitError();
		const normalizedRequestId = requestId.toLowerCase();
		return this.db.transaction(async manager => {
			const knownOrder = await this.orderService.findRequest(manager, userId, normalizedRequestId);
			const knownProduct = knownOrder ? null : await this.productService.findForPurchase(manager, productId);
			const sellerId = knownOrder ? null : knownProduct?.sellerId ?? null;
			if (!knownOrder && !sellerId) throw new NoSuchProductError();
			if (sellerId === userId) throw new NotAllowedError();
			// 先按既有支付协议排序锁全部用户及钱包，再锁商品，避免双向购买与转账死锁。
			await this.paymentService.lockParticipants(manager, sellerId ? [userId, sellerId] : [userId]);
			const user = await manager.findOneBy(MiUser, { id: userId });
			if (!canTrade(user)) throw new NotAllowedError();
			const existing = await this.orderService.findRequest(manager, userId, normalizedRequestId);
			if (existing) {
				if (existing.productId !== productId || existing.quantity !== quantity || existing.total !== total || existing.receipt.version !== expectedVersion) throw new RequestConflictError();
				return { productId, quantity, points: await this.paymentService.balance(manager, userId), purchased: false, orderId: existing.id, deliveryText: existing.receipt.deliveryText, redemptionCode: existing.redemptionCode ? formatRedemptionCode(existing.redemptionCode) : null, feeRateBps: existing.feeRateBps, platformFee: existing.platformFee, sellerAmount: existing.sellerAmount };
			}
			if (!sellerId) throw new NoSuchProductError();
			const product = await this.productService.lockForPurchase(manager, productId, sellerId);
			if (product.price !== expectedPrice || product.version !== expectedVersion) throw new PriceChangedError();
			if (!Number.isSafeInteger(Number(product.soldCount) + quantity)) throw new LimitError();
			const quantities = await this.orderService.purchasedQuantities(manager, userId, [productId]);
			if (quantity > purchaseAvailability(product, quantities.get(productId) ?? 0).maxQuantity) throw new LimitError();
			const quote = await this.paymentService.quote(manager, total);
			const order = await this.orderService.create(manager, {
				buyerId: userId, sellerId, productId, requestId: normalizedRequestId, transactionId: null, sellerTransactionId: null,
				createdAt: new Date(), quantity, ...quote,
				receipt: { name: product.name, type: product.type, unit: product.unit, deliveryText: product.deliveryText, version: product.version },
			});
			const payment = await this.paymentService.settle(manager, userId, sellerId, order.id, product.name, quote);
			await this.orderService.attachPayment(manager, order.id, payment);
			await this.productService.recordSale(manager, product, quantity);
			return { productId, quantity, points: payment.points, purchased: true, orderId: order.id, deliveryText: order.receipt.deliveryText, redemptionCode: order.redemptionCode ? formatRedemptionCode(order.redemptionCode) : null, feeRateBps: order.feeRateBps, platformFee: order.platformFee, sellerAmount: order.sellerAmount };
		});
	}
}
