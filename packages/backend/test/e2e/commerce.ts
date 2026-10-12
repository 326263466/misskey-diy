/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, test } from 'vitest';
import type { entities } from 'misskey-js';
import { api, signup, initTestDb } from '../utils.js';
import { MiProduct } from '@/models/Product.js';
import { MiOrder } from '@/models/Order.js';
import { MiWallet } from '@/models/Wallet.js';

describe('marketplace API', () => {
	let admin: entities.SignupResponse;
	let seller: entities.SignupResponse;
	let buyer: entities.SignupResponse;
	let stranger: entities.SignupResponse;
	const input = {
		name: '集市商品', description: '商品说明', type: 'virtual' as const, category: '', imageUrl: '', unit: '份',
		price: 80, perUserLimit: 20, stockLimit: 0, deliveryText: 'private-delivery-instructions', enabled: true,
	};

	beforeAll(async () => {
		const db = await initTestDb(true);
		try {
			await db.query('CREATE SEQUENCE IF NOT EXISTS order_number_seq AS bigint START WITH 1000000000000000000 MINVALUE 1000000000000000000 MAXVALUE 9223372036854775807 NO CYCLE');
		} finally { await db.destroy(); }
		admin = await signup({ username: 'marketadmin' });
		seller = await signup({ username: 'marketseller' });
		buyer = await signup({ username: 'marketbuyer' });
		stranger = await signup({ username: 'marketstranger' });
	});

	test('administrators and ordinary users publish through the same endpoint and product table', async () => {
		const db = await initTestDb(true);
		try {
			for (const [publisher, type] of [[admin, 'physical'], [seller, 'virtual']] as const) {
				const requestId = randomUUID();
				const created = await api('products/create', { ...input, type, requestId }, publisher);
				expect(created.status).toBe(200);
				expect(created.body).toMatchObject({ sellerId: publisher.id, type, isOwner: true });
				expect((await api('products/create', { ...input, type, requestId }, publisher)).body.id).toBe(created.body.id);
				expect(await db.getRepository(MiProduct).countBy({ sellerId: publisher.id })).toBe(1);
				const shown = await api('products/show', { productId: created.body.id }, buyer);
				expect(shown.status).toBe(200);
				expect(shown.body).toMatchObject({ sellerId: publisher.id, seller: { id: publisher.id }, deliveryText: null });
				const denied = await api('products/update', { ...input, productId: created.body.id, expectedVersion: created.body.version }, stranger);
				expect(denied.status).toBe(400);
			}
			const catalog = (await api('products/list', {}, buyer)).body;
			expect(catalog.products).toHaveLength(2);
			expect(JSON.stringify(catalog)).not.toContain(input.deliveryText);
			expect((await api('products/mine', {}, seller)).body[0]).toMatchObject({ sellerId: seller.id, deliveryText: input.deliveryText });
		} finally { await db.destroy(); }
	});

	test('validates publication and purchase parameters before writing', async () => {
		const anonymous = await api('products/create', { ...input, requestId: randomUUID() });
		expect([401, 403]).toContain(anonymous.status);
		for (const invalid of [{ price: 0 }, { perUserLimit: -1 }, { type: 'makeup-card' }, { deliveryText: '' }, { imageUrl: 'javascript:alert(1)' }]) {
			const response = await api('products/create', { ...input, ...invalid, requestId: randomUUID() } as never, seller);
			expect(response.status).toBe(400);
		}
		const listing = (await api('products/mine', {}, seller)).body[0];
		for (const quantity of [0, 1.5, 1_000_001]) {
			const response = await api('orders/purchase', { productId: listing.id, quantity, requestId: randomUUID(), expectedPrice: listing.price, expectedVersion: listing.version }, buyer);
			expect(response.status).toBe(400);
		}
	});

	test('purchases in one batch, returns private numeric orders and honors cumulative limits', async () => {
		const listing = (await api('products/mine', {}, seller)).body[0];
		const db = await initTestDb(true);
		try {
			await db.getRepository(MiWallet).upsert({ userId: buyer.id, balance: 2000, reservedBalance: 0 }, ['userId']);
			const request = { productId: listing.id, quantity: 15, expectedPrice: listing.price, expectedVersion: listing.version, requestId: randomUUID() };
			const bought = await api('orders/purchase', request, buyer);
			expect(bought.status).toBe(200);
			expect(bought.body).toMatchObject({ quantity: 15, points: 800, purchased: true, deliveryText: input.deliveryText });
			expect(bought.body.orderId).toMatch(/^[0-9]{19}$/);
			expect(bought.body.redemptionCode).toMatch(/^[0-9A-Z]{5}(?:-[0-9A-Z]{5}){3}$/);
			expect((await api('orders/purchase', request, buyer)).body).toMatchObject({ purchased: false, orderId: bought.body.orderId });
			const own = await api('orders/show', { orderId: bought.body.orderId }, buyer);
			expect(own.status).toBe(200);
			expect(own.body).toMatchObject({ seller: { id: seller.id }, buyer: { id: buyer.id }, quantity: 15 });
			expect((await api('orders/show', { orderId: bought.body.orderId }, stranger)).status).toBe(400);
			expect((await api('orders/list', { mode: 'sales' }, seller)).body).toHaveLength(1);
			expect((await api('orders/list', {}, stranger)).body).toEqual([]);
			expect((await api('orders/purchase', { ...request, quantity: 6, requestId: randomUUID() }, buyer)).status).toBe(400);
			expect((await api('orders/purchase', { ...request, quantity: 5, requestId: randomUUID() }, buyer)).status).toBe(200);
			expect((await api('products/show', { productId: listing.id }, buyer)).body).toMatchObject({ purchasedQuantity: 20, remainingAllowance: 0 });
			expect(await db.getRepository(MiOrder).countBy({ buyerId: buyer.id })).toBe(2);
			expect((await db.getRepository(MiWallet).findOneByOrFail({ userId: buyer.id })).balance).toBe(400);
			expect((await db.getRepository(MiWallet).findOneByOrFail({ userId: seller.id })).balance).toBe(1360);
		} finally { await db.destroy(); }
	});

	test('only administrators configure the commission rate and the default is fifteen percent', async () => {
		expect((await api('payments/settings', {}, seller)).body).toEqual({ feeRateBps: 1500 });
		expect((await api('admin/payments/settings', {}, seller)).status).toBe(403);
		expect((await api('admin/payments/update-settings', { feeRateBps: 0 }, seller)).status).toBe(403);
		for (const feeRateBps of [-1, 10001, 1.5]) {
			expect((await api('admin/payments/update-settings', { feeRateBps }, admin)).status).toBe(400);
		}
		expect((await api('admin/payments/update-settings', { feeRateBps: 1250 }, admin)).body).toMatchObject({ feeRateBps: 1250 });
		expect((await api('payments/settings', {}, buyer)).body).toEqual({ feeRateBps: 1250 });
		expect((await api('admin/payments/update-settings', { feeRateBps: 1500 }, admin)).status).toBe(200);
	});
});
