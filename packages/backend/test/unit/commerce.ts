/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { In, type DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import { DI } from '@/di-symbols.js';
import { ShopModule } from '@/core/shop/ShopModule.js';
import { ProductService } from '@/core/product/ProductService.js';
import { OrderService } from '@/core/order/OrderService.js';
import { CatalogService } from '@/core/shop/CatalogService.js';
import { CheckoutService } from '@/core/shop/CheckoutService.js';
import { PaymentService, PLATFORM_MAX_BALANCE_UNITS } from '@/core/payment/PaymentService.js';
import * as Commerce from '@/core/commerce/types.js';
import type { ProductInput } from '@/core/commerce/types.js';
import { MiProduct } from '@/models/Product.js';
import { MiOrder } from '@/models/Order.js';
import { MiUser } from '@/models/User.js';
import { MiWallet } from '@/models/Wallet.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import { MiPlatformAccount } from '@/models/PlatformAccount.js';
import { MiPlatformTransaction } from '@/models/PlatformTransaction.js';
import { MiPaymentSettings } from '@/models/PaymentSettings.js';
import * as redemptionCode from '@/core/order/redemption-code.js';

@Module({})
class CommerceTestInfrastructureModule {}

describe('independent marketplace purchases', () => {
	const input: ProductInput = {
		name: '数字指南', description: '商品说明', type: 'virtual', category: '', imageUrl: '', unit: '份',
		price: 60, perUserLimit: 0, stockLimit: 0, deliveryText: '购买后可见的领取说明', enabled: true,
	};
	let db: DataSource;
	let app: TestingModule;
	let productService: ProductService;
	let orderService: OrderService;
	let catalogService: CatalogService;
	let checkoutService: CheckoutService;
	let paymentService: PaymentService;
	let serial = 0;
	const userIds: string[] = [];

	async function user(points = 0, overrides: Partial<MiUser> = {}): Promise<MiUser> {
		const id = `market-test-${String(serial++).padStart(6, '0')}`;
		await db.getRepository(MiUser).insert({ id, username: id, usernameLower: id, ...overrides });
		await db.getRepository(MiWallet).insert({ userId: id, balance: points, reservedBalance: 0 });
		userIds.push(id);
		return db.getRepository(MiUser).findOneByOrFail({ id });
	}

	async function product(sellerId: string, values: Partial<ProductInput> = {}) {
		return productService.create(sellerId, { ...input, ...values }, randomUUID());
	}

	async function balance(userId: string) {
		return (await db.getRepository(MiWallet).findOneByOrFail({ userId })).balance;
	}

	async function platformBalance() {
		return Number((await db.getRepository(MiPlatformAccount).findOneBy({ id: 'platform' }))?.balanceUnits ?? 0) / 100;
	}

	async function purchase(buyerId: string, listing: Awaited<ReturnType<typeof product>>, quantity = 1, requestId = randomUUID()) {
		return checkoutService.purchase(buyerId, listing.id, quantity, requestId, listing.price, listing.version);
	}

	beforeAll(async () => {
		db = await initTestDb();
		await db.query('CREATE SEQUENCE IF NOT EXISTS order_number_seq AS bigint START WITH 1000000000000000000 MINVALUE 1000000000000000000 MAXVALUE 9223372036854775807 NO CYCLE');
		app = await Test.createTestingModule({
			imports: [{
				module: CommerceTestInfrastructureModule, global: true,
				providers: [{ provide: DI.db, useValue: db }, { provide: DI.config, useValue: { id: 'aidx' } }],
				exports: [DI.db, DI.config],
			}, ShopModule],
		}).compile();
		productService = app.get(ProductService);
		orderService = app.get(OrderService);
		catalogService = app.get(CatalogService);
		checkoutService = app.get(CheckoutService);
		paymentService = app.get(PaymentService);
	});
	afterEach(async () => {
		if (db?.isInitialized && userIds.length) {
			const orders = await db.getRepository(MiOrder).findBy({ buyerId: In(userIds) });
			if (orders.length > 0) await db.getRepository(MiPlatformTransaction).delete({ referenceId: In(orders.map(order => order.id)) });
			await db.getRepository(MiOrder).delete({ buyerId: In(userIds) });
			await db.getRepository(MiProduct).delete({ sellerId: In(userIds) });
			await db.getRepository(MiUser).delete(userIds.splice(0));
			await db.getRepository(MiPlatformAccount).delete({ id: 'platform' });
			await db.getRepository(MiPaymentSettings).delete({ id: 'default' });
		}
	});
	afterAll(async () => { await app?.close(); if (db?.isInitialized) await db.destroy(); });

	test.each(['physical', 'virtual'] as const)('ordinary users publish %s goods without disclosing delivery instructions', async type => {
		const seller = await user();
		const buyer = await user();
		const listing = await product(seller.id, { type });
		expect(listing).toMatchObject({ sellerId: seller.id, isOwner: true, type, deliveryText: input.deliveryText });
		expect(await db.getRepository(MiProduct).countBy({ sellerId: seller.id })).toBe(1);
		const catalog = await catalogService.list(buyer.id);
		expect(catalog.products).toHaveLength(1);
		expect(catalog.products[0]).toMatchObject({ id: listing.id, sellerId: seller.id, maxQuantity: 1_000_000, remainingAllowance: null });
		expect(JSON.stringify(catalog)).not.toContain(input.deliveryText);
		expect((await catalogService.show(buyer.id, listing.id)).deliveryText).toBeNull();
		expect((await productService.mine(seller.id))[0].deliveryText).toBe(input.deliveryText);
	});

	test('publication retries produce one product and reject altered contents', async () => {
		const seller = await user();
		const requestId = randomUUID();
		const results = await Promise.all(Array.from({ length: 4 }, (_, index) => productService.create(seller.id, input, index % 2 ? requestId.toUpperCase() : requestId)));
		expect(new Set(results.map(result => result.id)).size).toBe(1);
		expect(await db.getRepository(MiProduct).countBy({ sellerId: seller.id })).toBe(1);
		await expect(productService.create(seller.id, { ...input, price: 61 }, requestId)).rejects.toBeInstanceOf(Commerce.RequestConflictError);
	});

	test('only the publisher can edit and stale edits cannot overwrite accepted changes', async () => {
		const seller = await user();
		const stranger = await user();
		const listing = await product(seller.id);
		await expect(productService.update(stranger.id, listing.id, input, listing.version)).rejects.toBeInstanceOf(Commerce.NoSuchProductError);
		const updated = await productService.update(seller.id, listing.id, { ...input, price: 80 }, listing.version);
		expect(updated).toMatchObject({ price: 80, sellerId: seller.id });
		await expect(productService.update(seller.id, listing.id, { ...input, price: 1 }, listing.version)).rejects.toBeInstanceOf(Commerce.PriceChangedError);
		expect((await catalogService.show(stranger.id, listing.id)).price).toBe(80);
	});

	test('unlimited goods support large and repeated purchases with seller settlement', async () => {
		const seller = await user(10);
		const buyer = await user(2000);
		const listing = await product(seller.id);
		const first = await purchase(buyer.id, listing, 15);
		const second = await purchase(buyer.id, listing, 5);
		expect(first).toMatchObject({ purchased: true, quantity: 15, points: 1100, deliveryText: input.deliveryText });
		expect(first.orderId).toMatch(/^[0-9]{19}$/);
		expect(second.orderId).toMatch(/^[0-9]{19}$/);
		expect(first.orderId).not.toBe(second.orderId);
		expect(first.redemptionCode).not.toBeNull();
		expect(first.redemptionCode).toMatch(/^[0-9A-Z]{5}(?:-[0-9A-Z]{5}){3}$/);
		expect(first.redemptionCode!.replaceAll('-', '')).toHaveLength(20);
		expect(await balance(buyer.id)).toBe(800);
		expect(await balance(seller.id)).toBe(1030);
		expect(await platformBalance()).toBe(180);
		expect(await db.getRepository(MiOrder).countBy({ buyerId: buyer.id })).toBe(2);
		expect(await catalogService.show(buyer.id, listing.id)).toMatchObject({ purchasedQuantity: 20, remainingAllowance: null });
		expect(await db.getRepository(MiWalletTransaction).countBy({ userId: seller.id, type: 'orderIncome' })).toBe(2);
	});

	test('concurrent retries charge once and preserve the original receipt after unlisting', async () => {
		const seller = await user();
		const buyer = await user(1000);
		const listing = await product(seller.id);
		const requestId = randomUUID();
		const results = await Promise.all(Array.from({ length: 8 }, (_, index) => purchase(buyer.id, listing, 2, index % 2 ? requestId.toUpperCase() : requestId)));
		expect(results.filter(result => result.purchased)).toHaveLength(1);
		expect(new Set(results.map(result => result.orderId)).size).toBe(1);
		expect(new Set(results.map(result => result.redemptionCode)).size).toBe(1);
		expect(await balance(buyer.id)).toBe(880);
		expect(await balance(seller.id)).toBe(102);
		expect(await platformBalance()).toBe(18);
		expect(await db.getRepository(MiPlatformTransaction).count()).toBe(1);
		expect(await db.getRepository(MiOrder).countBy({ buyerId: buyer.id })).toBe(1);
		await productService.update(seller.id, listing.id, { ...input, enabled: false, name: '修改后的商品' }, listing.version);
		expect(await purchase(buyer.id, listing, 2, requestId)).toMatchObject({ purchased: false, orderId: results[0].orderId, deliveryText: input.deliveryText });
		await expect(purchase(buyer.id, listing, 1, requestId)).rejects.toBeInstanceOf(Commerce.RequestConflictError);
		await expect(purchase(buyer.id, listing)).rejects.toBeInstanceOf(Commerce.NoSuchProductError);
		expect((await orderService.show(buyer.id, results[0].orderId)).name).toBe(input.name);
	});

	test('limited goods count quantities across orders and serialize the last allowed item', async () => {
		const seller = await user();
		const buyer = await user(5000);
		const listing = await product(seller.id, { perUserLimit: 25 });
		await purchase(buyer.id, listing, 12);
		await purchase(buyer.id, listing, 12);
		expect(await catalogService.show(buyer.id, listing.id)).toMatchObject({ purchasedQuantity: 24, remainingAllowance: 1, maxQuantity: 1 });
		await expect(purchase(buyer.id, listing, 2)).rejects.toBeInstanceOf(Commerce.LimitError);
		const results = await Promise.allSettled([purchase(buyer.id, listing), purchase(buyer.id, listing)]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(await catalogService.show(buyer.id, listing.id)).toMatchObject({ purchasedQuantity: 25, remainingAllowance: 0, maxQuantity: 0, unavailableReason: 'purchase-limit' });
		expect(await balance(buyer.id)).toBe(3500);
		expect(await balance(seller.id)).toBe(1275);
		expect(await platformBalance()).toBe(225);
		const secondBuyer = await user(2000);
		await purchase(secondBuyer.id, listing, 25);
		await expect(purchase(secondBuyer.id, listing)).rejects.toBeInstanceOf(Commerce.LimitError);
	});

	test('stock cannot be oversold or reopened by deleting a buyer', async () => {
		const seller = await user();
		const first = await user(1000);
		const second = await user(1000);
		const listing = await product(seller.id, { stockLimit: 1 });
		const results = await Promise.allSettled([purchase(first.id, listing), purchase(second.id, listing)]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(await balance(first.id) + await balance(second.id)).toBe(1940);
		expect(await balance(seller.id)).toBe(51);
		expect(await platformBalance()).toBe(9);
		const winner = results[0].status === 'fulfilled' ? first : second;
		await db.getRepository(MiUser).delete(winner.id);
		expect(await catalogService.show((await user()).id, listing.id)).toMatchObject({ remainingStock: 0, maxQuantity: 0, unavailableReason: 'sold-out' });
		expect(await db.getRepository(MiOrder).countBy({ buyerId: winner.id })).toBe(1);
	});

	test('insufficient points and seller overflow roll back stock, orders and both balances', async () => {
		const seller = await user(1_999_999_950);
		const poor = await user(59);
		const buyer = await user(1000);
		const listing = await product(seller.id, { stockLimit: 1 });
		await expect(purchase(poor.id, listing)).rejects.toBeInstanceOf(Commerce.InsufficientPointsError);
		await expect(purchase(buyer.id, listing)).rejects.toBeInstanceOf(Commerce.SellerBalanceLimitError);
		expect(await balance(poor.id)).toBe(59);
		expect(await balance(buyer.id)).toBe(1000);
		expect(await balance(seller.id)).toBe(1_999_999_950);
		expect(await db.getRepository(MiOrder).count()).toBe(0);
		expect(await platformBalance()).toBe(0);
		expect(await db.getRepository(MiPlatformTransaction).count()).toBe(0);
		expect(await catalogService.show(buyer.id, listing.id)).toMatchObject({ remainingStock: 1 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ userId: In([buyer.id, poor.id, seller.id]) })).toBe(0);
		await db.getRepository(MiWallet).update({ userId: seller.id }, { balance: 0 });
		await db.getRepository(MiPlatformAccount).upsert({ id: 'platform', balanceUnits: PLATFORM_MAX_BALANCE_UNITS }, ['id']);
		await expect(purchase(buyer.id, listing)).rejects.toBeInstanceOf(PaymentService.PlatformBalanceLimitError);
		expect(await balance(buyer.id)).toBe(1000);
		expect(await balance(seller.id)).toBe(0);
		expect(await platformBalance()).toBe(PLATFORM_MAX_BALANCE_UNITS / 100);
		expect(await db.getRepository(MiOrder).count()).toBe(0);
		expect(await db.getRepository(MiPlatformTransaction).count()).toBe(0);
		expect(await catalogService.show(buyer.id, listing.id)).toMatchObject({ remainingStock: 1 });
	});

	test('opposite purchases use one lock order and keep total points unchanged', async () => {
		const first = await user(1000);
		const second = await user(1000);
		const firstProduct = await product(first.id);
		const secondProduct = await product(second.id, { price: 80 });
		await Promise.all([purchase(first.id, secondProduct), purchase(second.id, firstProduct)]);
		expect(await balance(first.id)).toBe(971);
		expect(await balance(second.id)).toBe(1008);
		expect(await platformBalance()).toBe(21);
	});

	test('only the buyer and seller can read order details and CDKs', async () => {
		const seller = await user();
		const buyer = await user(1000);
		const stranger = await user();
		const listing = await product(seller.id);
		const receipt = await purchase(buyer.id, listing);
		expect(await orderService.show(buyer.id, receipt.orderId)).toMatchObject({ id: receipt.orderId, buyerId: buyer.id, sellerId: seller.id, deliveryText: input.deliveryText });
		expect(await orderService.show(seller.id, receipt.orderId)).toMatchObject({ id: receipt.orderId });
		expect(await orderService.list(seller.id, 20, undefined, 'sales')).toHaveLength(1);
		expect(await orderService.list(stranger.id, 20)).toEqual([]);
		await expect(orderService.show(stranger.id, receipt.orderId)).rejects.toBeInstanceOf(Commerce.NoSuchOrderError);
		await expect(purchase(seller.id, listing)).rejects.toBeInstanceOf(Commerce.NotAllowedError);
	});

	test('stale price and delivery versions are rejected before payment', async () => {
		const seller = await user();
		const buyer = await user(1000);
		const listing = await product(seller.id);
		const updated = await productService.update(seller.id, listing.id, { ...input, deliveryText: '新的交付内容' }, listing.version);
		await expect(purchase(buyer.id, listing)).rejects.toBeInstanceOf(Commerce.PriceChangedError);
		await expect(checkoutService.purchase(buyer.id, listing.id, 1, randomUUID(), 59, updated.version)).rejects.toBeInstanceOf(Commerce.PriceChangedError);
		expect(await balance(buyer.id)).toBe(1000);
		expect(await balance(seller.id)).toBe(0);
	});

	test('a CDK collision generates another code without overwriting an existing order', async () => {
		const seller = await user();
		const buyer = await user(1000);
		const listing = await product(seller.id);
		const generate = vi.spyOn(redemptionCode, 'generateRedemptionCode');
		generate.mockReturnValueOnce('7'.repeat(20));
		const original = await purchase(buyer.id, listing);
		generate.mockReturnValueOnce('7'.repeat(20));
		const next = await purchase(buyer.id, listing);
		expect(next.redemptionCode).not.toBe(original.redemptionCode);
		expect(next.orderId).not.toBe(original.orderId);
		expect((await orderService.show(buyer.id, original.orderId)).redemptionCode).toEqual(original.redemptionCode);
		expect(await balance(buyer.id)).toBe(880);
		expect(await balance(seller.id)).toBe(102);
		expect(await platformBalance()).toBe(18);
	});

	test('default fees preserve sub-point amounts and retain the original rate on retry', async () => {
		const seller = await user();
		const buyer = await user(5);
		const listing = await product(seller.id, { price: 1 });
		const requestId = randomUUID();
		const first = await purchase(buyer.id, listing, 1, requestId);
		expect(first).toMatchObject({ feeRateBps: 1500, platformFee: 0.15, sellerAmount: 0.85 });
		expect(await balance(buyer.id)).toBe(4);
		expect(await balance(seller.id)).toBe(0.85);
		expect(await platformBalance()).toBe(0.15);
		await paymentService.updateSettings(1501);
		expect(await purchase(buyer.id, listing, 1, requestId)).toMatchObject({ purchased: false, feeRateBps: 1500, platformFee: 0.15, sellerAmount: 0.85 });
		expect(await purchase(buyer.id, listing)).toMatchObject({ feeRateBps: 1501, platformFee: 0.16, sellerAmount: 0.84 });
		expect(await balance(seller.id)).toBe(1.69);
		expect(await platformBalance()).toBe(0.31);
	});

	test('zero and full commission rates preserve every point without zero-value ledger entries', async () => {
		const seller = await user();
		const buyer = await user(10);
		const listing = await product(seller.id, { price: 1 });
		await paymentService.updateSettings(0);
		expect(await purchase(buyer.id, listing)).toMatchObject({ platformFee: 0, sellerAmount: 1 });
		expect(await platformBalance()).toBe(0);
		await paymentService.updateSettings(10000);
		expect(await purchase(buyer.id, listing)).toMatchObject({ platformFee: 1, sellerAmount: 0 });
		expect(await balance(buyer.id)).toBe(8);
		expect(await balance(seller.id)).toBe(1);
		expect(await platformBalance()).toBe(1);
		expect(await db.getRepository(MiWalletTransaction).countBy({ userId: seller.id })).toBe(1);
	});
});
