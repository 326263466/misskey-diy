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
import { TipService } from '@/core/TipService.js';
import { ContentTipService } from '@/core/ContentTipService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { CheckinService } from '@/core/CheckinService.js';
import { IdService } from '@/core/IdService.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserCheckin } from '@/models/UserCheckin.js';
import { MiWallet } from '@/models/Wallet.js';
import { MiWalletSettings } from '@/models/WalletSettings.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiRedPacketClaim } from '@/models/RedPacketClaim.js';
import { MiTip, type TipTarget } from '@/models/Tip.js';
import { MiTransfer } from '@/models/Transfer.js';
import { MiNote } from '@/models/Note.js';
import { MiPage } from '@/models/Page.js';
import { MiFollowing } from '@/models/Following.js';
import ShowEndpoint from '@/server/api/endpoints/i/wallet.js';
import ExchangeEndpoint from '@/server/api/endpoints/i/wallet/exchange.js';
import TransactionsEndpoint from '@/server/api/endpoints/i/wallet/transactions.js';
import TipEndpoint from '@/server/api/endpoints/i/wallet/tip.js';
import TipsListEndpoint from '@/server/api/endpoints/tips/list.js';
import AdjustEndpoint from '@/server/api/endpoints/admin/wallet/adjust.js';
import UpdateSettingsEndpoint from '@/server/api/endpoints/admin/wallet/update-settings.js';
import { initTestDb } from '../utils.js';
import type { DataSource } from 'typeorm';

describe('wallet persistence, concurrency and API validation', () => {
	let db: DataSource;
	let service: WalletService;
	let tips: TipService;
	let contentTips: ContentTipService;
	const noteVisibility = { ugcVisibilityForVisitor: 'all', clientOptions: {} };
	let serial = 0;
	const userIds: string[] = [];
	const ids = new IdService({ id: 'aidx' } as never);

	async function user(points = 0, overrides: Partial<MiUser> = {}): Promise<MiUser> {
		const id = `wallettest${String(serial++).padStart(6, '0')}`;
		await db.getRepository(MiUser).insert({ id, username: id, usernameLower: id, ...overrides });
		await db.getRepository(MiUserProfile).insert({ userId: id, checkinPoints: 0 });
		await db.getRepository(MiWallet).insert({ userId: id, balance: points, reservedBalance: 0 });
		userIds.push(id);
		return db.getRepository(MiUser).findOneByOrFail({ id });
	}

	async function fund(userId: string, amount: number) {
		return service.adjust(userId, amount, 'Test grant', randomUUID(), userId);
	}

	async function content(author: MiUser, targetType: TipTarget['targetType'], overrides: Record<string, unknown> = {}, targetId = ids.gen()): Promise<TipTarget> {
		if (targetType === 'note') {
			await db.getRepository(MiNote).insert({ id: targetId, userId: author.id, text: 'Content', visibility: 'public', ...overrides });
		} else {
			await db.getRepository(MiPage).insert({ id: targetId, userId: author.id, name: targetId, title: 'Article', updatedAt: new Date(), alignCenter: false, font: 'sans-serif', visibility: 'public', content: [{ type: 'markdown', text: 'Content' }], ...overrides });
		}
		return { targetType, targetId };
	}

	beforeAll(async () => {
		// Configuration is compiled into built output; NODE_ENV alone cannot make schema reset safe.
		if (!/test/i.test(loadConfig().db.db)) throw new Error('Wallet tests require a database explicitly named for testing.');
		db = await initTestDb();
		service = new WalletService(db, ids);
		const users = {
			pack: async (source: string | MiUser) => typeof source === 'string' ? db.getRepository(MiUser).findOneByOrFail({ id: source }) : source,
			packMany: async (rows: MiUser[]) => rows.map(row => ({ id: row.id, username: row.username })),
		};
		// 保留真实内容可见性逻辑，仅用数据库查询代替其缓存和用户打包依赖。
		const notes = Object.assign(Object.create(NoteEntityService.prototype), {
			idService: ids, meta: noteVisibility, userEntityService: users,
			cacheService: {
				userBlockedCache: { fetch: async () => new Set() },
				userFollowingsCache: { fetch: async (userId: string) => Object.fromEntries((await db.getRepository(MiFollowing).findBy({ followerId: userId })).map(row => [row.followeeId, true])) },
			},
		});
		tips = new TipService(db, ids, service);
		contentTips = new ContentTipService(db, tips, notes as never, users as never);
	});
	beforeEach(async () => { noteVisibility.ugcVisibilityForVisitor = 'all'; await db.getRepository(MiWalletSettings).clear(); });
	afterEach(async () => {
		if (db?.isInitialized && userIds.length) await db.getRepository(MiUser).delete(userIds.splice(0));
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('points are served from the canonical wallet balance', async () => {
		const me = await user(73);
		expect(await new ShowEndpoint(service).exec({}, me as never, null)).toEqual({ balance: 73, reservedBalance: 0, points: 73, exchangeEnabled: false, exchangeRate: 1, pointsPerCoin: 1 });
		expect(await db.getRepository(MiWallet).findOneBy({ userId: me.id })).toMatchObject({ balance: 73, reservedBalance: 0 });
		expect(await service.transactions(me.id, 30)).toEqual([]);
	});

	test('points unification merges legacy points once, preserves reservations, and rolls back only before activity', async () => {
		const migrationModule = await import(pathToFileURL(resolve('migration/1791317993237-wallet-points-unification.js')).href);
		const migration = new migrationModule.WalletPointsUnification1791317993237();
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinPoints: 12 });
		await db.getRepository(MiWallet).update({ userId: me.id }, { balance: 8, reservedBalance: 3 });
		const runner = db.createQueryRunner();
		try {
			await migration.up(runner);
			expect(await db.getRepository(MiWallet).findOneByOrFail({ userId: me.id })).toMatchObject({ balance: 20, reservedBalance: 3 });
			expect(await db.getRepository(MiUserProfile).findOneByOrFail({ userId: me.id })).toMatchObject({ checkinPoints: 0 });
			expect(await db.getRepository(MiWalletTransaction).countBy({ userId: me.id, type: 'pointsUnification' })).toBe(1);
			await migration.up(runner);
			expect(await db.getRepository(MiWallet).findOneByOrFail({ userId: me.id })).toMatchObject({ balance: 20, reservedBalance: 3 });
			expect(await db.getRepository(MiWalletTransaction).countBy({ userId: me.id, type: 'pointsUnification' })).toBe(1);
			await migration.down(runner);
			expect(await db.getRepository(MiWallet).findOneByOrFail({ userId: me.id })).toMatchObject({ balance: 8, reservedBalance: 3 });
			expect(await db.getRepository(MiUserProfile).findOneByOrFail({ userId: me.id })).toMatchObject({ checkinPoints: 12 });
			await migration.up(runner);

			await service.adjust(me.id, 1, 'post-migration activity', randomUUID(), me.id);
			await expect(migration.down(runner)).rejects.toThrow('wallet changed after migration');
		} finally {
			await runner.release();
		}
	});

	test('legacy exchange is permanently disabled', async () => {
		const me = await user(100);
		await expect(service.exchange(me.id, 20, randomUUID())).rejects.toBeInstanceOf(WalletService.ExchangeDisabledError);
		expect(await service.show(me.id)).toMatchObject({ balance: 100, points: 100, reservedBalance: 0, exchangeEnabled: false });
	});

	test('legacy exchange remains disabled regardless of stored settings', async () => {
		const me = await user(100);
		await service.updateSettings({ exchangeEnabled: true, exchangeRate: 20 });
		expect(await service.getSettings()).toMatchObject({ exchangeEnabled: false, exchangeRate: 20 });
		await expect(service.exchange(me.id, 1, randomUUID())).rejects.toBeInstanceOf(WalletService.ExchangeDisabledError);
	});

	test.each([
		{ pointsPerCoin: 100, points: 29 },
		{ pointsPerCoin: 10_000, points: 100 },
	])('legacy fractional exchange requests are disabled', async ({ pointsPerCoin, points }) => {
		const me = await user(1000);
		await service.updateSettings({ exchangeEnabled: true, pointsPerCoin });
		const requestId = randomUUID();
		await expect(service.exchange(me.id, points, requestId)).rejects.toBeInstanceOf(WalletService.ExchangeDisabledError);
		expect(await service.show(me.id)).toMatchObject({ balance: 1000, points: 1000 });
	});

	test('exchange endpoint rejects legacy conversion without changing balance', async () => {
		const me = await user(100);
		await service.updateSettings({ exchangeEnabled: true, pointsPerCoin: 3 });
		const endpoint = new ExchangeEndpoint(service);
		await expect(endpoint.exec({ points: 1, requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'EXCHANGE_DISABLED' });
		expect(await service.show(me.id)).toMatchObject({ balance: 100, points: 100 });
		expect(await service.transactions(me.id, 30)).toEqual([]);
		await expect(endpoint.exec({ points: 3, requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'EXCHANGE_DISABLED' });
	});

	test('distinct legacy exchanges cannot change the points balance', async () => {
		const me = await user(100);
		const results = await Promise.allSettled(Array.from({ length: 12 }, () => service.exchange(me.id, 20, randomUUID())));
		expect(results.every(result => result.status === 'rejected' && result.reason instanceof WalletService.ExchangeDisabledError)).toBe(true);
		expect(await service.show(me.id)).toMatchObject({ balance: 100, points: 100 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ userId: me.id })).toBe(0);
	});

	test('point spending and makeup-card exchanges share the wallet lock without losing either debit', async () => {
		const me = await user(110);
		const checkin = new CheckinService(db, db.getRepository(MiUserCheckin) as never, db.getRepository(MiUserProfile) as never, {} as never, {} as never, ids, {} as never, service);
		await Promise.all([service.adjust(me.id, -50, 'Spend', randomUUID(), me.id), checkin.exchange(me.id, randomUUID())]);
		expect(await service.show(me.id)).toMatchObject({ balance: 0, points: 0 });
		expect(await db.getRepository(MiUserProfile).findOneByOrFail({ userId: me.id })).toMatchObject({ checkinMakeupCards: 1 });
	});

	test('ledger insertion failure rolls back the points debit', async () => {
		const me = await user(100);
		await db.query('CREATE FUNCTION wallet_ledger_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'test ledger failure\'; END $$');
		await db.query('CREATE TRIGGER wallet_ledger_fail BEFORE INSERT ON wallet_transaction FOR EACH ROW EXECUTE FUNCTION wallet_ledger_fail()');
		try {
			await expect(db.transaction(manager => service.changePointsInTransaction(manager, me.id, -10, { type: 'checkinAdminRevoke' }))).rejects.toThrow('test ledger failure');
			expect(await service.show(me.id)).toMatchObject({ balance: 100, points: 100 });
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
		await db.transaction(manager => service.changePointsInTransaction(manager, me.id, 20, { type: 'checkinAdminGrant', requestId }));
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

	test('打赏并发重试只记账一次，直接到账且各付款人的请求凭证独立', async () => {
		const sender = await user();
		const receiver = await user();
		await fund(sender.id, 100);
		await db.transaction(manager => service.changeBalanceInTransaction(manager, sender.id, -10, { type: 'redPacketSend' }));
		const requestId = randomUUID();
		const results = await Promise.all(Array.from({ length: 8 }, () => tips.send(sender.id, receiver.id, 1.01, ' 支持 ', requestId)));
		expect(results.filter(result => result.sent)).toHaveLength(1);
		expect(await service.show(sender.id)).toMatchObject({ balance: 88.99, reservedBalance: 10 });
		expect(await service.show(receiver.id)).toMatchObject({ balance: 1.01, reservedBalance: 0 });
		const sendLedger = await db.getRepository(MiWalletTransaction).findOneByOrFail({ userId: sender.id, type: 'tipSend' });
		const receiveLedger = await db.getRepository(MiWalletTransaction).findOneByOrFail({ userId: receiver.id, type: 'tipReceive' });
		expect(sendLedger).toMatchObject({ amount: -1.01, description: '支持', requestId });
		expect(receiveLedger).toMatchObject({ amount: 1.01, description: '支持', requestId: null });
		expect(sendLedger.relatedId).toBe(receiveLedger.relatedId);
		expect(sendLedger.relatedId).toBe((await db.getRepository(MiTip).findOneByOrFail({ senderId: sender.id, requestId })).id);
		expect(await db.getRepository(MiWalletTransaction).countBy({ userId: sender.id, type: 'tipSend' })).toBe(1);
		expect(await db.getRepository(MiTip).findBy({ senderId: sender.id })).toMatchObject([{ amount: 1.01, message: '支持', targetType: null, targetId: null }]);
		expect(await db.getRepository(MiRedPacket).countBy({ userId: sender.id })).toBe(0);
		expect(await db.getRepository(MiRedPacketClaim).countBy({ userId: receiver.id })).toBe(0);
		const other = await user();
		await fund(other.id, 5);
		// 另一付款人可以使用同一请求编号打赏，收款人也可以独立发起该编号的付款。
		expect(await tips.send(other.id, receiver.id, 1, '', requestId)).toEqual({ balance: 4, amount: 1, sent: true });
		expect(await tips.send(receiver.id, sender.id, 1, '', requestId)).toEqual({ balance: 1.01, amount: 1, sent: true });
		const ledgers = await Promise.all([sender, receiver, other].map(account => service.transactions(account.id, 10)));
		expect(await tips.send(sender.id, receiver.id, 1.01, '支持', requestId)).toEqual({ balance: 89.99, amount: 1.01, sent: false });
		expect(await Promise.all([sender, receiver, other].map(account => service.transactions(account.id, 10)))).toEqual(ledgers);
		expect(await service.show(sender.id)).toMatchObject({ balance: 89.99, reservedBalance: 10 });
		expect(await service.show(receiver.id)).toMatchObject({ balance: 1.01, reservedBalance: 0 });
	});

	test('打赏请求绑定收款人、金额和留言，不允许复用已有请求修改交易', async () => {
		const sender = await user();
		const receiver = await user();
		const other = await user();
		await fund(sender.id, 10);
		const endpoint = new TipEndpoint(tips, contentTips);
		const input = { userId: receiver.id, amount: 1, requestId: randomUUID() };
		expect(await endpoint.exec(input, sender as never, null)).toEqual({ balance: 9, amount: 1, sent: true });
		expect(await endpoint.exec({ ...input, requestId: input.requestId.toUpperCase() }, sender as never, null)).toEqual({ balance: 9, amount: 1, sent: false });
		for (const changes of [{ userId: other.id }, { amount: 2 }, { message: '更改留言' }]) {
			await expect(endpoint.exec({ ...input, ...changes }, sender as never, null)).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
		}
		expect(await service.show(sender.id)).toMatchObject({ balance: 9 });
		expect(await service.show(receiver.id)).toMatchObject({ balance: 1 });
		expect(await service.show(other.id)).toMatchObject({ balance: 0 });
		expect(await db.getRepository(MiTip).findBy({ senderId: sender.id })).toMatchObject([{ message: null }]);
		// 历史流水关联对方用户，成功重试仍按原打赏凭证返回当前余额，不改写历史。
		await db.getRepository(MiWalletTransaction).update({ userId: sender.id, requestId: input.requestId }, { relatedId: receiver.id });
		await db.getRepository(MiWalletTransaction).update({ userId: receiver.id, type: 'tipReceive' }, { relatedId: sender.id });
		await fund(sender.id, 2);
		const before = await Promise.all([service.transactions(sender.id, 10), service.transactions(receiver.id, 10)]);
		expect(await endpoint.exec(input, sender as never, null)).toEqual({ balance: 11, amount: 1, sent: false });
		expect(await Promise.all([service.transactions(sender.id, 10), service.transactions(receiver.id, 10)])).toEqual(before);
	});

	test('打赏余额不足或收款钱包已满时，双方余额和流水一起回滚', async () => {
		const sender = await user();
		const receiver = await user();
		await fund(sender.id, 10);
		await fund(receiver.id, WALLET_MAX_BALANCE);
		const endpoint = new TipEndpoint(tips, contentTips);
		await expect(endpoint.exec({ userId: receiver.id, amount: 1, requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'BALANCE_LIMIT_EXCEEDED' });
		await expect(endpoint.exec({ userId: receiver.id, amount: 11, requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
		expect(await service.show(sender.id)).toMatchObject({ balance: 10, reservedBalance: 0 });
		expect(await service.show(receiver.id)).toMatchObject({ balance: WALLET_MAX_BALANCE, reservedBalance: 0 });
		expect(await service.transactions(sender.id, 10)).toHaveLength(1);
		expect(await service.transactions(receiver.id, 10)).toHaveLength(1);
		expect(await db.getRepository(MiTip).countBy({ senderId: sender.id })).toBe(0);
	});

	test.each(['sender', 'receiver'] as const)('打赏拒绝不可用的 %s 账户', async side => {
		for (const changes of [{ host: 'remote.example' }, { isSuspended: true }, { isDeleted: true }, { movedToUri: 'https://example.com/user' }, { username: 'system.proxy' }]) {
			const sender = await user();
			const receiver = await user();
			await fund(sender.id, 10);
			await db.getRepository(MiUser).update(side === 'sender' ? sender.id : receiver.id, changes);
			await expect(tips.send(sender.id, receiver.id, 1, '', randomUUID())).rejects.toBeInstanceOf(WalletService.NotAllowedError);
			expect(await service.show(sender.id)).toMatchObject({ balance: 10, reservedBalance: 0 });
			expect(await service.transactions(receiver.id, 10)).toEqual([]);
		}
	});

	test('打赏拒绝自身、不存在的收款人和任意一方的屏蔽关系', async () => {
		const sender = await user();
		const receiver = await user();
		await fund(sender.id, 10);
		const endpoint = new TipEndpoint(tips, contentTips);
		await expect(endpoint.exec({ userId: sender.id, amount: 1, requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'WALLET_NOT_ALLOWED' });
		await expect(endpoint.exec({ userId: ids.gen(), amount: 1, requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_USER' });
		for (const [blockerId, blockeeId] of [[sender.id, receiver.id], [receiver.id, sender.id]]) {
			const id = ids.gen();
			await db.getRepository(MiBlocking).insert({ id, blockerId, blockeeId });
			await expect(endpoint.exec({ userId: receiver.id, amount: 1, requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'WALLET_NOT_ALLOWED' });
			await db.getRepository(MiBlocking).delete(id);
		}
		expect(await service.show(sender.id)).toMatchObject({ balance: 10, reservedBalance: 0 });
		expect(await service.transactions(receiver.id, 10)).toEqual([]);
	});

	test('打赏校验金额范围、小数精度和Unicode留言长度，并限制流水方向', async () => {
		const sender = await user();
		const receiver = await user();
		await fund(sender.id, 100);
		const endpoint = new TipEndpoint(tips, contentTips);
		for (const amount of [-1, 0, 0.99, 1000.01]) {
			await expect(endpoint.exec({ userId: receiver.id, amount, requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		await expect(endpoint.exec({ userId: receiver.id, amount: 1.001, requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
		await expect(endpoint.exec({ userId: receiver.id, amount: 1, message: '🎁'.repeat(101), requestId: randomUUID() }, sender as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		await expect(endpoint.exec({ userId: receiver.id, amount: 1, requestId: 'invalid' }, sender as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		await expect(db.transaction(manager => service.changeBalanceInTransaction(manager, sender.id, 1, { type: 'tipSend' }))).rejects.toBeInstanceOf(WalletService.InvalidAmountError);
		await expect(db.transaction(manager => service.changeBalanceInTransaction(manager, sender.id, -1, { type: 'tipReceive' }))).rejects.toBeInstanceOf(WalletService.InvalidAmountError);
		expect(await endpoint.exec({ userId: receiver.id, amount: 1, message: '🎁'.repeat(100), requestId: randomUUID() }, sender as never, null)).toMatchObject({ balance: 99, sent: true });
		expect(await service.transactions(receiver.id, 10)).toMatchObject([{ type: 'tipReceive', description: '🎁'.repeat(100) }]);
		expect(await db.getRepository(MiTip).findBy({ senderId: sender.id })).toMatchObject([{ message: '🎁'.repeat(100) }]);
	});

	test('内容打赏按目标分页和汇总，寄语选填且删除付款人后仍保留，个人打赏不混入', async () => {
		const sender = await user();
		const author = await user();
		const note = await content(author, 'note');
		const page = await content(author, 'page', {}, note.targetId);
		await fund(sender.id, 100);
		const endpoint = new TipEndpoint(tips, contentTips);
		for (const [target, amount, message] of [[note, 1.01, ' 支持 '], [note, 2, undefined], [page, 3, ' 文章寄语 '], [page, 5, undefined]] as const) {
			const input = { ...target, userId: author.id, amount, requestId: randomUUID(), ...(message === undefined ? {} : { message }) };
			expect(await endpoint.exec(input, sender as never, null)).toMatchObject({ sent: true });
			expect(await endpoint.exec({ ...input, message: message?.trim() ?? ' \n ' }, sender as never, null)).toMatchObject({ sent: false });
		}
		await tips.send(sender.id, author.id, 4, '', randomUUID());
		const first = await contentTips.list(note, null, 1);
		expect(first).toMatchObject({ totalCount: 2, totalAmount: 3.01, items: [{ user: { id: sender.id }, amount: 2, message: null }] });
		expect(Object.keys(first.items[0]).sort()).toEqual(['amount', 'createdAt', 'id', 'message', 'user']);
		expect(await contentTips.list(note, null, 1, first.items[0].id)).toMatchObject({ totalCount: 2, totalAmount: 3.01, items: [{ amount: 1.01, message: '支持' }] });
		expect(await new TipsListEndpoint(contentTips).exec({ ...page }, null, null)).toMatchObject({ totalCount: 2, totalAmount: 8, items: [{ amount: 5, message: null }, { amount: 3, message: '文章寄语' }] });
		await db.getRepository(MiUser).delete(sender.id);
		expect(await contentTips.list(note, null, 20)).toMatchObject({ totalCount: 2, totalAmount: 3.01, items: [{ user: null, message: null }, { user: null, message: '支持' }] });
		expect(await contentTips.list(page, null, 20)).toMatchObject({ items: [{ user: null, message: null }, { user: null, message: '文章寄语' }] });
	});

	test('内容目标绑定原打赏请求，删除目标后重试不再付款且公共列表不可读', async () => {
		const sender = await user();
		const author = await user();
		const first = await content(author, 'note');
		const second = await content(author, 'note');
		await fund(sender.id, 10);
		const requestId = randomUUID();
		const results = await Promise.all(Array.from({ length: 3 }, () => contentTips.send(sender.id, author.id, 1, '', requestId, first)));
		expect(results.filter(result => result.sent)).toHaveLength(1);
		expect(results.every(result => result.balance === 9)).toBe(true);
		await expect(contentTips.send(sender.id, author.id, 1, '', requestId, second)).rejects.toBeInstanceOf(WalletService.RequestConflictError);
		await expect(tips.send(sender.id, author.id, 1, '', requestId)).rejects.toBeInstanceOf(WalletService.RequestConflictError);
		await db.getRepository(MiNote).delete(first.targetId);
		expect(await contentTips.send(sender.id, author.id, 1, '', requestId, first)).toMatchObject({ sent: false, balance: 9 });
		await expect(contentTips.send(sender.id, author.id, 1, '', randomUUID(), first)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
		await expect(new TipsListEndpoint(contentTips).exec(first, null, null)).rejects.toMatchObject({ code: 'NO_SUCH_TIP_TARGET' });
		expect(await db.getRepository(MiTip).countBy({ senderId: sender.id })).toBe(1);
		expect(await service.show(author.id)).toMatchObject({ balance: 1 });
	});

	test.each(['note', 'page'] as const)('%s 内容打赏拒绝错误收款人和不完整的目标参数', async targetType => {
		const sender = await user();
		const author = await user();
		const other = await user();
		const target = await content(author, targetType);
		await fund(sender.id, 10);
		const endpoint = new TipEndpoint(tips, contentTips);
		const input = { userId: other.id, amount: 1, requestId: randomUUID() };
		await expect(endpoint.exec({ ...input, ...target }, sender as never, null)).rejects.toMatchObject({ code: 'WALLET_NOT_ALLOWED' });
		for (const partial of [{ targetType }, { targetId: target.targetId }]) {
			await expect(endpoint.exec({ ...input, ...partial }, sender as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		expect(await service.show(sender.id)).toMatchObject({ balance: 10 });
		expect(await db.getRepository(MiTip).countBy({ senderId: sender.id })).toBe(0);
	});

	test.each([
		['note', 'specified'], ['note', 'followers'], ['page', 'specified'], ['page', 'followers'],
	] as const)('%s 的 %s 可见范围同时限制打赏与汇总', async (targetType, visibility) => {
		const sender = await user();
		const author = await user();
		const stranger = await user();
		const target = await content(author, targetType, { visibility, visibleUserIds: [sender.id] });
		if (visibility === 'followers') await db.getRepository(MiFollowing).insert({ id: ids.gen(), followerId: sender.id, followeeId: author.id });
		await fund(sender.id, 10);
		await contentTips.send(sender.id, author.id, 1, '', randomUUID(), target);
		expect(await contentTips.list(target, sender, 20)).toMatchObject({ totalCount: 1, totalAmount: 1 });
		for (const viewer of [null, stranger]) await expect(contentTips.list(target, viewer, 20)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
		await db.getRepository(MiFollowing).delete({ followerId: sender.id, followeeId: author.id });
		if (targetType === 'note') await db.getRepository(MiNote).update(target.targetId, { visibleUserIds: [] });
		else await db.getRepository(MiPage).update(target.targetId, { visibleUserIds: [] });
		await expect(contentTips.list(target, sender, 20)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
		await expect(contentTips.send(sender.id, author.id, 1, '', randomUUID(), target)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
		expect(await service.show(sender.id)).toMatchObject({ balance: 9 });
	});

	test('帖子打赏遵守访客限制、按时间隐藏、删除占位和双向屏蔽', async () => {
		const sender = await user();
		const author = await user();
		const target = await content(author, 'note');
		await fund(sender.id, 10);
		await contentTips.send(sender.id, author.id, 1, '', randomUUID(), target);
		await db.getRepository(MiUser).update(author.id, { requireSigninToViewContents: true });
		await expect(contentTips.list(target, null, 20)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
		expect(await contentTips.list(target, sender, 20)).toMatchObject({ totalCount: 1 });
		await db.getRepository(MiUser).update(author.id, { requireSigninToViewContents: false });
		noteVisibility.ugcVisibilityForVisitor = 'none';
		await expect(contentTips.list(target, null, 20)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
		noteVisibility.ugcVisibilityForVisitor = 'all';
		for (const field of ['makeNotesHiddenBefore', 'makeNotesFollowersOnlyBefore'] as const) {
			await db.getRepository(MiUser).update(author.id, { [field]: Math.floor(Date.now() / 1000) + 60 });
			await expect(contentTips.list(target, sender, 20)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
			await expect(contentTips.send(sender.id, author.id, 1, '', randomUUID(), target)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
			await db.getRepository(MiUser).update(author.id, { [field]: null });
		}
		for (const [blockerId, blockeeId] of [[sender.id, author.id], [author.id, sender.id]]) {
			const id = ids.gen();
			await db.getRepository(MiBlocking).insert({ id, blockerId, blockeeId });
			await expect(contentTips.list(target, sender, 20)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
			await db.getRepository(MiBlocking).delete(id);
		}
		await db.getRepository(MiNote).update(target.targetId, { threadId: 'reply-hidden:deleted:note' });
		await expect(contentTips.list(target, sender, 20)).rejects.toBeInstanceOf(ContentTipService.NoSuchTargetError);
	});

	test('内容打赏迁移可回滚重建，并与实体及数据库金额约束一致', async () => {
		const module = await import(pathToFileURL(resolve('migration/1791254648999-ContentTips.js')).href);
		const migration = new module.ContentTips1791254648999();
		const messageModule = await import(pathToFileURL(resolve('migration/1791267213599-tip-message.js')).href);
		const messageMigration = new messageModule.TipMessage1791267213599();
		const runner = db.createQueryRunner();
		try {
			await migration.down(runner);
			expect(await runner.hasTable('tip')).toBe(false);
			await migration.up(runner);
			await messageMigration.up(runner);
			expect((await db.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
			const sender = await user();
			const values = { id: ids.gen(), senderId: sender.id, recipientId: ids.gen(), requestId: randomUUID(), amount: 1, createdAt: new Date() };
			await expect(db.getRepository(MiTip).insert({ ...values, amount: 0.99 })).rejects.toThrow();
			await expect(db.getRepository(MiTip).insert({ ...values, targetType: 'note' })).rejects.toThrow();
		} finally {
			await runner.release();
		}
	});

	test('打赏寄语迁移仅回填原付款流水，空寄语和已删除付款人保持为空，支持回滚', async () => {
		const module = await import(pathToFileURL(resolve('migration/1791267213599-tip-message.js')).href);
		const migration = new module.TipMessage1791267213599();
		const sender = await user();
		const author = await user();
		await fund(sender.id, 10);
		const targets = [await content(author, 'note'), await content(author, 'page')];
		const requestIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
		for (const [index, requestId] of requestIds.entries()) {
			await contentTips.send(sender.id, author.id, 1, index === 0 ? '支持' : '', requestId, targets[index % targets.length]);
		}
		const rows = await db.getRepository(MiTip).findBy({ senderId: sender.id });
		const fourth = rows.find(row => row.requestId === requestIds[3])!;
		await db.getRepository(MiTip).update(fourth.id, { senderId: null });
		await db.getRepository(MiWalletTransaction).update({ userId: sender.id, requestId: requestIds[0] }, { description: ' 支持 ' });
		await db.getRepository(MiWalletTransaction).update({ userId: sender.id, requestId: requestIds[1] }, { description: '   ' });
		await db.getRepository(MiWalletTransaction).update({ userId: sender.id, requestId: requestIds[2] }, { type: 'adminAdjustment', description: '非打赏流水' });
		await db.getRepository(MiWalletTransaction).update({ userId: sender.id, requestId: requestIds[3] }, { description: '已删除付款人' });
		// 同一凭证下的收款流水不得成为寄语来源。
		const receive = await db.getRepository(MiWalletTransaction).findOneByOrFail({ userId: author.id, type: 'tipReceive' });
		await db.getRepository(MiWalletTransaction).update(receive.id, { requestId: requestIds[2], description: '收款流水' });
		const runner = db.createQueryRunner();
		try {
			await migration.down(runner);
			expect(await runner.hasColumn('tip', 'message')).toBe(false);
			await migration.up(runner);
			expect((await db.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
			for (const row of rows) {
				expect(await db.getRepository(MiTip).findOneByOrFail({ id: row.id })).toMatchObject({ message: row.requestId === requestIds[0] ? '支持' : null });
			}
			expect(await service.show(sender.id)).toMatchObject({ balance: 6 });
			expect(await service.show(author.id)).toMatchObject({ balance: 4 });
		} finally {
			await runner.release();
		}
	});

	test('outstanding packets reserve capacity so a refund succeeds even at the maximum total balance', async () => {
		const me = await user();
		await fund(me.id, WALLET_MAX_BALANCE);
		await db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, -100, { type: 'redPacketSend', relatedId: 'packet1' }));
		expect(await service.show(me.id)).toMatchObject({ balance: WALLET_MAX_BALANCE - 100, reservedBalance: 100 });
		await expect(fund(me.id, 1)).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		await expect(db.transaction(manager => service.changePointsInTransaction(manager, me.id, 1, { type: 'checkinReward' }))).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		await db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, 100, { type: 'redPacketRefund', relatedId: 'packet1' }));
		expect(await service.show(me.id)).toMatchObject({ balance: WALLET_MAX_BALANCE, reservedBalance: 0, points: WALLET_MAX_BALANCE });
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
			await service.releaseReservationInTransaction(manager, sender.id, 40, { type: 'redPacketReservationRelease', relatedId: 'packet1' });
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
			await service.releaseReservationInTransaction(manager, sender.id, 40, { type: 'redPacketReservationRelease', relatedId: 'packet1' });
			await service.changeBalanceInTransaction(manager, receiver.id, 40, { type: 'redPacketClaim' });
		})));
		for (const me of [alice, bob]) expect(await service.show(me.id)).toMatchObject({ balance: 100, reservedBalance: 0 });
	});

	test('failed debits and invalid or excessive reservation operations preserve all balances', async () => {
		const me = await user();
		await fund(me.id, 100);
		await expect(db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, -101, { type: 'redPacketSend' }))).rejects.toBeInstanceOf(WalletService.InsufficientBalanceError);
		await expect(db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, 1, { type: 'redPacketRefund' }))).rejects.toBeInstanceOf(WalletService.InsufficientReservationError);
		await expect(db.transaction(manager => service.releaseReservationInTransaction(manager, me.id, 1, { type: 'redPacketReservationRelease', relatedId: 'packet1' }))).rejects.toBeInstanceOf(WalletService.InsufficientReservationError);
		await expect(service.changeBalanceInTransaction(db.manager, me.id, 1, { type: 'redPacketClaim' })).rejects.toThrow('active transaction');
		expect(await service.show(me.id)).toMatchObject({ balance: 100, reservedBalance: 0 });
	});

	test('the points balance limit is enforced in SQL as well', async () => {
		const me = await user(WALLET_MAX_BALANCE);
		await expect(fund(me.id, 1)).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		await expect(db.getRepository(MiWallet).update({ userId: me.id }, { balance: -1 })).rejects.toThrow();
		await expect(db.getRepository(MiWallet).update({ userId: me.id }, { reservedBalance: 1 })).rejects.toThrow();
		expect(await service.show(me.id)).toMatchObject({ balance: WALLET_MAX_BALANCE, points: WALLET_MAX_BALANCE });
	});

	test('期初积分只补历史差额，分页排在最早且可重复执行和回滚', async () => {
		const module = await import(pathToFileURL(resolve('migration/1791309050878-wallet-points-opening-balance.js')).href);
		const migration = new module.WalletPointsOpeningBalance1791309050878();
		const cases = [
			{ opening: 50, changes: [] },
			{ opening: 10, changes: [5, -8] },
			{ opening: 20, changes: [-20] },
			{ opening: 0, changes: [5] },
		];
		const accounts = [];
		for (const item of cases) {
			const me = await user(item.opening);
			for (const amount of item.changes) {
				await db.transaction(manager => service.changePointsInTransaction(manager, me.id, amount, { type: 'checkinReward' }));
			}
			await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinPoints: item.opening + item.changes.reduce((sum, amount) => sum + amount, 0) });
			accounts.push({ ...item, me });
		}
		const runner = db.createQueryRunner();
		try {
			await migration.up(runner);
			await migration.up(runner);
			for (const { opening, changes, me } of accounts) {
				const rows = await db.getRepository(MiWalletTransaction).findBy({ userId: me.id, currency: 'points' });
				const initial = rows.filter(row => row.type === 'pointsOpeningBalance');
				expect(initial).toHaveLength(opening ? 1 : 0);
				if (opening) expect(initial[0]).toMatchObject({ amount: opening, balance: opening });
				const points = opening + changes.reduce((sum, amount) => sum + amount, 0);
				expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(points);
				expect(await service.show(me.id)).toMatchObject({ points });
				if (opening && changes.length) {
					const activity = rows.filter(row => row.type !== 'pointsOpeningBalance');
					expect(initial[0].createdAt.getTime()).toBeLessThan(Math.min(...activity.map(row => row.createdAt.getTime())));
					const newest = await service.transactions(me.id, changes.length);
					expect(newest.every(row => row.type !== 'pointsOpeningBalance')).toBe(true);
					expect(await service.transactions(me.id, 1, newest.at(-1)!.id)).toMatchObject([{ id: initial[0].id }]);
				}
			}
			await migration.down(runner);
			expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'pointsOpeningBalance' })).toBe(0);
			await migration.up(runner);
			expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'pointsOpeningBalance' })).toBe(3);
		} finally {
			await runner.release();
		}
	});

	test('期初积分发现负差额或超限时整批拒绝，不改变余额或部分写入', async () => {
		const module = await import(pathToFileURL(resolve('migration/1791309050878-wallet-points-opening-balance.js')).href);
		const migration = new module.WalletPointsOpeningBalance1791309050878();
		const valid = await user(10);
		const invalid = await user();
		await db.getRepository(MiUserProfile).update({ userId: valid.id }, { checkinPoints: 10 });
		await db.transaction(manager => service.changePointsInTransaction(manager, invalid.id, 5, { type: 'checkinReward' }));
		const runner = db.createQueryRunner();
		try {
			for (const points of [4, WALLET_MAX_BALANCE + 6]) {
				await db.getRepository(MiUserProfile).update(invalid.id, { checkinPoints: points });
				await expect(migration.up(runner)).rejects.toThrow('Invalid points opening balance');
				expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'pointsOpeningBalance' })).toBe(0);
				expect(await service.show(valid.id)).toMatchObject({ points: 10 });
				expect(await service.show(invalid.id)).toMatchObject({ points: 5 });
			}
		} finally {
			await runner.release();
		}
	});

	test('points ledger rejects credits above the account limit before changing the profile', async () => {
		const me = await user(WALLET_MAX_BALANCE);
		await expect(db.transaction(manager => service.changePointsInTransaction(manager, me.id, 1, { type: 'checkinReward' })))
			.rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		expect(await service.show(me.id)).toMatchObject({ points: WALLET_MAX_BALANCE });
		expect(await db.getRepository(MiWalletTransaction).countBy({ userId: me.id, currency: 'points' })).toBe(0);
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

	test('积分流水分类先筛选再分页，且始终限定当前账户', async () => {
		const me = await user(100);
		const other = await user(100);
		const activity = [
			['checkinReward', 2], ['transferSend', -2], ['adminAdjustment', 2],
			['redPacketClaim', 2], ['transferReservationRelease', 0], ['tipSend', -2],
			['shopPurchase', -2], ['transferRefund', 2], ['redPacketSend', -2],
			['tipReceive', 2], ['redPacketReservationRelease', 0], ['transferReceive', 2],
			['redPacketRefund', 2], ['checkinMakeupExchange', -2], ['pointsUnification', 2],
			['adminAdjustment', -2],
		] as const;
		const rows = activity.map(([type, amount], index) => ({
			id: ids.gen(Date.UTC(2026, 0, 1) + index * 1000), userId: me.id, type, amount,
			createdAt: new Date(Date.UTC(2026, 0, 1) + index * 1000), currency: 'points' as const,
			balance: 100, reservedAmount: amount === 0 ? -2 : 0, reservedBalance: 0,
		}));
		await db.getRepository(MiWalletTransaction).insert([
			...rows,
			...rows.map(row => ({ ...row, id: ids.gen(), userId: other.id })),
		]);
		const endpoint = new TransactionsEndpoint(service);
		const cases = [
			{ category: 'all', indices: [15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
			{ category: 'income', indices: [12, 11, 9, 7, 3, 2, 0] },
			{ category: 'expense', indices: [15, 13, 8, 6, 5, 1] },
			{ category: 'transfer', indices: [11, 7, 4, 1] },
			{ category: 'online', indices: [12, 10, 9, 8, 5, 3] },
		] as const;
		for (const { category, indices } of cases) {
			const expected = indices.map(index => rows[index].id);
			let untilId: string | undefined;
			for (let page = 0; page <= Math.ceil(expected.length / 2); page++) {
				const result = await endpoint.exec({ category, limit: 2, untilId, userId: other.id }, me as never, null);
				expect(result.map((row: MiWalletTransaction) => row.id)).toEqual(expected.slice(page * 2, page * 2 + 2));
				untilId = result.at(-1)?.id;
			}
		}
	});

	test('流水方向按真实业务参与方解析，冻结释放和退款不泄漏或猜测对手', async () => {
		const me = await user(100);
		const peer = await user();
		const now = new Date();
		const insertLedger = async (userId: string, type: MiWalletTransaction['type'], amount: number, relatedId: string, reservedAmount = 0, actorId: string | null = null) => {
			await db.getRepository(MiWalletTransaction).insert({
				id: ids.gen(), userId, createdAt: new Date(), type, currency: 'points', amount, balance: 100,
				reservedAmount, reservedBalance: 0, description: null, relatedId, requestId: null, pointsSpent: null, actorId,
			});
		};
		await tips.send(me.id, peer.id, 1, 'tip', randomUUID());
		const transferId = ids.gen();
		await db.getRepository(MiTransfer).insert({
			id: transferId, senderId: me.id, recipientId: peer.id, requestId: randomUUID(), amount: 3, message: null,
			status: 'accepted', createdAt: now, expiresAt: new Date(now.getTime() + 86_400_000), completedAt: now,
		});
		await insertLedger(me.id, 'transferSend', -3, transferId, 3);
		await insertLedger(me.id, 'transferReservationRelease', 0, transferId, -3);
		const refundId = ids.gen();
		await db.getRepository(MiTransfer).insert({
			id: refundId, senderId: me.id, recipientId: peer.id, requestId: randomUUID(), amount: 2, message: null,
			status: 'refunded', createdAt: now, expiresAt: new Date(now.getTime() + 86_400_000), completedAt: now,
		});
		await insertLedger(me.id, 'transferRefund', 2, refundId, -2);
		const packetId = ids.gen();
		await db.getRepository(MiRedPacket).insert({
			id: packetId, kind: 'group', audience: 'public', roomId: null, userId: me.id, recipientIdsHash: 'hash', requestId: randomUUID(),
			mode: 'equal', message: 'packet', password: null, coverId: 'classic', coverFileId: null, coverUrl: null,
			totalCoins: 3, count: 2, remainingCoins: 0, remainingCount: 0, expiresInHours: 24, startsAt: null,
			expiresAt: new Date(now.getTime() + 86_400_000), status: 'exhausted',
		});
		const claimId = ids.gen();
		await db.getRepository(MiRedPacketClaim).insert({ id: claimId, redPacketId: packetId, userId: peer.id, coins: 2, createdAt: now });
		await insertLedger(me.id, 'redPacketSend', -3, packetId, 3);
		await insertLedger(peer.id, 'redPacketClaim', 2, packetId);
		await insertLedger(me.id, 'redPacketReservationRelease', 0, packetId, -2, peer.id);
		await insertLedger(me.id, 'redPacketReservationRelease', 0, packetId, -1);
		await insertLedger(me.id, 'redPacketRefund', 1, packetId, -1);
		const mine = await service.transactionsWithFlow(me.id, 100);
		const forPeer = await service.transactionsWithFlow(peer.id, 100);
		const find = (rows: typeof mine, type: MiWalletTransaction['type'], relatedId: string) => rows.find(row => row.type === type && row.relatedId === relatedId)!;
		expect(find(mine, 'tipSend', (await db.getRepository(MiTip).findOneByOrFail({ senderId: me.id, recipientId: peer.id })).id).flow).toMatchObject({ from: 'user', to: 'user', fromUserId: me.id, toUserId: peer.id });
		expect(find(mine, 'transferSend', transferId).flow).toMatchObject({ from: 'user', to: 'user', fromUserId: me.id, toUserId: peer.id });
		expect(find(mine, 'transferReservationRelease', transferId).flow).toMatchObject({ from: 'user', to: 'user', fromUserId: me.id, toUserId: peer.id });
		expect(find(mine, 'transferRefund', refundId).flow).toMatchObject({ from: 'reserved', to: 'user', fromUserId: null, toUserId: me.id });
		expect(find(mine, 'redPacketSend', packetId).flow).toMatchObject({ from: 'user', to: 'redPacket', fromUserId: me.id, toUserId: null });
		expect(find(forPeer, 'redPacketClaim', packetId).flow).toMatchObject({ from: 'user', to: 'user', fromUserId: me.id, toUserId: peer.id });
	const releases = mine.filter(row => row.type === 'redPacketReservationRelease' && row.relatedId === packetId);
		expect(releases.find(row => row.actorId === peer.id)?.flow).toMatchObject({ from: 'user', to: 'user', fromUserId: me.id, toUserId: peer.id });
		expect(releases.find(row => row.actorId == null)?.flow).toMatchObject({ from: 'user', to: 'redPacket', fromUserId: me.id, toUserId: null });
		expect(find(mine, 'redPacketRefund', packetId).flow).toMatchObject({ from: 'redPacket', to: 'user', fromUserId: null, toUserId: me.id });
	});

	test('legacy exchanges reject all accounts without touching points', async () => {
		for (const overrides of [{ host: 'remote.example' }, { isSuspended: true }, { isDeleted: true }, { movedToUri: 'https://example.com/u' }, { username: 'system.proxy' }]) {
			const me = await user(100, overrides);
			await expect(new ExchangeEndpoint(service).exec({ points: 1, requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'EXCHANGE_DISABLED' });
			expect(await service.show(me.id)).toMatchObject({ balance: 100, points: 100 });
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
		await expect(exchange.exec({ points: 101, requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'EXCHANGE_DISABLED' });
		const adjust = new AdjustEndpoint(service);
		await expect(adjust.exec({ userId: me.id, amount: 0, requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
		await expect(adjust.exec({ userId: me.id, amount: 1.005, reason: 'Grant', requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
		for (const amount of [WALLET_MAX_BALANCE + 1, -WALLET_MAX_BALANCE - 1]) {
			await expect(adjust.exec({ userId: me.id, amount, reason: 'Grant', requestId: randomUUID() }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		for (const limit of [0, 101, 1.5]) await expect(new TransactionsEndpoint(service).exec({ limit }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		for (const category of ['invalid', 'Income', null, 1]) await expect(new TransactionsEndpoint(service).exec({ category }, me as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	});

	test('settings persist with bounded integer rates and reject extra singleton IDs', async () => {
		const admin = await user();
		const endpoint = new UpdateSettingsEndpoint(service);
		expect(await endpoint.exec({ id: 'other', exchangeEnabled: false, exchangeRate: 5 }, admin as never, null)).toEqual({ exchangeEnabled: false, exchangeRate: 5, pointsPerCoin: null });
		expect(await new WalletService(db, ids).getSettings()).toEqual({ exchangeEnabled: false, exchangeRate: 5, pointsPerCoin: null });
		expect(await db.getRepository(MiWalletSettings).count()).toBe(1);
		for (const exchangeRate of [0, -1, 0.5, 1_000_001]) {
			await expect(endpoint.exec({ exchangeEnabled: true, exchangeRate }, admin as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		for (const pointsPerCoin of [0, -1, 0.5, 1_000_001]) {
			await expect(endpoint.exec({ exchangeEnabled: true, pointsPerCoin }, admin as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		for (const patch of [{}, { exchangeRate: 1, pointsPerCoin: 100 }]) {
			await expect(endpoint.exec({ exchangeEnabled: true, ...patch }, admin as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		expect(await endpoint.exec({ exchangeEnabled: true, pointsPerCoin: 100 }, admin as never, null)).toEqual({ exchangeEnabled: false, exchangeRate: 0.01, pointsPerCoin: 100 });
		expect(await new WalletService(db, ids).getSettings()).toEqual({ exchangeEnabled: false, exchangeRate: 0.01, pointsPerCoin: 100 });
		expect(await endpoint.exec({ exchangeEnabled: true, exchangeRate: 3 }, admin as never, null)).toEqual({ exchangeEnabled: false, exchangeRate: 3, pointsPerCoin: null });
	});

	test('decimal point credits and debits persist exact balances and ledger amounts', async () => {
		const me = await user(10);
		const endpoint = new AdjustEndpoint(service);
		for (const amount of [0.1, 0.2, -0.29]) {
			await endpoint.exec({ userId: me.id, amount, requestId: randomUUID() }, me as never, null);
		}
		expect(await service.show(me.id)).toMatchObject({ balance: 10.01, points: 10.01 });
		await db.transaction(manager => service.changePointsInTransaction(manager, me.id, 1, { type: 'checkinReward' }));
		expect((await service.transactions(me.id, 10)).map(row => row.balance)).toEqual([11.01, 10.01, 10.3, 10.1]);
		await expect(service.exchange(me.id, 0.5, randomUUID())).rejects.toBeInstanceOf(WalletService.InvalidAmountError);
	});

	test('balance capacity and database constraints account for the last cent of reserved funds', async () => {
		const me = await user();
		await fund(me.id, 1999999999.99);
		await fund(me.id, 0.01);
		await db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, -0.01, { type: 'redPacketSend' }));
		await expect(fund(me.id, 0.01)).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		await expect(db.getRepository(MiWallet).update({ userId: me.id }, { reservedBalance: 0.02 })).rejects.toThrow();
		await db.transaction(manager => service.changeBalanceInTransaction(manager, me.id, 0.01, { type: 'redPacketRefund' }));
		expect(await service.show(me.id)).toMatchObject({ balance: 2000000000, reservedBalance: 0 });
	});

	test('decimal migration preserves integer history and refuses to truncate fractional money on rollback', async () => {
		const module = await import(pathToFileURL(resolve('migration/1790948183102-DecimalWalletCoins.js')).href);
		const migration = new module.DecimalWalletCoins1790948183102();
		const me = await user();
		await fund(me.id, 123);
		const runner = db.createQueryRunner();
		try {
			await migration.down(runner);
			await migration.up(runner);
			expect(await service.show(me.id)).toMatchObject({ balance: 123 });
			expect(await service.transactions(me.id, 10)).toMatchObject([{ amount: 123, balance: 123 }]);
			expect((await db.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
			await fund(me.id, 0.01);
			await expect(migration.down(runner)).rejects.toThrow('fractional');
			expect(await service.show(me.id)).toMatchObject({ balance: 123.01 });
		} finally {
			await runner.release();
		}
	});

	test('wallet migration round trip matches the entity schema and allows new transactions', async () => {
		const migrationModule = await import(pathToFileURL(resolve('migration/1790821089956-wallet.js')).href);
		const migration = new migrationModule.Wallet1790821089956();
		const decimalModule = await import(pathToFileURL(resolve('migration/1790948183102-DecimalWalletCoins.js')).href);
		const decimal = new decimalModule.DecimalWalletCoins1790948183102();
		const rateModule = await import(pathToFileURL(resolve('migration/1791265175934-wallet-points-per-coin.js')).href);
		const rate = new rateModule.WalletPointsPerCoin1791265175934();
		const ledgerModule = await import(pathToFileURL(resolve('migration/1791294520689-wallet-ledger-currencies.js')).href);
		const ledger = new ledgerModule.WalletLedgerCurrencies1791294520689();
		const runner = db.createQueryRunner();
		try {
			await migration.down(runner);
			for (const table of ['wallet', 'wallet_transaction', 'wallet_settings']) expect(await runner.hasTable(table)).toBe(false);
			await migration.up(runner);
			await decimal.up(runner);
			await rate.up(runner);
			await ledger.up(runner);
			const changes = await db.driver.createSchemaBuilder().log();
			expect(changes.upQueries).toEqual([]);
			expect(changes.downQueries).toEqual([]);
			const me = await user(10);
			await expect(service.exchange(me.id, 10, randomUUID())).rejects.toBeInstanceOf(WalletService.ExchangeDisabledError);
		} finally {
			await runner.release();
		}
	});

	test('the coin-based rate migration preserves legacy rates and pauses incompatible exchanges on rollback', async () => {
		const module = await import(pathToFileURL(resolve('migration/1791265175934-wallet-points-per-coin.js')).href);
		const migration = new module.WalletPointsPerCoin1791265175934();
		const runner = db.createQueryRunner();
		try {
			await service.updateSettings({ exchangeEnabled: true, exchangeRate: 3 });
			await migration.down(runner);
			await migration.up(runner);
			expect(await service.getSettings()).toEqual({ exchangeEnabled: false, exchangeRate: 3, pointsPerCoin: null });
			const me = await user(100);
			await expect(service.exchange(me.id, 1, randomUUID())).rejects.toBeInstanceOf(WalletService.ExchangeDisabledError);
			await service.updateSettings({ exchangeEnabled: true, pointsPerCoin: 100 });
			await migration.down(runner);
			expect(await runner.query('SELECT "exchangeEnabled", "exchangeRate" FROM "wallet_settings" WHERE "id" = \'default\'')).toEqual([{ exchangeEnabled: false, exchangeRate: 1 }]);
			await migration.up(runner);
			expect(await service.show(me.id)).toMatchObject({ balance: 100, points: 100, exchangeEnabled: false });
		} finally {
			if (!await runner.hasColumn('wallet_settings', 'pointsPerCoin')) await migration.up(runner);
			await runner.release();
		}
	});
});
