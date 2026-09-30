/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import Endpoint from '@/server/api/endpoints/i/checkin-history.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserCheckinCardBatch } from '@/models/UserCheckinCardBatch.js';
import { MiUserCheckinExchange } from '@/models/UserCheckinExchange.js';
import { MiUserCheckin } from '@/models/UserCheckin.js';

describe('private benefit card history', () => {
	let db: DataSource;
	let endpoint: Endpoint;
	let me: MiUser;
	beforeAll(async () => {
		db = await initTestDb();
		endpoint = new Endpoint(db);
		for (const id of ['historyself', 'historyother']) {
			await db.getRepository(MiUser).insert({ id, username: id, usernameLower: id });
			await db.getRepository(MiUserProfile).insert({ userId: id });
			await db.getRepository(MiUserCheckinCardBatch).insert({ id: `${id}batch`, userId: id, source: 'admin', createdAt: new Date('2026-09-29T01:00:00Z'), amount: 5, remaining: 2, used: 1, revoked: 2 });
			await db.getRepository(MiUserCheckinExchange).insert({ userId: id, requestId: randomUUID(), createdAt: new Date('2026-09-29T01:00:00Z'), pointsSpent: 7, cardsGranted: 1 });
			await db.getRepository(MiUserCheckin).insert([
				{ userId: id, date: '2026-09-27', isMakeup: true, createdAt: new Date('2026-09-29T02:00:00Z'), totalDays: 1, consecutiveDays: 1, cardBatchId: `${id}batch` },
				{ userId: id, date: '2026-09-28', isMakeup: true, createdAt: new Date('2026-09-29T02:00:00Z'), totalDays: 2, consecutiveDays: 2 },
				{ userId: id, date: '2026-09-29', isMakeup: false, createdAt: new Date('2026-09-29T02:00:00Z'), totalDays: 3, consecutiveDays: 3 },
			]);
		}
		me = await db.getRepository(MiUser).findOneByOrFail({ id: 'historyself' });
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('returns only the caller acquisitions even with a forged userId parameter', async () => {
		const result = await endpoint.exec({ userId: 'historyother' }, me as never, null);
		expect(result).toEqual({ total: 1, items: [{ id: 'historyselfbatch', createdAt: '2026-09-29T01:00:00.000Z', source: 'admin', amount: 5, used: 1, remaining: 2, revoked: 2, date: null, pointsSpent: null }] });
	});

	test('returns private exchange costs and consistent totals for an empty later page', async () => {
		const result = await endpoint.exec({ type: 'exchange' }, me as never, null);
		expect(result).toMatchObject({ total: 1, items: [{ source: 'exchange', amount: 1, pointsSpent: 7 }] });
		expect(await endpoint.exec({ type: 'exchange', offset: 1 }, me as never, null)).toEqual({ total: 1, items: [] });
	});

	test('distinguishes legacy and attributable use, orders tied dates, and excludes actual check-ins', async () => {
		const result = await endpoint.exec({ type: 'use', limit: 1 }, me as never, null);
		expect(result).toMatchObject({ total: 2, items: [{ date: '2026-09-28', source: null, amount: 1, createdAt: '2026-09-29T02:00:00.000Z' }] });
		expect(await endpoint.exec({ type: 'use', limit: 1, offset: 1 }, me as never, null)).toMatchObject({ total: 2, items: [{ date: '2026-09-27', source: 'admin' }] });
	});

	test('validates history kinds and pagination', async () => {
		for (const params of [{ type: 'admin' }, { limit: 101 }, { offset: -1 }]) {
			await expect(endpoint.exec(params, me as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
	});
});
