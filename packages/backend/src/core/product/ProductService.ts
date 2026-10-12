/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { MiProduct } from '@/models/Product.js';
import {
	COMMERCE_MAX_PRODUCTS, COMMERCE_MAX_QUANTITY, COMMERCE_REQUEST_ID_PATTERN,
	InvalidProductError, NoSuchProductError, NotAllowedError,
	PriceChangedError, ProductLimitError, RequestConflictError,
	canTrade, purchaseAvailability,
	type ProductInput,
} from '@/core/commerce/types.js';

@Injectable()
export class ProductService {
	constructor(@Inject(DI.db) private db: DataSource) {}

	public pack(product: MiProduct, userId: string, purchasedQuantity = 0, privateFields = false) {
		const isOwner = product.sellerId === userId;
		const availability = purchaseAvailability(product, purchasedQuantity);
		return {
			id: product.id, name: product.name, description: product.description, price: product.price,
			type: product.type, category: product.category, imageUrl: product.imageUrl, unit: product.unit,
			perUserLimit: product.perUserLimit, version: product.version,
			enabled: product.enabled, stockLimit: product.stockLimit, sellerId: product.sellerId, isOwner,
			// 发布人的编辑页可以读取交付说明，目录始终排除私密内容。
			deliveryText: privateFields && isOwner ? product.deliveryText : null,
			...availability,
			maxQuantity: isOwner || !product.enabled ? 0 : availability.maxQuantity,
			unavailableReason: !product.enabled ? 'unlisted' : isOwner ? 'own-product' : availability.unavailableReason,
		};
	}

	public async list(manager: EntityManager, limit: number, untilId?: string) {
		const query = manager.createQueryBuilder(MiProduct, 'product')
			.innerJoin(MiUser, 'seller', 'seller.id = product.sellerId')
			.where('product.enabled = true AND seller.host IS NULL AND seller.isSuspended = false AND seller.isDeleted = false AND seller.movedToUri IS NULL')
			.andWhere('seller.username NOT LIKE :systemName', { systemName: '%.%' });
		if (untilId) {
			const cursor = await manager.findOneBy(MiProduct, { id: untilId });
			if (!cursor) return { products: [], nextId: null };
			query.andWhere('(product.createdAt, product.id) < (:createdAt, :id)', { createdAt: cursor.createdAt, id: cursor.id });
		}
		const rows = await query.orderBy('product.createdAt', 'DESC').addOrderBy('product.id', 'DESC').take(limit + 1).getMany();
		const products = rows.slice(0, limit);
		return { products, nextId: rows.length > limit ? products.at(-1)!.id : null };
	}

	public async mine(userId: string) {
		const products = await this.db.getRepository(MiProduct).find({ where: { sellerId: userId }, order: { createdAt: 'DESC', id: 'DESC' } });
		return products.map(product => this.pack(product, userId, 0, true));
	}

	public async findVisible(manager: EntityManager, userId: string, productId: string) {
		const product = await manager.findOneBy(MiProduct, { id: productId });
		if (!product) throw new NoSuchProductError();
		const seller = product.sellerId ? await manager.findOneBy(MiUser, { id: product.sellerId }) : null;
		if (product.sellerId !== userId && (!product.enabled || !canTrade(seller))) throw new NoSuchProductError();
		return product;
	}

	private normalize(input: ProductInput): ProductInput {
		const text = (value: unknown, max: number, required = false) => {
			if (typeof value !== 'string' || value.includes('\0')) throw new InvalidProductError();
			const normalized = value.trim();
			if ((required && !normalized) || Array.from(normalized).length > max) throw new InvalidProductError();
			return normalized;
		};
		if (!['physical', 'virtual'].includes(input.type) || typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.price) || input.price < 1 || input.price > 1_000_000 ||
			![input.perUserLimit, input.stockLimit].every(value => Number.isSafeInteger(value) && value >= 0 && value <= COMMERCE_MAX_QUANTITY)) throw new InvalidProductError();
		const imageUrl = text(input.imageUrl, 2048);
		if (imageUrl && !/^https?:\/\/[^\s]+$/.test(imageUrl)) throw new InvalidProductError();
		return {
			name: text(input.name, 40, true), description: text(input.description, 200), type: input.type,
			category: text(input.category, 20), imageUrl, unit: text(input.unit, 8, true), price: input.price,
			perUserLimit: input.perUserLimit, stockLimit: input.stockLimit,
			deliveryText: text(input.deliveryText, 2000, input.enabled), enabled: input.enabled,
		};
	}

	public async create(userId: string, input: ProductInput, requestId: string) {
		const values = this.normalize(input);
		if (!new RegExp(COMMERCE_REQUEST_ID_PATTERN).test(requestId)) throw new InvalidProductError();
		const createRequestId = requestId.toLowerCase();
		const createFingerprint = createHash('sha256').update(JSON.stringify(values)).digest('hex');
		return this.db.transaction(async manager => {
			const user = await manager.findOne(MiUser, { where: { id: userId }, lock: { mode: 'for_no_key_update' } });
			if (!canTrade(user)) throw new NotAllowedError();
			const existing = await manager.findOneBy(MiProduct, { sellerId: userId, createRequestId });
			if (existing) {
				if (existing.createFingerprint !== createFingerprint) throw new RequestConflictError();
				return this.pack(existing, userId, 0, true);
			}
			if (await manager.countBy(MiProduct, { sellerId: userId }) >= COMMERCE_MAX_PRODUCTS) throw new ProductLimitError();
			const now = new Date();
			for (let attempt = 0; attempt < 5; attempt++) {
				const product = manager.create(MiProduct, { ...values, id: randomUUID().replaceAll('-', ''), sellerId: userId, createRequestId, createFingerprint, createdAt: now, updatedAt: now, version: randomUUID(), soldCount: 0 });
				const [sql, parameters] = manager.createQueryBuilder().insert().into(MiProduct).values(product).getQueryAndParameters();
				const inserted = await manager.query(`${sql} ON CONFLICT ("id") DO NOTHING RETURNING "id"`, parameters);
				if (inserted.length > 0) return this.pack(product, userId, 0, true);
			}
			throw new Error('Unable to allocate a marketplace product identifier.');
		});
	}

	public async update(userId: string, productId: string, input: ProductInput, expectedVersion: string) {
		const values = this.normalize(input);
		return this.db.transaction(async manager => {
			const user = await manager.findOne(MiUser, { where: { id: userId }, lock: { mode: 'for_no_key_update' } });
			if (!canTrade(user)) throw new NotAllowedError();
			const product = await manager.findOne(MiProduct, { where: { id: productId, sellerId: userId }, lock: { mode: 'pessimistic_write' } });
			if (!product) throw new NoSuchProductError();
			if (product.version !== expectedVersion) throw new PriceChangedError();
			if (values.stockLimit > 0 && values.stockLimit < Number(product.soldCount)) throw new InvalidProductError();
			Object.assign(product, values, { updatedAt: new Date(), version: randomUUID() });
			await manager.save(product);
			return this.pack(product, userId, 0, true);
		});
	}

	public async findForPurchase(manager: EntityManager, productId: string) {
		return manager.findOneBy(MiProduct, { id: productId });
	}

	public async lockForPurchase(manager: EntityManager, productId: string, sellerId: string) {
		const product = await manager.findOne(MiProduct, { where: { id: productId, sellerId }, lock: { mode: 'pessimistic_write' } });
		const seller = await manager.findOneBy(MiUser, { id: sellerId });
		if (!product?.enabled || !canTrade(seller)) throw new NoSuchProductError();
		return product;
	}

	public async recordSale(manager: EntityManager, product: MiProduct, quantity: number) {
		await manager.update(MiProduct, { id: product.id }, { soldCount: Number(product.soldCount) + quantity });
	}
}
