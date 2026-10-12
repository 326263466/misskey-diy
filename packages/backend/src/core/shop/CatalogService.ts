/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { ProductService } from '@/core/product/ProductService.js';
import { OrderService } from '@/core/order/OrderService.js';
import { PaymentService } from '@/core/payment/PaymentService.js';

/** 聚合展示所需数据，让商品与订单模块各自保有数据边界。 */
@Injectable()
export class CatalogService {
	constructor(
		@Inject(DI.db) private db: DataSource,
		private productService: ProductService,
		private orderService: OrderService,
		private paymentService: PaymentService,
	) {}

	public async list(userId: string, limit = 100, untilId?: string) {
		return this.db.transaction('REPEATABLE READ', async manager => {
			const points = await this.paymentService.balance(manager, userId);
			const page = await this.productService.list(manager, limit, untilId);
			const quantities = await this.orderService.purchasedQuantities(manager, userId, page.products.map(product => product.id));
			return {
				points, nextId: page.nextId,
				products: page.products.map(product => this.productService.pack(product, userId, quantities.get(product.id) ?? 0)),
			};
		});
	}

	public async show(userId: string, productId: string) {
		return this.db.transaction('REPEATABLE READ', async manager => {
			const product = await this.productService.findVisible(manager, userId, productId);
			const quantities = await this.orderService.purchasedQuantities(manager, userId, [product.id]);
			return this.productService.pack(product, userId, quantities.get(product.id) ?? 0, true);
		});
	}

	public async visibleParticipants(ids: string[]) {
		if (ids.length === 0) return [];
		return this.db.getRepository(MiUser).findBy({ id: In([...new Set(ids)]), isDeleted: false });
	}
}
