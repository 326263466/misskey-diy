/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import { AchievementService } from '@/core/AchievementService.js';
import { CheckinService } from '@/core/CheckinService.js';
import { IdService } from '@/core/IdService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserCheckin } from '@/models/UserCheckin.js';
import { MiUserCheckinExchange } from '@/models/UserCheckinExchange.js';
import { MiUserCheckinCardBatch } from '@/models/UserCheckinCardBatch.js';
import { CheckinAdminService } from '@/core/CheckinAdminService.js';
import { CheckinRedemptionService } from '@/core/CheckinRedemptionService.js';
import { MiCheckinRedemptionCode } from '@/models/CheckinRedemptionCode.js';
import { MiCheckinRedemptionClaim } from '@/models/CheckinRedemptionClaim.js';
import { MiModerationLog } from '@/models/ModerationLog.js';

describe('check-in database persistence', () => {
	let db: DataSource;
	let service: CheckinService;
	let redemptions: CheckinRedemptionService;
	let achievements: AchievementService;
	let moderationLog: ModerationLogService;
	let registeredAt = new Date('2024-02-28T16:00:00Z');
	let serial = 0;
	const notification = { createNotification: vi.fn() };
	const userIds: string[] = [];

	async function user(overrides: Partial<MiUser> = {}): Promise<MiUser> {
		const id = `checkin-test-${String(serial++).padStart(6, '0')}`;
		await db.getRepository(MiUser).insert({ id, username: id, usernameLower: id, ...overrides });
		await db.getRepository(MiUserProfile).insert({ userId: id });
		userIds.push(id);
		return db.getRepository(MiUser).findOneByOrFail({ id });
	}

	beforeAll(async () => {
		// initTestDb refuses non-test environments and uses .config/test.yml, never the live database.
		db = await initTestDb();
		achievements = new AchievementService(db.getRepository(MiUserProfile) as never, notification as never);
		moderationLog = new ModerationLogService(db.getRepository(MiModerationLog) as never, new IdService({ id: 'aidx' } as never));
		service = new CheckinService(db, db.getRepository(MiUserCheckin) as never, db.getRepository(MiUserProfile) as never, achievements, {
			packMany: async (ids: string[]) => ids.map(id => ({ id })),
		} as never, { parse: () => ({ date: registeredAt }), gen: new IdService({ id: 'aidx' } as never).gen } as never, moderationLog);
		redemptions = new CheckinRedemptionService(db, service, new IdService({ id: 'aidx' } as never), { packMany: async (users: MiUser[]) => users.map(user => ({ id: user.id })) } as never);
	});
	beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-09-28T04:00:00Z')); notification.createNotification.mockClear(); registeredAt = new Date('2024-02-28T16:00:00Z'); });
	afterEach(async () => {
		vi.useRealTimers();
		if (db?.isInitialized && userIds.length) {
			for (const userId of userIds) await db.getRepository(MiCheckinRedemptionCode).delete({ createdBy: userId });
			await db.getRepository(MiUser).delete(userIds.splice(0));
		}
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('cryptographic holiday codes redeem only once per user under concurrent retries, including after disable', async () => {
		const me = await user();
		const code = await redemptions.create({ name: ' Holiday ', amount: 2, maxRedemptions: 5 }, me);
		expect(code).toMatchObject({ name: 'Holiday', amount: 2, redemptions: 0, enabled: true, expiresAt: null });
		expect(code.code).toMatch(/^[0-9a-f]{32}$/);
		const results = await Promise.all(Array.from({ length: 12 }, () => redemptions.redeem(me.id, code.code.toUpperCase())));
		expect(results.filter(result => result.newlyRedeemed)).toHaveLength(1);
		expect(results.reduce((sum, result) => sum + result.amount, 0)).toBe(2);
		expect(await db.getRepository(MiCheckinRedemptionClaim).countBy({ userId: me.id, codeId: code.id })).toBe(1);
		expect(await db.getRepository(MiUserCheckinCardBatch).findBy({ userId: me.id })).toEqual([expect.objectContaining({ source: 'redemption', amount: 2, remaining: 2 })]);
		await service.makeup(me.id, '2026-09-27');
		await redemptions.update(code.id, false);
		expect(await redemptions.redeem(me.id, code.code)).toEqual({ newlyRedeemed: false, amount: 0, makeupCards: 1, points: 1 });
		expect((await redemptions.list(0, 20)).items[0]).toMatchObject({ redemptions: 1, enabled: false });
	});

	test('simultaneous users cannot exceed a code quota, and deleting a claimant does not reopen a slot', async () => {
		const admin = await user();
		const first = await user();
		const second = await user();
		const code = await redemptions.create({ name: 'Limited', amount: 1, maxRedemptions: 1 }, admin);
		const results = await Promise.allSettled([redemptions.redeem(first.id, code.code), redemptions.redeem(second.id, code.code)]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(CheckinRedemptionService.ExhaustedCodeError) });
		const claim = await db.getRepository(MiCheckinRedemptionClaim).findOneByOrFail({ codeId: code.id });
		await db.getRepository(MiUser).delete(claim.userId);
		expect(await redemptions.claims(code.id, 0, 20, admin)).toMatchObject({ total: 1, items: [{ userId: claim.userId, user: null, amount: 1 }] });
		await expect(redemptions.redeem(admin.id, code.code)).rejects.toBeInstanceOf(CheckinRedemptionService.ExhaustedCodeError);
	});

	test('disabled, expired, invalid and ineligible redemptions preserve balances and quota', async () => {
		const me = await user();
		const code = await redemptions.create({ name: 'Timed', amount: 2, maxRedemptions: 5, expiresAt: '2026-09-28T05:00:00Z' }, me);
		await redemptions.update(code.id, false);
		await expect(redemptions.redeem(me.id, code.code)).rejects.toBeInstanceOf(CheckinRedemptionService.DisabledCodeError);
		await redemptions.update(code.id, true);
		vi.setSystemTime(new Date('2026-09-28T05:00:00Z'));
		await expect(redemptions.redeem(me.id, code.code)).rejects.toBeInstanceOf(CheckinRedemptionService.ExpiredCodeError);
		await expect(redemptions.redeem(me.id, '0'.repeat(32))).rejects.toBeInstanceOf(CheckinRedemptionService.NoSuchCodeError);
		for (const overrides of [{ isSuspended: true }, { isDeleted: true }, { host: 'remote.example' }, { movedToUri: 'https://example.com/u' }, { username: 'system.proxy' }]) {
			const invalid = await user(overrides);
			await expect(redemptions.redeem(invalid.id, code.code)).rejects.toBeInstanceOf(CheckinService.NotAllowedError);
		}
		expect((await service.getStatus(me.id)).makeupCards).toBe(0);
		expect((await redemptions.list(0, 20)).items[0].redemptions).toBe(0);
		for (const expiresAt of ['invalid', '2026-09-27T00:00:00Z']) {
			await expect(redemptions.create({ name: 'Timed', amount: 1, maxRedemptions: 1, expiresAt }, me)).rejects.toBeInstanceOf(CheckinRedemptionService.InvalidConfigurationError);
		}
		await expect(redemptions.create({ name: '  ', amount: 1, maxRedemptions: 1 }, me)).rejects.toBeInstanceOf(CheckinRedemptionService.InvalidConfigurationError);
	});

	test('a failed claim or full balance rolls back the code counter, card batch, and balance', async () => {
		const me = await user();
		const code = await redemptions.create({ name: 'Rollback', amount: 2, maxRedemptions: 5 }, me);
		await db.query(`CREATE FUNCTION checkin_claim_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test claim failure'; END $$`);
		await db.query(`CREATE TRIGGER checkin_claim_fail BEFORE INSERT ON checkin_redemption_claim FOR EACH ROW EXECUTE FUNCTION checkin_claim_fail()`);
		try {
			await expect(redemptions.redeem(me.id, code.code)).rejects.toThrow('test claim failure');
			expect((await service.getStatus(me.id)).makeupCards).toBe(0);
			expect(await db.getRepository(MiUserCheckinCardBatch).countBy({ userId: me.id })).toBe(0);
			expect((await redemptions.list(0, 20)).items[0].redemptions).toBe(0);
		} finally {
			await db.query('DROP TRIGGER checkin_claim_fail ON checkin_redemption_claim');
			await db.query('DROP FUNCTION checkin_claim_fail()');
		}
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinMakeupCards: 2147483647 });
		await expect(redemptions.redeem(me.id, code.code)).rejects.toBeInstanceOf(CheckinService.CardLimitError);
		expect((await redemptions.list(0, 20)).items[0].redemptions).toBe(0);
	});

	test('redemption, grant reclaim and makeup serialize without losing any card source', async () => {
		const me = await user();
		await service.grantCards(me.id, 2, me);
		const batch = await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ userId: me.id });
		const code = await redemptions.create({ name: 'Concurrent', amount: 2, maxRedemptions: 5 }, me);
		const results = await Promise.allSettled([redemptions.redeem(me.id, code.code), service.revokeCards(batch.id, me), service.makeup(me.id, '2026-09-27')]);
		expect(results[0].status).toBe('fulfilled');
		expect(results[1].status).toBe('fulfilled');
		const batches = await db.getRepository(MiUserCheckinCardBatch).findBy({ userId: me.id });
		expect(batches.reduce((sum, row) => sum + row.amount, 0)).toBe(4);
		expect(batches.reduce((sum, row) => sum + row.remaining + row.used + row.revoked, 0)).toBe(4);
		expect((await service.getStatus(me.id)).makeupCards).toBe(batches.reduce((sum, row) => sum + row.remaining, 0));
	});

	test('new grants create attributable batches, FIFO makeup uses the oldest batch, and reclaim preserves used cards', async () => {
		const me = await user();
		await service.grantCards(me.id, 3, me);
		vi.setSystemTime(new Date('2026-09-28T04:00:01Z'));
		await service.grantCards(me.id, 2, me);
		const batches = await db.getRepository(MiUserCheckinCardBatch).find({ where: { userId: me.id }, order: { createdAt: 'ASC', id: 'ASC' } });
		expect(batches.map(batch => [batch.source, batch.remaining])).toEqual([['admin', 3], ['admin', 2]]);
		await service.makeup(me.id, '2026-09-27');
		expect(await db.getRepository(MiUserCheckin).findOneByOrFail({ userId: me.id, date: '2026-09-27' })).toMatchObject({ cardBatchId: batches[0].id });
		expect(await service.revokeCards(batches[0].id, me)).toEqual({ batchId: batches[0].id, revokedCards: 2, makeupCards: 2 });
		expect(await service.revokeCards(batches[0].id, me)).toMatchObject({ revokedCards: 0, makeupCards: 2 });
		expect(await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ id: batches[0].id })).toMatchObject({ amount: 3, used: 1, remaining: 0, revoked: 2 });
		expect(await db.getRepository(MiModerationLog).countBy({ type: 'revokeCheckinCards', userId: me.id })).toBe(1);
		const adminService = new CheckinAdminService(db, { packMany: async (users: MiUser[]) => users.map(user => ({ id: user.id })) } as never, new IdService({ id: 'aidx' } as never));
		const history = await adminService.history('grant', 0, 20, me, me.id);
		expect(history.items.find(row => row.batchId === batches[0].id)).toMatchObject({ usageStatus: 'revoked', used: 1, remaining: 0, revoked: 2 });
		expect(history.items.find(row => row.batchId === batches[1].id)).toMatchObject({ usageStatus: 'unused', used: 0, remaining: 2, revoked: 0 });
	});

	test('concurrent makeup and repeated reclaims never spend or reclaim the same card twice', async () => {
		const me = await user();
		await service.grantCards(me.id, 3, me);
		const batch = await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ userId: me.id });
		const results = await Promise.allSettled([
			service.makeup(me.id, '2026-09-27'),
			...Array.from({ length: 10 }, () => service.revokeCards(batch.id, me)),
		]);
		const stored = await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ id: batch.id });
		expect(stored.used + stored.revoked).toBe(3);
		expect(stored.remaining).toBe(0);
		expect((await service.getStatus(me.id)).makeupCards).toBe(0);
		expect(results.slice(1).every(result => result.status === 'fulfilled')).toBe(true);
		expect(await db.getRepository(MiModerationLog).countBy({ type: 'revokeCheckinCards', userId: me.id })).toBe(1);
	});

	test('reclaim and makeup roll back batch counters when their durable writes fail', async () => {
		const me = await user();
		await service.grantCards(me.id, 2, me);
		const batch = await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ userId: me.id });
		vi.spyOn(moderationLog, 'log').mockRejectedValueOnce(new Error('audit unavailable'));
		await expect(service.revokeCards(batch.id, me)).rejects.toThrow('audit unavailable');
		expect(await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ id: batch.id })).toMatchObject({ remaining: 2, revoked: 0 });
		expect((await service.getStatus(me.id)).makeupCards).toBe(2);
		await db.query(`CREATE FUNCTION checkin_use_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test use failure'; END $$`);
		await db.query(`CREATE TRIGGER checkin_use_fail BEFORE INSERT ON user_checkin FOR EACH ROW EXECUTE FUNCTION checkin_use_fail()`);
		try {
			await expect(service.makeup(me.id, '2026-09-27')).rejects.toThrow('test use failure');
			expect(await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ id: batch.id })).toMatchObject({ remaining: 2, used: 0 });
			expect((await service.getStatus(me.id)).makeupCards).toBe(2);
		} finally {
			await db.query('DROP TRIGGER checkin_use_fail ON user_checkin');
			await db.query('DROP FUNCTION checkin_use_fail()');
		}
	});

	test('legacy and exchange cards cannot be reclaimed, and historical balances are consumed before new grants', async () => {
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinMakeupCards: 1, checkinPoints: 7 });
		await service.grantCards(me.id, 1, me);
		await service.exchange(me.id, randomUUID());
		const batches = await db.getRepository(MiUserCheckinCardBatch).find({ where: { userId: me.id }, order: { createdAt: 'ASC', id: 'ASC' } });
		expect(batches.map(batch => batch.source)).toEqual(['legacy', 'admin', 'exchange']);
		for (const batch of batches.filter(batch => batch.source !== 'admin')) {
			await expect(service.revokeCards(batch.id, me)).rejects.toBeInstanceOf(CheckinService.CardBatchNotRevokableError);
		}
		await service.makeup(me.id, '2026-09-27');
		expect(await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ id: batches[0].id })).toMatchObject({ used: 1, remaining: 0 });
		expect(await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ id: batches[1].id })).toMatchObject({ used: 0, remaining: 1 });
		await expect(service.revokeCards('missing', me)).rejects.toBeInstanceOf(CheckinService.NoSuchCardBatchError);
	});

	test('concurrent first check-ins persist one day and notify each earned achievement once', async () => {
		const me = await user();
		const results = await Promise.all(Array.from({ length: 16 }, () => service.checkin(me.id)));
		expect(results.filter(result => result.newlyCheckedIn)).toHaveLength(1);
		expect(results.flatMap(result => result.earnedAchievements)).toEqual(['checkin1']);
		expect(await db.getRepository(MiUserCheckin).countBy({ userId: me.id })).toBe(1);
		expect((await db.getRepository(MiUserProfile).findOneByOrFail({ userId: me.id })).achievements).toHaveLength(1);
		expect((await service.getStatus(me.id)).points).toBe(1);
		expect(results.reduce((points, result) => points + result.earnedPoints, 0)).toBe(1);
		expect(notification.createNotification).toHaveBeenCalledExactlyOnceWith(me.id, 'achievementEarned', { achievement: 'checkin1' });
		const saved = await db.getRepository(MiUserCheckin).findOneByOrFail({ userId: me.id });
		await expect(db.getRepository(MiUserCheckin).insert(saved)).rejects.toMatchObject({ code: '23505' });
	});

	test('gifts one card at every seventh actual check-in, even when those days are not consecutive', async () => {
		const me = await user();
		for (let day = 1; day <= 14; day++) {
			vi.setSystemTime(new Date(Date.UTC(2026, 7, day * 2, 4)));
			const response = await service.checkin(me.id);
			expect(response).toMatchObject({ earnedMakeupCards: day % 7 === 0 ? 1 : 0, makeupCards: Math.floor(day / 7), makeupCardProgress: day % 7, makeupCardTarget: 7, makeupCardExchangeCost: 7 });
			expect(await service.checkin(me.id)).toMatchObject({ earnedMakeupCards: 0, makeupCards: Math.floor(day / 7) });
		}
	});

	test('makeup does not progress the actual-check-in gift and the seventh concurrent real check-in gifts once', async () => {
		const me = await user();
		for (let day = 21; day <= 26; day++) {
			vi.setSystemTime(new Date(`2026-09-${day}T04:00:00Z`));
			await service.checkin(me.id);
		}
		vi.setSystemTime(new Date('2026-09-28T04:00:00Z'));
		await service.grantCards(me.id, 1, me);
		expect(await service.makeup(me.id, '2026-09-27')).toMatchObject({ totalDays: 7, earnedMakeupCards: 0, makeupCards: 0, makeupCardProgress: 6 });
		const results = await Promise.all(Array.from({ length: 12 }, () => service.checkin(me.id)));
		expect(results.reduce((sum, response) => sum + response.earnedMakeupCards, 0)).toBe(1);
		expect(await service.getStatus(me.id)).toMatchObject({ makeupCards: 1, makeupCardProgress: 0, totalDays: 8 });
	});

	test('does not retroactively gift cards for an already passed historical milestone', async () => {
		const me = await user();
		await db.getRepository(MiUserCheckin).insert(Array.from({ length: 7 }, (_, index) => ({ userId: me.id, date: `2026-09-${index + 10}`, createdAt: new Date(), isMakeup: false, totalDays: index + 1, consecutiveDays: index + 1 })));
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinPoints: 7 });
		expect(await service.getStatus(me.id)).toMatchObject({ makeupCards: 0, makeupCardProgress: 0 });
		expect(await service.checkin(me.id)).toMatchObject({ earnedMakeupCards: 0, makeupCards: 0, makeupCardProgress: 1 });
	});

	test('exchanges points once for concurrent retries and returns current balances for a later retry', async () => {
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinPoints: 14 });
		const requestId = randomUUID();
		const results = await Promise.all(Array.from({ length: 16 }, () => service.exchange(me.id, requestId)));
		expect(results.filter(result => result.exchanged)).toHaveLength(1);
		expect(results.every(result => result.points === 7 && result.makeupCards === 1)).toBe(true);
		expect(await db.getRepository(MiUserCheckinExchange).findBy({ userId: me.id })).toEqual([expect.objectContaining({ requestId, pointsSpent: 7, cardsGranted: 1 })]);
		await service.makeup(me.id, '2026-09-27');
		expect(await service.exchange(me.id, requestId.toUpperCase())).toEqual({ points: 8, makeupCards: 0, exchanged: false });
		await db.getRepository(MiUser).delete(me.id);
		expect(await db.getRepository(MiUserCheckinExchange).countBy({ userId: me.id })).toBe(0);
	});

	test('different concurrent exchanges cannot overdraw the final seven points', async () => {
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinPoints: 7 });
		const results = await Promise.allSettled([service.exchange(me.id, randomUUID()), service.exchange(me.id, randomUUID())]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(CheckinService.InsufficientPointsError) });
		expect(await service.getStatus(me.id)).toMatchObject({ points: 0, makeupCards: 1 });
		expect(await db.getRepository(MiUserCheckinExchange).countBy({ userId: me.id })).toBe(1);
	});

	test('exchange, actual check-in, makeup and administrator grants preserve all balance changes', async () => {
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinPoints: 7, checkinMakeupCards: 1 });
		await Promise.all([service.exchange(me.id, randomUUID()), service.checkin(me.id), service.makeup(me.id, '2026-09-27'), service.grantCards(me.id, 2, me)]);
		expect(await service.getStatus(me.id)).toMatchObject({ points: 2, makeupCards: 3, totalDays: 2, makeupCardProgress: 1 });
	});

	test('a failed ledger insertion rolls back both exchanged balances and lets the same request retry', async () => {
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinPoints: 7 });
		await db.query(`CREATE FUNCTION checkin_exchange_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test exchange failure'; END $$`);
		await db.query(`CREATE TRIGGER checkin_exchange_fail BEFORE INSERT ON user_checkin_exchange FOR EACH ROW EXECUTE FUNCTION checkin_exchange_fail()`);
		const requestId = randomUUID();
		try {
			await expect(service.exchange(me.id, requestId)).rejects.toThrow('test exchange failure');
			expect(await service.getStatus(me.id)).toMatchObject({ points: 7, makeupCards: 0 });
			expect(await db.getRepository(MiUserCheckinExchange).countBy({ userId: me.id })).toBe(0);
		} finally {
			await db.query('DROP TRIGGER checkin_exchange_fail ON user_checkin_exchange');
			await db.query('DROP FUNCTION checkin_exchange_fail()');
		}
		expect(await service.exchange(me.id, requestId)).toEqual({ points: 0, makeupCards: 1, exchanged: true });
	});

	test('rejects ineligible exchanges and a full card balance without charging points', async () => {
		for (const overrides of [{ isSuspended: true }, { isDeleted: true }, { host: 'remote.example' }, { movedToUri: 'https://example.com/u' }, { username: 'system.proxy' }]) {
			const invalid = await user(overrides);
			await expect(service.exchange(invalid.id, randomUUID())).rejects.toBeInstanceOf(CheckinService.NotAllowedError);
		}
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinPoints: 7, checkinMakeupCards: 2147483647 });
		await expect(service.exchange(me.id, randomUUID())).rejects.toBeInstanceOf(CheckinService.CardLimitError);
		expect(await service.getStatus(me.id)).toMatchObject({ points: 7, makeupCards: 2147483647 });
	});

	test('concurrent duplicate makeups consume one card, award one point and persist the calendar marker', async () => {
		const me = await user();
		await service.grantCards(me.id, 1, me);
		const results = await Promise.all(Array.from({ length: 16 }, () => service.makeup(me.id, '2026-08-31')));
		expect(results.filter(result => result.newlyCheckedIn)).toHaveLength(1);
		expect(results.reduce((points, result) => points + result.earnedPoints, 0)).toBe(1);
		expect(results.flatMap(result => result.earnedAchievements)).toEqual(['checkin1']);
		expect(await service.getStatus(me.id, '2026-08')).toMatchObject({ month: '2026-08', checkedInToday: false, totalDays: 1, points: 1, makeupCards: 0, makeupDates: ['2026-08-31'] });
		expect(results.every(result => result.month === '2026-08')).toBe(true);
		expect(await service.makeup(me.id, '2026-08-31')).toMatchObject({ newlyCheckedIn: false, earnedPoints: 0, points: 1, makeupCards: 0 });
	});

	test('concurrent different makeups cannot overdraw the last card', async () => {
		const me = await user();
		await service.grantCards(me.id, 1, me);
		const results = await Promise.allSettled([service.makeup(me.id, '2026-09-26'), service.makeup(me.id, '2026-09-27')]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(CheckinService.NoMakeupCardsError) });
		expect(await service.getStatus(me.id)).toMatchObject({ totalDays: 1, points: 1, makeupCards: 0 });
	});

	test('makeups repair later totals and join streaks before ranking and achievements are evaluated', async () => {
		const me = await user();
		for (const date of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-25', '2026-09-26', '2026-09-27']) {
			vi.setSystemTime(new Date(`${date}T04:00:00Z`));
			await service.checkin(me.id);
		}
		vi.setSystemTime(new Date('2026-09-28T04:00:00Z'));
		await service.grantCards(me.id, 1, me);
		expect(await service.makeup(me.id, '2026-09-24')).toMatchObject({ totalDays: 7, consecutiveDays: 7, points: 7, makeupCards: 0, earnedAchievements: ['checkinStreak7'] });
		const records = await db.getRepository(MiUserCheckin).find({ where: { userId: me.id }, order: { date: 'ASC' } });
		expect(records.map(record => record.totalDays)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect(records.map(record => record.consecutiveDays)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect((await service.ranking('consecutive', 0, 20, me)).myRank).toEqual({ rank: 1, days: 7 });
		expect((await service.ranking('total', 0, 20, me)).myRank).toEqual({ rank: 1, days: 7 });
		expect(await service.checkin(me.id)).toMatchObject({ totalDays: 8, consecutiveDays: 8, points: 8 });
	});

	test('validates registration, leap dates, and site midnight without consuming cards', async () => {
		const me = await user();
		await service.grantCards(me.id, 3, me);
		for (const date of ['2024-02-28', '2026-02-29', '2026-09-28', '2026-09-29', '2026-04-31']) {
			await expect(service.makeup(me.id, date)).rejects.toBeInstanceOf(CheckinService.InvalidDateError);
		}
		expect(await service.makeup(me.id, '2024-02-29')).toMatchObject({ registeredDate: '2024-02-29', points: 1, makeupCards: 2, makeupDates: ['2024-02-29'] });
		vi.setSystemTime(new Date('2026-09-28T15:59:59.999Z'));
		await expect(service.makeup(me.id, '2026-09-28')).rejects.toBeInstanceOf(CheckinService.InvalidDateError);
		vi.setSystemTime(new Date('2026-09-28T16:00:00Z'));
		expect(await service.makeup(me.id, '2026-09-28')).toMatchObject({ today: '2026-09-29', points: 2, makeupCards: 1 });
	});

	test('daily check-in, card grant and makeup serialize without losing balances', async () => {
		const me = await user();
		await service.grantCards(me.id, 1, me);
		await Promise.all([service.checkin(me.id), service.makeup(me.id, '2026-09-27'), service.grantCards(me.id, 2, me)]);
		expect(await service.getStatus(me.id)).toMatchObject({ totalDays: 2, consecutiveDays: 2, points: 2, makeupCards: 2, checkedInDates: ['2026-09-27', '2026-09-28'] });
		const logs = await db.getRepository(MiModerationLog).findBy({ userId: me.id, type: 'grantCheckinCards' });
		expect(logs).toHaveLength(2);
		expect(logs.map(log => log.info.amount).sort()).toEqual([1, 2]);
	});

	test('card grants roll back when their audit log cannot be committed', async () => {
		const me = await user();
		const log = vi.spyOn(moderationLog, 'log').mockRejectedValueOnce(new Error('audit unavailable'));
		await expect(service.grantCards(me.id, 1, me)).rejects.toThrow('audit unavailable');
		log.mockRestore();
		expect((await service.getStatus(me.id)).makeupCards).toBe(0);
		expect(await db.getRepository(MiModerationLog).countBy({ userId: me.id })).toBe(0);
	});

	test('simultaneous reciprocal administrator grants do not deadlock on audit foreign keys', async () => {
		const first = await user();
		const second = await user();
		await Promise.all([service.grantCards(first.id, 2, second), service.grantCards(second.id, 3, first)]);
		expect((await service.getStatus(first.id)).makeupCards).toBe(2);
		expect((await service.getStatus(second.id)).makeupCards).toBe(3);
	});

	test('card grants validate recipients and preserve the integer balance limit', async () => {
		const me = await user();
		await expect(service.grantCards('missing-user', 1, me)).rejects.toBeInstanceOf(CheckinService.NoSuchUserError);
		for (const overrides of [{ isSuspended: true }, { isDeleted: true }, { host: 'remote.example' }, { movedToUri: 'https://example.com/u' }, { username: 'system.proxy' }]) {
			const invalid = await user(overrides);
			await expect(service.grantCards(invalid.id, 1, me)).rejects.toBeInstanceOf(CheckinService.NotAllowedError);
			await expect(service.makeup(invalid.id, '2026-09-27')).rejects.toBeInstanceOf(CheckinService.NotAllowedError);
		}
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinMakeupCards: 2147483647 });
		await expect(service.grantCards(me.id, 1, me)).rejects.toBeInstanceOf(CheckinService.CardLimitError);
		expect((await service.getStatus(me.id)).makeupCards).toBe(2147483647);
	});

	test('concurrent different achievements preserve all existing awards', async () => {
		const me = await user();
		await Promise.all([achievements.create(me.id, 'login7'), achievements.create(me.id, 'notes1'), achievements.create(me.id, 'checkin1'), achievements.create(me.id, 'checkin1')]);
		const profile = await db.getRepository(MiUserProfile).findOneByOrFail({ userId: me.id });
		expect(profile.achievements.map(achievement => achievement.name).sort()).toEqual(['checkin1', 'login7', 'notes1']);
		expect(notification.createNotification).toHaveBeenCalledTimes(3);
	});

	test('month and streak stats cross midnight correctly without importing automatic login dates', async () => {
		const me = await user();
		await db.getRepository(MiUserProfile).update(me.id, { loggedInDates: ['2026-09-26', '2026-09-27'] });
		expect((await service.getStatus(me.id)).totalDays).toBe(0);
		vi.setSystemTime(new Date('2026-09-30T15:59:59Z'));
		await service.checkin(me.id);
		vi.setSystemTime(new Date('2026-09-30T16:00:00Z'));
		expect(await service.checkin(me.id)).toMatchObject({ today: '2026-10-01', consecutiveDays: 2, totalDays: 2, monthlyDays: 1, checkedInDates: ['2026-10-01'] });
		expect(await service.getStatus(me.id, '2026-09')).toMatchObject({ monthlyDays: 1, checkedInDates: ['2026-09-30'] });
		vi.setSystemTime(new Date('2026-10-02T16:00:00Z'));
		expect((await service.getStatus(me.id)).consecutiveDays).toBe(0);
		expect((await service.checkin(me.id)).consecutiveDays).toBe(1);
		await db.getRepository(MiUser).delete(me.id);
		expect(await db.getRepository(MiUserCheckin).countBy({ userId: me.id })).toBe(0);
	});

	test('uses shared ranks, stable ordering, public-user filters, and a personal rank beyond 100', async () => {
		const people: MiUser[] = [];
		for (let index = 0; index < 105; index++) people.push(await user());
		await db.getRepository(MiUserCheckin).insert(people.map((person, index) => ({ userId: person.id, date: '2026-09-28', createdAt: new Date(), totalDays: index < 2 ? 106 : 105 - index, consecutiveDays: index < 2 ? 5 : 1 })));
		for (const overrides of [{ isSuspended: true }, { isDeleted: true }, { isExplorable: false }, { host: 'remote.example' }, { movedToUri: 'https://other.example/u' }]) {
			const hidden = await user(overrides);
			await db.getRepository(MiUserCheckin).insert({ userId: hidden.id, date: '2026-09-28', createdAt: new Date(), totalDays: 999, consecutiveDays: 999 });
		}
		const response = await service.ranking('total', 0, 3, people[104]);
		expect(response.items.map(item => item.rank)).toEqual([1, 1, 3]);
		expect(response.items.map(item => item.user.id)).toEqual(people.slice(0, 3).map(person => person.id));
		expect(response.myRank).toEqual({ rank: 105, days: 1 });
		expect((await service.ranking('total', 99, 50, people[104])).items).toHaveLength(1);
		expect((await service.ranking('monthly', 0, 3, people[104])).items.map(item => item.days)).toEqual([1, 1, 1]);
		vi.setSystemTime(new Date('2026-09-30T04:00:00Z'));
		expect((await service.ranking('consecutive', 0, 20, people[104])).items).toEqual([]);
		expect((await service.ranking('consecutive', 0, 20, people[104])).myRank).toBeNull();
	});
});
