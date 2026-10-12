/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { TransferService } from '@/core/TransferService.js';
import { WalletService, WALLET_MAX_BALANCE } from '@/core/WalletService.js';
import { IdService } from '@/core/IdService.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiTransfer } from '@/models/Transfer.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import { MiBlocking } from '@/models/Blocking.js';
import CreateEndpoint from '@/server/api/endpoints/transfers/create.js';
import AcceptEndpoint from '@/server/api/endpoints/transfers/accept.js';
import RefundEndpoint from '@/server/api/endpoints/transfers/refund.js';
import ShowEndpoint from '@/server/api/endpoints/transfers/show.js';
import ListEndpoint from '@/server/api/endpoints/transfers/list.js';
import { initTestDb } from '../utils.js';
import type { DataSource } from 'typeorm';

describe('transfer persistence and concurrency', () => {
	let db: DataSource;
	let wallet: WalletService;
	let service: TransferService;
	let otherWorker: TransferService;
	let serial = 0;
	const users: string[] = [];
	const ids = new IdService({ id: 'aidx' } as never);
	const logger = { getLogger: () => ({ error: vi.fn() }) };

	async function user(balance = 0, overrides: Partial<MiUser> = {}) {
		const id = `transfertest${String(serial++).padStart(6, '0')}`;
		await db.getRepository(MiUser).insert({ id, username: id, usernameLower: id, ...overrides });
		await db.getRepository(MiUserProfile).insert({ userId: id });
		users.push(id);
		if (balance) await wallet.adjust(id, balance, '测试充值', randomUUID(), id);
		return db.getRepository(MiUser).findOneByOrFail({ id });
	}

	async function send(sender: MiUser, recipient: MiUser, amount = 1) {
		return service.create({ recipientId: recipient.id, amount, requestId: randomUUID() }, sender.id);
	}

	async function expire(id: string) {
		await db.getRepository(MiTransfer).update({ id }, { expiresAt: new Date(Date.now() - 1) });
	}

	beforeAll(async () => {
		if (!/test/i.test(loadConfig().db.db)) throw new Error('Transfer tests require a test database.');
		db = await initTestDb();
		wallet = new WalletService(db, ids);
		service = new TransferService(db, ids, wallet, logger as never);
		otherWorker = new TransferService(db, ids, new WalletService(db, ids), logger as never);
	});
	afterEach(async () => {
		if (db?.isInitialized && users.length) await db.getRepository(MiUser).delete(users.splice(0));
	});
	afterAll(async () => {
		await service?.onApplicationShutdown();
		await otherWorker?.onApplicationShutdown();
		if (db?.isInitialized) await db.destroy();
	});

	test('concurrent create retries freeze once, preserve 24h deadline, and reject conflicting drafts', async () => {
		const sender = await user(10);
		const recipient = await user();
		const draft = { recipientId: recipient.id, amount: 3.27, message: '午餐', requestId: randomUUID() };
		const results = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? service : otherWorker).create(draft, sender.id)));
		expect(new Set(results.map(row => row.id)).size).toBe(1);
		expect(Date.parse(results[0].expiresAt) - Date.parse(results[0].createdAt)).toBe(86_400_000);
		expect(await wallet.show(sender.id)).toMatchObject({ balance: 6.73, reservedBalance: 3.27 });
		expect(await wallet.show(recipient.id)).toMatchObject({ balance: 0, reservedBalance: 0 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'transferSend' })).toBe(1);
		await expect(service.create({ ...draft, amount: 3.28 }, sender.id)).rejects.toBeInstanceOf(TransferService.RequestConflictError);
		expect(await service.create({ ...draft, requestId: draft.requestId.toUpperCase() }, sender.id)).toEqual(results[0]);
	});

	test('concurrent accept calls debit the frozen funds and credit recipient exactly once', async () => {
		const sender = await user(10);
		const recipient = await user();
		const transfer = await send(sender, recipient, 0.01);
		const results = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? service : otherWorker).accept(transfer.id, recipient.id)));
		expect(results.every(row => row.status === 'accepted')).toBe(true);
		expect(await wallet.show(sender.id)).toMatchObject({ balance: 9.99, reservedBalance: 0 });
		expect(await wallet.show(recipient.id)).toMatchObject({ balance: 0.01 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'transferReceive' })).toBe(1);
		await expect(service.refund(transfer.id, recipient.id)).rejects.toBeInstanceOf(TransferService.AlreadyCompletedError);
	});

	test('only recipient can accept or refund and unrelated users cannot inspect transfers', async () => {
		const sender = await user(10);
		const recipient = await user();
		const stranger = await user();
		const transfer = await send(sender, recipient);
		await expect(new ShowEndpoint(service).exec({ transferId: transfer.id }, stranger as never, null)).rejects.toMatchObject({ code: 'TRANSFER_ACCESS_DENIED' });
		for (const viewer of [sender, stranger]) {
			await expect(new AcceptEndpoint(service).exec({ transferId: transfer.id }, viewer as never, null)).rejects.toMatchObject({ code: 'TRANSFER_ACCESS_DENIED' });
			await expect(new RefundEndpoint(service).exec({ transferId: transfer.id }, viewer as never, null)).rejects.toMatchObject({ code: 'TRANSFER_ACCESS_DENIED' });
		}
		expect(await service.show(transfer.id, sender.id)).toMatchObject({ status: 'pending' });
		expect(await service.list(stranger.id, 20)).toEqual([]);
	});

	test('accept and refund racing across workers settle only one destination', async () => {
		const sender = await user(10);
		const recipient = await user();
		const transfer = await send(sender, recipient, 7.89);
		const outcomes = await Promise.allSettled([service.accept(transfer.id, recipient.id), otherWorker.refund(transfer.id, recipient.id)]);
		expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		const a = await wallet.show(sender.id);
		const b = await wallet.show(recipient.id);
		expect(a.balance + b.balance).toBe(10);
		expect(a.reservedBalance).toBe(0);
		expect(await db.getRepository(MiWalletTransaction).countBy([{ type: 'transferReceive' }, { type: 'transferRefund' }])).toBe(1);
	});

	test('manual refunds and repeated requests return funds once', async () => {
		const sender = await user(10);
		const recipient = await user();
		const transfer = await send(sender, recipient, 3.25);
		await Promise.all([service.refund(transfer.id, recipient.id), otherWorker.refund(transfer.id, recipient.id)]);
		expect(await wallet.show(sender.id)).toMatchObject({ balance: 10, reservedBalance: 0 });
		expect(await wallet.show(recipient.id)).toMatchObject({ balance: 0 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'transferRefund' })).toBe(1);
		await expect(service.accept(transfer.id, recipient.id)).rejects.toBeInstanceOf(TransferService.AlreadyCompletedError);
	});

	test('expired accept requests commit the refund and never credit the recipient', async () => {
		const sender = await user(10);
		const recipient = await user();
		const transfer = await send(sender, recipient, 3.25);
		await expire(transfer.id);
		expect(await service.accept(transfer.id, recipient.id)).toMatchObject({ status: 'expired' });
		expect(await otherWorker.accept(transfer.id, recipient.id)).toMatchObject({ status: 'expired' });
		expect(await wallet.show(sender.id)).toMatchObject({ balance: 10, reservedBalance: 0 });
		expect(await wallet.show(recipient.id)).toMatchObject({ balance: 0 });
	});

	test('startup and multiple sweepers refund unseen expired transfers even after recipient deletion', async () => {
		const sender = await user(10);
		const recipient = await user();
		const transfer = await send(sender, recipient, 3.25);
		await expire(transfer.id);
		await db.getRepository(MiUser).delete(recipient.id);
		await Promise.all([service.sweepExpired(), otherWorker.sweepExpired()]);
		expect(await service.show(transfer.id, sender.id)).toMatchObject({ status: 'expired' });
		expect(await wallet.show(sender.id)).toMatchObject({ balance: 10, reservedBalance: 0 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'transferRefund' })).toBe(1);
	});

	test('recipient balance overflow rolls back reservation consumption and allows a later refund', async () => {
		const sender = await user(10);
		const recipient = await user(WALLET_MAX_BALANCE);
		const transfer = await send(sender, recipient);
		await expect(service.accept(transfer.id, recipient.id)).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		expect(await wallet.show(sender.id)).toMatchObject({ balance: 9, reservedBalance: 1 });
		expect(await service.show(transfer.id, sender.id)).toMatchObject({ status: 'pending' });
		await service.refund(transfer.id, recipient.id);
		expect(await wallet.show(sender.id)).toMatchObject({ balance: 10, reservedBalance: 0 });
	});

	test('opposite concurrent transfers have a consistent wallet lock order', async () => {
		const a = await user(10);
		const b = await user(10);
		const [ab, ba] = await Promise.all([send(a, b, 1), send(b, a, 2)]);
		await Promise.all([service.accept(ab.id, b.id), otherWorker.accept(ba.id, a.id)]);
		expect(await wallet.show(a.id)).toMatchObject({ balance: 11, reservedBalance: 0 });
		expect(await wallet.show(b.id)).toMatchObject({ balance: 9, reservedBalance: 0 });
	});

	test('API rejects invalid cents, insufficient funds, blocked recipients and remote users without creating transfers', async () => {
		const sender = await user(1);
		const recipient = await user();
		const endpoint = new CreateEndpoint(service);
		for (const amount of [0, -1, 0.001, 1.234, WALLET_MAX_BALANCE + 1]) {
			await expect(endpoint.exec({ recipientId: recipient.id, amount, requestId: randomUUID() }, sender as never, null)).rejects.toBeDefined();
		}
		await expect(endpoint.exec({ recipientId: recipient.id, amount: 2, requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'INSUFFICIENT_WALLET_BALANCE' });
		await db.getRepository(MiBlocking).insert({ id: ids.gen(), blockerId: recipient.id, blockeeId: sender.id });
		await expect(send(sender, recipient)).rejects.toBeInstanceOf(TransferService.AccessDeniedError);
		const remote = await user(0, { host: 'example.com' });
		await expect(endpoint.exec({ recipientId: remote.id, amount: 1, requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'TRANSFER_ACCESS_DENIED' });
		expect(await db.getRepository(MiTransfer).count()).toBe(0);
	});

	test('lists are private and support direction and ID pagination', async () => {
		const a = await user(10);
		const b = await user(10);
		const ab = await send(a, b);
		const ba = await send(b, a);
		const endpoint = new ListEndpoint(service);
		expect(await endpoint.exec({ direction: 'sent' }, a as never, null)).toEqual([ab]);
		expect(await endpoint.exec({ direction: 'received' }, a as never, null)).toEqual([ba]);
		const newest = await service.list(a.id, 1);
		const older = await service.list(a.id, 1, newest[0].id);
		expect(new Set([...newest, ...older].map(row => row.id))).toEqual(new Set([ab.id, ba.id]));
	});
});
