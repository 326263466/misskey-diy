/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { WalletService, WALLET_MAX_BALANCE } from '@/core/WalletService.js';
import { CheckinService } from '@/core/CheckinService.js';
import { IdService } from '@/core/IdService.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserCheckin } from '@/models/UserCheckin.js';
import { MiWallet } from '@/models/Wallet.js';
import { MiWalletSettings } from '@/models/WalletSettings.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import ShowEndpoint from '@/server/api/endpoints/i/wallet.js';
import ExchangeEndpoint from '@/server/api/endpoints/i/wallet/exchange.js';
import TransactionsEndpoint from '@/server/api/endpoints/i/wallet/transactions.js';
import AdjustEndpoint from '@/server/api/endpoints/admin/wallet/adjust.js';
import UpdateSettingsEndpoint from '@/server/api/endpoints/admin/wallet/update-settings.js';
import { initTestDb } from '../utils.js';
import type { DataSource } from 'typeorm';

describe('wallet persistence, concurrency and API validation', () => {
	let db: DataSource;
	let service: WalletService;
	let serial = 0;
	const userIds: string[] = [];
	const ids = new IdService({ id: 'aidx' } as never);

	async function user(points = 0, overrides: Partial<MiUser> = {}): Promise<MiUser> {
		const id = `wallettest${String(serial++).padStart(6, '0')}`;
		await db.getRepository(MiUser).insert({ id, username: id, usernameLower: id, ...overrides });
		await db.getRepository(MiUserProfile).insert({ userId: id, checkinPoints: points });
		userIds.push(id);
		return db.getRepository(MiUser).findOneByOrFail({ id });
	}

	async function fund(userId: string, amount: number) {
		return service.adjust(userId, amount, 'Test grant', randomUUID(), userId);
	}

	beforeAll(async () => {
		// Configuration is compiled into built output; NODE_ENV alone cannot make schema reset safe.
		if (!/test/i.test(loadConfig().db.db)) throw new Error('Wallet tests require a database explicitly named for testing.');
		db = await initTestDb();
		service = new WalletService(db, ids);
	});
	beforeEach(async () => { await db.getRepository(MiWalletSettings).clear(); });
	afterEach(async () => {
		if (db?.isInitialized && userIds.length) await db.getRepository(MiUser).delete(userIds.splice(0));
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('opening a wallet preserves points and returns the enabled 1:1 default without creating money', async () => {
		const me = await user(73);
		expect(await new ShowEndpoint(service).exec({}, me as never, null)).toEqual({ balance: 0, reservedBalance: 0, points: 73, exchangeEnabled: true, exchangeRate: 1 });
		expect(await db.getRepository(MiWallet).findOneBy({ userId: me.id })).toBeNull();
		expect(await service.transactions(me.id, 30)).toEqual([]);
	});

	test('concurrent first exchanges debit points once per request and persist the matching ledger', async () => {
		const me = await user(100);
		await service.updateSettings({ exchangeEnabled: true, exchangeRate: 3 });
		const requestId = randomUUID();
		const results = await Promise.all(Array.from({ length: 12 }, () => service.exchange(me.id, 20, requestId)));
		expect(results.filter(result => result.exchanged)).toHaveLength(1);
		expect(results.reduce((sum, result) => sum + result.amount, 0)).toBe(60);
		expect(await new WalletService(db, ids).show(me.id)).toMatchObject({ balance: 60, points: 80, reservedBalance: 0 });
		expect(await service.transactions(me.id, 30)).toEqual([expect.objectContaining({ type: 'exchange', amount: 60, balance: 60, pointsSpent: 20, actorId: null })]);
	});

	test('idempotent exchange retries work after disabling or changing the rate and reject a different amount', async () => {
		const me = await user(100);
		const requestId = randomUUID();
		await service.exchange(me.id, 20, requestId.toUpperCase());
		await service.updateSettings({ exchangeEnabled: false, exchangeRate: 20 });
		expect(await service.exchange(me.id, 20, requestId)).toEqual({ balance: 20, points: 80, exchanged: false, amount: 0 });
		await expect(service.exchange(me.id, 21, requestId)).rejects.toBeInstanceOf(WalletService.RequestConflictError);
		await expect(service.exchange(me.id, 1, randomUUID())).rejects.toBeInstanceOf(WalletService.ExchangeDisabledError);
	});

	test('distinct concurrent exchanges cannot overspend the same points', async () => {
		const me = await user(100);
		const results = await Promise.allSettled(Array.from({ length: 12 }, () => service.exchange(me.id, 20, randomUUID())));
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5);
		expect(results.filter(result => result.status === 'rejected').every(result => result.reason instanceof WalletService.InsufficientPointsError)).toBe(true);
		expect(await service.show(me.id)).toMatchObject({ balance: 100, points: 0 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ userId: me.id })).toBe(5);
	});

	test('coin and makeup-card exchanges share the existing check-in lock without losing either debit', async () => {
		const me = await user(110);
		const checkin = new CheckinService(db, db.getRepository(MiUserCheckin) as never, db.getRepository(MiUserProfile) as never, {} as never, {} as never, ids, {} as never);
		await Promise.all([service.exchange(me.id, 50, randomUUID()), checkin.exchange(me.id, randomUUID())]);
		expect(await service.show(me.id)).toMatchObject({ balance: 50, points: 0 });
		expect(await db.getRepository(MiUserProfile).findOneByOrFail({ userId: me.id })).toMatchObject({ checkinMakeupCards: 1 });
	});

	test('ledger insertion failure rolls back both coin credit and point debit', async () => {
		const me = await user(100);
		await db.query('CREATE FUNCTION wallet_ledger_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'test ledger failure\'; END $$');
		await db.query('CREATE TRIGGER wallet_ledger_fail BEFORE INSERT ON wallet_transaction FOR EACH ROW EXECUTE FUNCTION wallet_ledger_fail()');
		try {
			await expect(service.exchange(me.id, 10, randomUUID())).rejects.toThrow('test ledger failure');
			expect(await service.show(me.id)).toMatchObject({ balance: 0, points: 100 });
			expect(await db.getRepository(MiWalletTransaction).countBy({ userId: me.id })).toBe(0);
		} finally {
			await db.query('DROP TRIGGER wallet_ledger_fail ON wallet_transaction');
			await db.query('DROP FUNCTION wallet_ledger_fail()');
		}
	});

	test('administrator adjustments are signed, attributable, idempotent and prevent negative balances', async () => {
		const me = await user();
		const admin = await user();
		const requestId = randomUUID();
		const results = await Promise.all(Array.from({ length: 8 }, () => service.adjust(me.id, 50, '  Welcome grant  ', requestId, admin.id)));
		expect(results.filter(result => result.adjusted)).toHaveLength(1);
		await expect(service.adjust(me.id, 51, 'Welcome grant', requestId, admin.id)).rejects.toBeInstanceOf(WalletService.RequestConflictError);
		await expect(service.adjust(me.id, 50, 'Changed reason', requestId, admin.id)).rejects.toBeInstanceOf(WalletService.RequestConflictError);
		await expect(service.adjust(me.id, 50, 'Welcome grant', requestId, me.id)).rejects.toBeInstanceOf(WalletService.RequestConflictError);
		expect(await service.adjust(me.id, -20, 'Correction', randomUUID(), admin.id)).toEqual({ balance: 30, adjusted: true });
		await expect(service.adjust(me.id, -31, 'Overdraw', randomUUID(), admin.id)).rejects.toBeInstanceOf(WalletService.InsufficientBalanceError);
		expect(await service.transactions(me.id, 30)).toEqual([
			expect.objectContaining({ amount: -20, balance: 30, description: 'Correction', actorId: admin.id }),
			expect.objectContaining({ amount: 50, balance: 50, description: 'Welcome grant', actorId: admin.id }),
		]);
	});

	test('operation types cannot reuse the same request ID', async () => {
		const me = await user(100);
		const requestId = randomUUID();
		await service.exchange(me.id, 20, requestId);
		await expect(service.adjust(me.id, 20, 'Grant', requestId, me.id)).rejects.toBeInstanceOf(WalletService.RequestConflictError);
	});

	test.each([undefined, '', ' \n '])('adjustments accept an optional reason (%#), retain attribution and retry without double credit', async reason => {
		const me = await user();
		const admin = await user();
		const endpoint = new AdjustEndpoint(service);
		const requestId = randomUUID();
		const request = { userId: me.id, amount: 50, requestId, ...(reason === undefined ? {} : { reason }) };
		expect(await endpoint.exec(request, admin as never, null)).toEqual({ balance: 50, adjusted: true });
		expect(await endpoint.exec({ ...request, reason: '' }, admin as never, null)).toEqual({ balance: 50, adjusted: false });
		await expect(endpoint.exec({ ...request, reason: 'Changed' }, admin as never, null)).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
		expect(await endpoint.exec({ userId: me.id, amount: -20, requestId: randomUUID() }, admin as never, null)).toEqual({ balance: 30, adjusted: true });
		await expect(endpoint.exec({ userId: me.id, amount: -31, requestId: randomUUID() }, admin as never, null)).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
		expect(await service.transactions(me.id, 30)).toEqual([
			expect.objectContaining({ amount: -20, description: null, actorId: admin.id }),
			expect.objectContaining({ amount: 50, description: null, actorId: admin.id }),
		]);
	});

	test('adjustment reason length counts Unicode characters consistently with API validation and PostgreSQL', async () => {
		const me = await user();
		const endpoint = new AdjustEndpoint(service);
		await expect(endpoint.exec({ userId: me.id, amount: 1, reason: '🎁'.repeat(500), requestId: randomUUID() }, me as never, null)).resolves.toMatchObject({ balance: 1 });
		await expect(endpoint.exec({ userId: me.id, amount: 1, reason: '🎁'.repeat(501), requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	});

	test('outstanding packets reserve capacity so a refund succeeds even at the maximum total balance', async () => {
		const me = await user(10);
		await fund(me.id, WALLET_MAX_BALANCE);
		await db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, -100, { type: 'redPacketSend', relatedId: 'packet1' }));
		expect(await service.show(me.id)).toMatchObject({ balance: WALLET_MAX_BALANCE - 100, reservedBalance: 100 });
		await expect(fund(me.id, 1)).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		await expect(service.exchange(me.id, 1, randomUUID())).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		await db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, 100, { type: 'redPacketRefund', relatedId: 'packet1' }));
		expect(await service.show(me.id)).toMatchObject({ balance: WALLET_MAX_BALANCE, reservedBalance: 0, points: 10 });
		expect((await service.transactions(me.id, 30)).map(row => row.amount)).toEqual([100, -100, WALLET_MAX_BALANCE]);
	});

	test('a full recipient rolls back the sender reservation release and successful claims free capacity', async () => {
		const sender = await user();
		const receiver = await user();
		await fund(sender.id, 100);
		await fund(receiver.id, WALLET_MAX_BALANCE);
		await db.transaction(manager => service.changeBalanceInTransaction(manager, sender.id, -40, { type: 'redPacketSend' }));
		const claim = () => db.transaction(async manager => {
			await service.lockWalletsInTransaction(manager, [sender.id, receiver.id]);
			await service.releaseReservationInTransaction(manager, sender.id, 40);
			await service.changeBalanceInTransaction(manager, receiver.id, 40, { type: 'redPacketClaim' });
		});
		await expect(claim()).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		expect(await service.show(sender.id)).toMatchObject({ balance: 60, reservedBalance: 40 });
		expect((await service.transactions(receiver.id, 30))).toHaveLength(1);
		await service.adjust(receiver.id, -40, 'Make room', randomUUID(), receiver.id);
		await claim();
		expect(await service.show(sender.id)).toMatchObject({ balance: 60, reservedBalance: 0 });
		expect(await service.show(receiver.id)).toMatchObject({ balance: WALLET_MAX_BALANCE, reservedBalance: 0 });
	});

	test('sorted participant locks let opposite-direction claims complete concurrently without deadlocking', async () => {
		const alice = await user();
		const bob = await user();
		await fund(alice.id, 100);
		await fund(bob.id, 100);
		for (const me of [alice, bob]) await db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, -40, { type: 'redPacketSend' }));
		await Promise.all([[alice, bob], [bob, alice]].map(([sender, receiver]) => db.transaction(async manager => {
			await service.lockWalletsInTransaction(manager, [sender.id, receiver.id]);
			await service.releaseReservationInTransaction(manager, sender.id, 40);
			await service.changeBalanceInTransaction(manager, receiver.id, 40, { type: 'redPacketClaim' });
		})));
		for (const me of [alice, bob]) expect(await service.show(me.id)).toMatchObject({ balance: 100, reservedBalance: 0 });
	});

	test('failed debits and invalid or excessive reservation operations preserve all balances', async () => {
		const me = await user();
		await fund(me.id, 100);
		await expect(db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, -101, { type: 'redPacketSend' }))).rejects.toBeInstanceOf(WalletService.InsufficientBalanceError);
		await expect(db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, 1, { type: 'redPacketRefund' }))).rejects.toBeInstanceOf(WalletService.InsufficientReservationError);
		await expect(db.transaction(manager => service.releaseReservationInTransaction(manager, me.id, 1))).rejects.toBeInstanceOf(WalletService.InsufficientReservationError);
		await expect(service.changeBalanceInTransaction(db.manager, me.id, 1, { type: 'redPacketClaim' })).rejects.toThrow('active transaction');
		expect(await service.show(me.id)).toMatchObject({ balance: 100, reservedBalance: 0 });
	});

	test('the balance limit includes safe multiplication and is enforced in SQL as well', async () => {
		const me = await user(WALLET_MAX_BALANCE);
		await service.updateSettings({ exchangeEnabled: true, exchangeRate: 1_000_000 });
		await expect(service.exchange(me.id, WALLET_MAX_BALANCE, randomUUID())).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		await fund(me.id, WALLET_MAX_BALANCE);
		await expect(fund(me.id, 1)).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		await expect(db.getRepository(MiWallet).update({ userId: me.id }, { balance: -1 })).rejects.toThrow();
		await expect(db.getRepository(MiWallet).update({ userId: me.id }, { reservedBalance: 1 })).rejects.toThrow();
		expect(await service.show(me.id)).toMatchObject({ balance: WALLET_MAX_BALANCE, points: WALLET_MAX_BALANCE });
	});

	test('wallet history is private to the requested account and paginates without duplicates', async () => {
		const me = await user();
		const other = await user();
		for (let index = 0; index < 4; index++) await fund(me.id, 5);
		await fund(other.id, 99);
		const endpoint = new TransactionsEndpoint(service);
		const first = await endpoint.exec({ limit: 2 }, me as never, null);
		const second = await endpoint.exec({ limit: 2, untilId: first[1].id }, me as never, null);
		expect(first.map((row: MiWalletTransaction) => row.balance)).toEqual([20, 15]);
		expect(second.map((row: MiWalletTransaction) => row.balance)).toEqual([10, 5]);
		expect(new Set([...first, ...second].map(row => row.id)).size).toBe(4);
		expect(await endpoint.exec({ untilId: second[1].id }, me as never, null)).toEqual([]);
	});

	test('point exchanges reject ineligible users without touching points', async () => {
		for (const overrides of [{ host: 'remote.example' }, { isSuspended: true }, { isDeleted: true }, { movedToUri: 'https://example.com/u' }, { username: 'system.proxy' }]) {
			const me = await user(100, overrides);
			await expect(new ExchangeEndpoint(service).exec({ points: 1, requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'WALLET_NOT_ALLOWED' });
			expect(await db.getRepository(MiUserProfile).findOneByOrFail({ userId: me.id })).toMatchObject({ checkinPoints: 100 });
		}
		await expect(service.adjust('missing', 1, 'Grant', randomUUID(), 'admin')).rejects.toBeInstanceOf(WalletService.NoSuchUserError);
	});

	test('API validation rejects fractional, nonpositive, unsafe and malformed exchange requests', async () => {
		const me = await user(100);
		const exchange = new ExchangeEndpoint(service);
		for (const points of [0, -1, 1.5, WALLET_MAX_BALANCE + 1, Number.MAX_SAFE_INTEGER]) {
			await expect(exchange.exec({ points, requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		await expect(exchange.exec({ points: 1, requestId: 'bad' }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		await expect(exchange.exec({ points: 101, requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'INSUFFICIENT_CHECKIN_POINTS' });
		const adjust = new AdjustEndpoint(service);
		await expect(adjust.exec({ userId: me.id, amount: 0, requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
		for (const amount of [1.5, WALLET_MAX_BALANCE + 1, -WALLET_MAX_BALANCE - 1]) {
			await expect(adjust.exec({ userId: me.id, amount, reason: 'Grant', requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		for (const limit of [0, 101, 1.5]) await expect(new TransactionsEndpoint(service).exec({ limit }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	});

	test('settings persist with bounded integer rates and reject extra singleton IDs', async () => {
		const admin = await user();
		const endpoint = new UpdateSettingsEndpoint(service);
		expect(await endpoint.exec({ id: 'other', exchangeEnabled: false, exchangeRate: 5 }, admin as never, null)).toEqual({ exchangeEnabled: false, exchangeRate: 5 });
		expect(await new WalletService(db, ids).getSettings()).toEqual({ exchangeEnabled: false, exchangeRate: 5 });
		expect(await db.getRepository(MiWalletSettings).count()).toBe(1);
		for (const exchangeRate of [0, -1, 0.5, 1_000_001]) {
			await expect(endpoint.exec({ exchangeEnabled: true, exchangeRate }, admin as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
	});

	test('wallet migration round trip matches the entity schema and allows new transactions', async () => {
		const migrationModule = await import(pathToFileURL(resolve('migration/1790821089956-wallet.js')).href);
		const migration = new migrationModule.Wallet1790821089956();
		const runner = db.createQueryRunner();
		try {
			await migration.down(runner);
			for (const table of ['wallet', 'wallet_transaction', 'wallet_settings']) expect(await runner.hasTable(table)).toBe(false);
			await migration.up(runner);
			const changes = await db.driver.createSchemaBuilder().log();
			expect(changes.upQueries).toEqual([]);
			expect(changes.downQueries).toEqual([]);
			const me = await user(10);
			expect(await service.exchange(me.id, 10, randomUUID())).toMatchObject({ balance: 10, points: 0 });
		} finally {
			await runner.release();
		}
	});
});
