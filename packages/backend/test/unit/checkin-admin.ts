/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import { CheckinAdminService } from '@/core/CheckinAdminService.js';
import { IdService } from '@/core/IdService.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserCheckin } from '@/models/UserCheckin.js';
import { MiUserCheckinExchange } from '@/models/UserCheckinExchange.js';
import { MiModerationLog } from '@/models/ModerationLog.js';
import StatsEndpoint, { meta as statsMeta } from '@/server/api/endpoints/admin/checkin/stats.js';
import HistoryEndpoint, { meta as historyMeta } from '@/server/api/endpoints/admin/checkin/history.js';
import UsersEndpoint, { meta as usersMeta } from '@/server/api/endpoints/admin/checkin/users.js';

describe('administrator check-in analytics', () => {
	let db: DataSource;
	let service: CheckinAdminService;
	let serial = 0;
	const idService = new IdService({ id: 'aidx' } as never);
	const userIds: string[] = [];
	const packMany = vi.fn(async (users: MiUser[]) => users.map(user => ({ id: user.id, username: user.username })));

	async function user(overrides: Partial<MiUser> = {}) {
		const id = `checkinadmin${serial++}`;
		await db.getRepository(MiUser).insert({ id, username: id, usernameLower: id, ...overrides });
		await db.getRepository(MiUserProfile).insert({ userId: id });
		userIds.push(id);
		return db.getRepository(MiUser).findOneByOrFail({ id });
	}

	async function seed() {
		const [admin, first, second, inactive, remote] = await Promise.all([user(), user(), user(), user(), user({ host: 'remote.example' })]);
		await db.getRepository(MiUserProfile).update({ userId: first.id }, { checkinPoints: 5, checkinMakeupCards: 3 });
		await db.getRepository(MiUserProfile).update({ userId: second.id }, { checkinPoints: 8, checkinMakeupCards: 4 });
		await db.getRepository(MiUserProfile).update({ userId: remote.id }, { checkinPoints: 99, checkinMakeupCards: 99 });
		for (const [recipient, amount, before] of [[first, 3, 0], [first, 2, 3], [second, 4, 0]] as const) {
			await db.getRepository(MiModerationLog).insert({ id: idService.gen(), userId: admin.id, type: 'grantCheckinCards', info: {
				userId: recipient.id, userUsername: recipient.username, userHost: null, amount, before, after: before + amount,
			} });
		}
		await db.getRepository(MiModerationLog).insert({ id: idService.gen(), userId: admin.id, type: 'suspend', info: { userId: first.id, amount: 999 } });
		await db.getRepository(MiUserCheckin).insert([
			{ userId: first.id, date: '2026-09-01', isMakeup: true, createdAt: new Date(), totalDays: 1, consecutiveDays: 1 },
			{ userId: first.id, date: '2026-09-02', isMakeup: true, createdAt: new Date(), totalDays: 2, consecutiveDays: 2 },
			{ userId: second.id, date: '2026-09-01', isMakeup: true, createdAt: new Date(), totalDays: 1, consecutiveDays: 1 },
			{ userId: first.id, date: '2026-09-29', isMakeup: false, createdAt: new Date(), totalDays: 3, consecutiveDays: 1 },
		]);
		for (const person of [first, first, second]) {
			await db.getRepository(MiUserCheckinExchange).insert({ userId: person.id, requestId: randomUUID(), createdAt: new Date(), pointsSpent: 7, cardsGranted: 1 });
		}
		return { admin, first, second, inactive, remote };
	}

	beforeAll(async () => {
		db = await initTestDb();
		service = new CheckinAdminService(db, { packMany } as never, idService);
	});
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-09-29T04:00:00Z'));
		packMany.mockClear();
	});
	afterEach(async () => {
		vi.useRealTimers();
		if (db?.isInitialized && userIds.length) await db.getRepository(MiUser).delete(userIds.splice(0));
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('empty totals and out-of-range pages remain well formed', async () => {
		const admin = await user();
		expect(await service.stats()).toEqual({ grantedCards: 0, grantCount: 0, grantedUsers: 0, usedCards: 0, usedUsers: 0, exchangedCards: 0, availableCards: 0 });
		expect(await service.history('grant', 10, 20, admin)).toEqual({ total: 0, items: [] });
		expect(await service.users(10, 20, admin)).toEqual({ total: 0, items: [] });
	});

	test('aggregates durable sources independently and filters the recipient rather than the grant operator', async () => {
		const { admin, first } = await seed();
		expect(await service.stats()).toEqual({ grantedCards: 9, grantCount: 3, grantedUsers: 2, usedCards: 3, usedUsers: 2, exchangedCards: 3, availableCards: 7 });
		expect(await service.stats(first.id)).toEqual({ grantedCards: 5, grantCount: 2, grantedUsers: 1, usedCards: 2, usedUsers: 1, exchangedCards: 2, availableCards: 3 });
		expect((await service.stats(admin.id)).grantedCards).toBe(0);
		expect((await service.stats('missing')).grantCount).toBe(0);
	});

	test('returns all grant audit details and preserves totals beyond the final page', async () => {
		const { admin, first, second } = await seed();
		const page = await service.history('grant', 0, 2, admin);
		expect(page.total).toBe(3);
		expect(page.items[0]).toMatchObject({ userId: second.id, user: { id: second.id }, operator: { id: admin.id }, recipientUsername: second.username, amount: 4, before: 0, after: 4, date: null, pointsSpent: null, createdAt: '2026-09-29T04:00:00.000Z' });
		const next = await service.history('grant', 2, 2, admin);
		expect(next.total).toBe(3);
		expect(next.items).toHaveLength(1);
		expect(new Set([...page.items, ...next.items].map(item => item.id)).size).toBe(3);
		expect(await service.history('grant', 100, 2, admin)).toEqual({ total: 3, items: [] });
		expect((await service.history('grant', 0, 20, admin, first.id)).items.map(item => item.amount)).toEqual([2, 3]);
		expect((await service.history('grant', 0, 20, admin, admin.id)).total).toBe(0);
	});

	test('usage history distinguishes operation time from the missed day and excludes actual check-ins', async () => {
		const { admin, first } = await seed();
		const page = await service.history('use', 0, 1, admin, first.id);
		const next = await service.history('use', 1, 1, admin, first.id);
		expect(page.total).toBe(2);
		expect(page.items[0]).toMatchObject({ date: '2026-09-02', createdAt: '2026-09-29T04:00:00.000Z', amount: 1, operator: null, before: null, after: null, pointsSpent: null });
		expect(next.items[0].date).toBe('2026-09-01');
		expect(next.items[0].id).not.toBe(page.items[0].id);
	});

	test('exchange history uses the ledger, with stable pagination for tied timestamps', async () => {
		const { admin, first } = await seed();
		const page = await service.history('exchange', 0, 1, admin, first.id);
		const next = await service.history('exchange', 1, 1, admin, first.id);
		expect(page.total).toBe(2);
		expect(page.items[0]).toMatchObject({ userId: first.id, pointsSpent: 7, amount: 1, operator: null, before: null, after: null, date: null });
		expect(next.items[0].id).not.toBe(page.items[0].id);
	});

	test('user balances exclude remote/inactive users, support explicit inactive users, and avoid join multiplication', async () => {
		const { admin, first, second, inactive, remote } = await seed();
		const page = await service.users(0, 1, admin);
		expect(page).toMatchObject({ total: 2, items: [{ user: { id: second.id }, grantedCards: 4, usedCards: 1, exchangedCards: 1, availableCards: 4, points: 8 }] });
		expect(await service.users(1, 1, admin)).toMatchObject({ total: 2, items: [{ user: { id: first.id }, grantedCards: 5, usedCards: 2, exchangedCards: 2, availableCards: 3, points: 5 }] });
		expect(await service.users(100, 1, admin)).toEqual({ total: 2, items: [] });
		expect(await service.users(0, 20, admin, inactive.id)).toMatchObject({ total: 1, items: [{ user: { id: inactive.id }, grantedCards: 0, availableCards: 0 }] });
		expect(await service.users(0, 20, admin, remote.id)).toEqual({ total: 0, items: [] });
	});

	test('retains recipient snapshots after deletion without inventing available balances or usage', async () => {
		const { admin, first } = await seed();
		await db.getRepository(MiUser).delete(first.id);
		expect(await service.stats(first.id)).toEqual({ grantedCards: 5, grantCount: 2, grantedUsers: 1, usedCards: 0, usedUsers: 0, exchangedCards: 0, availableCards: 0 });
		const history = await service.history('grant', 0, 20, admin, first.id);
		expect(history.total).toBe(2);
		expect(history.items[0]).toMatchObject({ userId: first.id, user: null, recipientUsername: first.username, operator: { id: admin.id } });
		expect(await service.users(0, 20, admin, first.id)).toEqual({ total: 0, items: [] });
	});
});

describe('administrator check-in analytics endpoint contracts', () => {
	test.each([statsMeta, historyMeta, usersMeta])('requires administrator credentials and the read-admin-user scope', meta => {
		expect(meta).toMatchObject({ requireCredential: true, requireAdmin: true, kind: 'read:admin:show-user' });
	});

	test('rejects malformed IDs, unknown event types, and invalid pagination before querying', async () => {
		const stats = vi.fn();
		const history = vi.fn();
		const users = vi.fn();
		const service = { stats, history, users };
		await expect(new StatsEndpoint(service as never).exec({ userId: 'bad-id!' }, {} as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		for (const params of [{ type: 'all' }, { offset: -1 }, { offset: 100001 }, { limit: 0 }, { limit: 101 }]) {
			await expect(new HistoryEndpoint(service as never).exec(params, {} as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		await expect(new UsersEndpoint(service as never).exec({ limit: 1.5 }, {} as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(stats).not.toHaveBeenCalled();
		expect(history).not.toHaveBeenCalled();
		expect(users).not.toHaveBeenCalled();
	});
});
