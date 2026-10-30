/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { DataSource, ObjectLiteral } from 'typeorm';
import { initTestDb } from '../utils.js';
import { AchievementService } from '@/core/AchievementService.js';
import { CheckinService } from '@/core/CheckinService.js';
import { IdService } from '@/core/IdService.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserCheckin } from '@/models/UserCheckin.js';
import { MiUserCheckinExchange } from '@/models/UserCheckinExchange.js';
import { MiUserCheckinCardBatch } from '@/models/UserCheckinCardBatch.js';
import { BenefitRedemptionService } from '@/core/BenefitRedemptionService.js';
import { MiBenefitRedemptionCode } from '@/models/BenefitRedemptionCode.js';
import { MiBenefitRedemptionClaim } from '@/models/BenefitRedemptionClaim.js';
import { WALLET_MAX_BALANCE, WalletService } from '@/core/WalletService.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import { MiWallet } from '@/models/Wallet.js';

describe('check-in database persistence', () => {
	let db: DataSource;
	let service: CheckinService;
	let redemptions: BenefitRedemptionService;
	let achievements: AchievementService;
	let registeredAt = new Date('2024-02-28T16:00:00Z');
	let serial = 0;
	const notification = { createNotification: vi.fn() };
	const userIds: string[] = [];

	async function user(overrides: Partial<MiUser> = {}): Promise<MiUser> {
		const id = `checkin-test-${String(serial++).padStart(6, '0')}`;
		await db.getRepository(MiUser).insert({ id, username: id, usernameLower: id, ...overrides });
		await db.getRepository(MiUserProfile).insert({ userId: id });
		await db.getRepository(MiWallet).insert({ userId: id, balance: 0, reservedBalance: 0 });
		userIds.push(id);
		return db.getRepository(MiUser).findOneByOrFail({ id });
	}

	async function redeemCards(me: MiUser, amount: number): Promise<void> {
		const code = await redemptions.create({ name: 'Cards', rewardType: 'makeupCards', amount, maxRedemptions: 1 }, me);
		await redemptions.redeem(me.id, code.code);
	}

	async function updateCode(code: Awaited<ReturnType<BenefitRedemptionService['create']>>, enabled: boolean) {
		return redemptions.update(code.id, { name: code.name, rewardType: code.rewardType, amount: code.amount, maxRedemptions: code.maxRedemptions, expiresAt: code.expiresAt, enabled });
	}

	async function setPoints(userId: string, points: number): Promise<void> {
		await db.getRepository(MiWallet).update({ userId }, { balance: points, reservedBalance: 0 });
	}

	async function seedStreak(userId: string, start: string, days: number, rewardConsumed = false): Promise<void> {
		await db.getRepository(MiUserProfile).update({ userId }, { checkinFirstRewardClaimed: true });
		const previousDays = await db.getRepository(MiUserCheckin).countBy({ userId });
		await db.getRepository(MiUserCheckin).insert(Array.from({ length: days }, (_, index) => ({
			userId, date: new Date(new Date(`${start}T00:00:00Z`).getTime() + index * 86400000).toISOString().slice(0, 10),
			createdAt: new Date(), isMakeup: false, rewardConsumed, totalDays: previousDays + index + 1, consecutiveDays: index + 1,
		})));
	}

	beforeAll(async () => {
		// initTestDb refuses non-test environments and uses .config/test.yml, never the live database.
		db = await initTestDb();
		achievements = new AchievementService(db.getRepository(MiUserProfile) as never, notification as never);
		service = new CheckinService(db, db.getRepository(MiUserCheckin) as never, db.getRepository(MiUserProfile) as never, achievements, {
			packMany: async (ids: string[]) => ids.map(id => ({ id })),
		} as never, { parse: () => ({ date: registeredAt }), gen: new IdService({ id: 'aidx' } as never).gen } as never, new WalletService(db, new IdService({ id: 'aidx' } as never)));
		redemptions = new BenefitRedemptionService(db, service, new WalletService(db, new IdService({ id: 'aidx' } as never)), new IdService({ id: 'aidx' } as never), { packMany: async (users: MiUser[]) => users.map(user => ({ id: user.id })) } as never);
	});
	beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-09-28T04:00:00Z')); notification.createNotification.mockClear(); registeredAt = new Date('2024-02-28T16:00:00Z'); });
	afterEach(async () => {
		vi.useRealTimers();
		if (db?.isInitialized && userIds.length) {
			for (const userId of userIds) await db.getRepository(MiBenefitRedemptionCode).delete({ createdBy: userId });
			await db.getRepository(MiUser).delete(userIds.splice(0));
		}
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test.each(['makeupCards', 'points'] as const)('%s codes credit once under concurrent retries, including after disable', async rewardType => {
		const me = await user();
		const code = await redemptions.create({ name: ' Holiday ', rewardType, amount: 2, maxRedemptions: 5 }, me);
		expect(code).toMatchObject({ name: 'Holiday', rewardType, amount: 2, redemptions: 0, enabled: true, expiresAt: null });
		expect(code.code).toMatch(/^[0-9a-f]{32}$/);
		const results = await Promise.all(Array.from({ length: 12 }, () => redemptions.redeem(me.id, code.code.toUpperCase())));
		expect(results.filter(result => result.newlyRedeemed)).toHaveLength(1);
		expect(results.reduce((sum, result) => sum + result.amount, 0)).toBe(2);
		expect(await db.getRepository(MiBenefitRedemptionClaim).countBy({ userId: me.id, codeId: code.id })).toBe(1);
		if (rewardType === 'makeupCards') {
			expect(await db.getRepository(MiUserCheckinCardBatch).findBy({ userId: me.id })).toEqual([expect.objectContaining({ source: 'redemption', amount: 2, remaining: 2 })]);
			await service.makeup(me.id, '2026-09-27');
		} else {
			expect(await db.getRepository(MiWalletTransaction).findBy({ userId: me.id })).toEqual([expect.objectContaining({ type: 'redemptionReward', currency: 'points', amount: 2, balance: 2, relatedId: code.id, actorId: me.id, description: null })]);
			expect(await db.getRepository(MiUserCheckinCardBatch).countBy({ userId: me.id })).toBe(0);
			const wallet = new WalletService(db, new IdService({ id: 'aidx' } as never));
			expect((await wallet.transactionsWithFlow(me.id, 20))[0].flow).toMatchObject({ from: 'system', to: 'user', toUserId: me.id });
		}
		await updateCode(code, false);
		expect(await redemptions.redeem(me.id, code.code)).toEqual({ newlyRedeemed: false, rewardType, amount: 0 });
		expect((await redemptions.list(0, 20)).items[0]).toMatchObject({ redemptions: 1, enabled: false });
	});

	test.each(['makeupCards', 'points'] as const)('%s quotas hold across users and are not recycled after account deletion', async rewardType => {
		const admin = await user();
		const first = await user();
		const second = await user();
		const code = await redemptions.create({ name: 'Limited', rewardType, amount: 1, maxRedemptions: 1 }, admin);
		const results = await Promise.allSettled([redemptions.redeem(first.id, code.code), redemptions.redeem(second.id, code.code)]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(BenefitRedemptionService.ExhaustedCodeError) });
		const claim = await db.getRepository(MiBenefitRedemptionClaim).findOneByOrFail({ codeId: code.id });
		await db.getRepository(MiUser).delete(claim.userId);
		expect(await redemptions.claims(code.id, 0, 20, admin)).toMatchObject({ total: 1, items: [{ userId: claim.userId, user: null, rewardType, amount: 1 }] });
		await expect(redemptions.redeem(admin.id, code.code)).rejects.toBeInstanceOf(BenefitRedemptionService.ExhaustedCodeError);
	});

	test('edits code configuration and removes codes without deleting claims', async () => {
		const admin = await user();
		const recipient = await user();
		const code = await redemptions.create({ name: 'Original', rewardType: 'points', amount: 1, maxRedemptions: 2 }, admin);
		const updated = await redemptions.update(code.id, { name: 'Edited', rewardType: 'points', amount: 3, maxRedemptions: 2, expiresAt: null, enabled: true });
		expect(updated).toMatchObject({ name: 'Edited', amount: 3, maxRedemptions: 2, enabled: true });
		await redemptions.redeem(recipient.id, code.code);
		await expect(redemptions.update(code.id, { name: 'Edited', rewardType: 'makeupCards', amount: 1, maxRedemptions: 2, expiresAt: null, enabled: true })).rejects.toBeInstanceOf(BenefitRedemptionService.RewardLockedError);
		await redemptions.remove(code.id);
		expect((await redemptions.list(0, 20)).items.some(item => item.id === code.id)).toBe(false);
		expect(await redemptions.claims(code.id, 0, 20, admin)).toMatchObject({ total: 1 });
		await expect(redemptions.redeem(admin.id, code.code)).rejects.toBeInstanceOf(BenefitRedemptionService.NoSuchCodeError);
	});

	test.each(['makeupCards', 'points'] as const)('%s redemption failures preserve balances, claims and quota', async rewardType => {
		const me = await user();
		const code = await redemptions.create({ name: 'Timed', rewardType, amount: 2, maxRedemptions: 5, expiresAt: '2026-09-28T05:00:00Z' }, me);
		await updateCode(code, false);
		await expect(redemptions.redeem(me.id, code.code)).rejects.toBeInstanceOf(BenefitRedemptionService.DisabledCodeError);
		await updateCode(code, true);
		vi.setSystemTime(new Date('2026-09-28T05:00:00Z'));
		await expect(redemptions.redeem(me.id, code.code)).rejects.toBeInstanceOf(BenefitRedemptionService.ExpiredCodeError);
		await expect(redemptions.redeem(me.id, '0'.repeat(32))).rejects.toBeInstanceOf(BenefitRedemptionService.NoSuchCodeError);
		for (const overrides of [{ isSuspended: true }, { isDeleted: true }, { host: 'remote.example' }, { movedToUri: 'https://example.com/u' }, { username: 'system.proxy' }]) {
			const invalid = await user(overrides);
			await expect(redemptions.redeem(invalid.id, code.code)).rejects.toBeInstanceOf(BenefitRedemptionService.NotAllowedError);
		}
		expect(await service.getStatus(me.id)).toMatchObject({ makeupCards: 0, points: 0 });
		expect((await redemptions.list(0, 20)).items[0].redemptions).toBe(0);
		for (const invalid of [{ name: ' ' }, { amount: 0 }, { amount: 1.5 }, { amount: rewardType === 'points' ? 1000001 : 10001 }, { rewardType: 'unknown' as never }, { maxRedemptions: 0 }, { expiresAt: 'invalid' }, { expiresAt: '2026-09-27T00:00:00Z' }]) {
			await expect(redemptions.create({ name: 'Timed', rewardType, amount: 1, maxRedemptions: 1, ...invalid }, me)).rejects.toBeInstanceOf(BenefitRedemptionService.InvalidConfigurationError);
		}
	});

	test.each(['makeupCards', 'points'] as const)('%s claims and balance limits roll back the reward and counter together', async rewardType => {
		const me = await user();
		const code = await redemptions.create({ name: 'Rollback', rewardType, amount: 2, maxRedemptions: 5 }, me);
		await db.query(`CREATE FUNCTION benefit_claim_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test claim failure'; END $$`);
		await db.query(`CREATE TRIGGER benefit_claim_fail BEFORE INSERT ON benefit_redemption_claim FOR EACH ROW EXECUTE FUNCTION benefit_claim_fail()`);
		try {
			await expect(redemptions.redeem(me.id, code.code)).rejects.toThrow('test claim failure');
			expect(await service.getStatus(me.id)).toMatchObject({ makeupCards: 0, points: 0 });
			expect(await db.getRepository(MiUserCheckinCardBatch).countBy({ userId: me.id })).toBe(0);
			expect(await db.getRepository(MiWalletTransaction).countBy({ userId: me.id })).toBe(0);
			expect((await redemptions.list(0, 20)).items[0].redemptions).toBe(0);
		} finally {
			await db.query('DROP TRIGGER benefit_claim_fail ON benefit_redemption_claim');
			await db.query('DROP FUNCTION benefit_claim_fail()');
		}
		if (rewardType === 'points') await setPoints(me.id, WALLET_MAX_BALANCE);
		else await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinMakeupCards: 2147483647 });
		await expect(redemptions.redeem(me.id, code.code)).rejects.toBeInstanceOf(rewardType === 'points' ? WalletService.BalanceLimitError : CheckinService.CardLimitError);
		expect((await redemptions.list(0, 20)).items[0].redemptions).toBe(0);
		expect(await db.getRepository(MiBenefitRedemptionClaim).countBy({ codeId: code.id })).toBe(0);
	});

	test('personal redemption history contains both reward types without leaking another account or the code name', async () => {
		const me = await user();
		const other = await user();
		const cards = await redemptions.create({ name: 'Internal card note', rewardType: 'makeupCards', amount: 2, maxRedemptions: 2 }, me);
		const points = await redemptions.create({ name: 'Internal points note', rewardType: 'points', amount: 500, maxRedemptions: 2 }, me);
		await redemptions.redeem(me.id, cards.code);
		await redemptions.redeem(other.id, points.code);
		await redemptions.redeem(me.id, points.code);
		const history = await redemptions.history(me.id, 0, 20);
		expect(history.total).toBe(2);
		expect(history.items.map(entry => [entry.rewardType, entry.amount])).toEqual([['points', 500], ['makeupCards', 2]]);
		expect(history.items.every(entry => Object.keys(entry).sort().join(',') === 'amount,createdAt,id,rewardType')).toBe(true);
		expect(await redemptions.history(me.id, 2, 20)).toEqual({ total: 2, items: [] });
	});

	test('redeemed card batches are consumed FIFO without losing acquisition history', async () => {
		const me = await user();
		await redeemCards(me, 3);
		vi.setSystemTime(new Date('2026-09-28T04:00:01Z'));
		await redeemCards(me, 2);
		const batches = await db.getRepository(MiUserCheckinCardBatch).find({ where: { userId: me.id }, order: { createdAt: 'ASC', id: 'ASC' } });
		expect(batches.map(batch => [batch.source, batch.remaining])).toEqual([['redemption', 3], ['redemption', 2]]);
		await service.makeup(me.id, '2026-09-27');
		expect(await db.getRepository(MiUserCheckin).findOneByOrFail({ userId: me.id, date: '2026-09-27' })).toMatchObject({ cardBatchId: batches[0].id });
		expect(await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ id: batches[0].id })).toMatchObject({ amount: 3, used: 1, remaining: 2 });
	});

	test('benefit migration preserves card codes, claims and balances while removing grant-only fields', async () => {
		const me = await user();
		const code = await redemptions.create({ name: 'Migration', rewardType: 'makeupCards', amount: 2, maxRedemptions: 1 }, me);
		await redemptions.redeem(me.id, code.code);
		const { BenefitRewardTypes1792990531704 } = await import(pathToFileURL(resolve('migration/1792990531704-benefit-reward-types.js')).href);
		const migration = new BenefitRewardTypes1792990531704();
		const runner = db.createQueryRunner();
		await runner.connect();
		await runner.startTransaction();
		try {
			await migration.down(runner);
			await runner.query(`UPDATE user_checkin_card_batch SET source = 'admin', "grantLogId" = 'old-log', "adminId" = $1 WHERE "userId" = $1`, [me.id]);
			await migration.up(runner);
			expect(await runner.manager.findOneByOrFail(MiBenefitRedemptionCode, { id: code.id })).toMatchObject({ code: code.code, rewardType: 'makeupCards', redemptions: 1 });
			expect(await runner.manager.findOneByOrFail(MiBenefitRedemptionClaim, { codeId: code.id })).toMatchObject({ rewardType: 'makeupCards', amount: 2 });
			expect(await runner.manager.findOneByOrFail(MiUserProfile, { userId: me.id })).toMatchObject({ checkinMakeupCards: 2 });
			expect(await runner.manager.findOneByOrFail(MiUserCheckinCardBatch, { userId: me.id })).toMatchObject({ source: 'legacy', amount: 2, remaining: 2 });
			expect(await runner.hasColumn('user_checkin_card_batch', 'grantLogId')).toBe(false);
			expect(await runner.hasColumn('user_checkin_card_batch', 'adminId')).toBe(false);
		} finally {
			await runner.rollbackTransaction();
			await runner.release();
		}
	});

	test('migration rollback refuses to reinterpret points codes as makeup cards', async () => {
		const me = await user();
		const code = await redemptions.create({ name: 'Points', rewardType: 'points', amount: 20, maxRedemptions: 1 }, me);
		await redemptions.redeem(me.id, code.code);
		const { BenefitRewardTypes1792990531704 } = await import(pathToFileURL(resolve('migration/1792990531704-benefit-reward-types.js')).href);
		const runner = db.createQueryRunner();
		await runner.connect();
		await runner.startTransaction();
		try {
			await expect(new BenefitRewardTypes1792990531704().down(runner)).rejects.toThrow('Cannot revert while points redemption records exist.');
		} finally {
			await runner.rollbackTransaction();
			await runner.release();
		}
		expect((await service.getStatus(me.id)).points).toBe(20);
	});

	test('a failed makeup write restores its card batch and balance', async () => {
		const me = await user();
		await redeemCards(me, 2);
		const batch = await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ userId: me.id });
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

	test('opening balances are consumed before newly redeemed and exchanged cards', async () => {
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinMakeupCards: 1 });
		await setPoints(me.id, 60);
		await redeemCards(me, 1);
		await service.exchange(me.id, randomUUID());
		const batches = await db.getRepository(MiUserCheckinCardBatch).find({ where: { userId: me.id }, order: { createdAt: 'ASC', id: 'ASC' } });
		expect(batches.map(batch => batch.source)).toEqual(['legacy', 'redemption', 'exchange']);
		await service.makeup(me.id, '2026-09-27');
		expect(await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ id: batches[0].id })).toMatchObject({ used: 1, remaining: 0 });
		expect(await db.getRepository(MiUserCheckinCardBatch).findOneByOrFail({ id: batches[1].id })).toMatchObject({ used: 0, remaining: 1 });
	});

	test('calendar reads keep one snapshot while another connection completes check-in', async () => {
		const me = await user();
		await seedStreak(me.id, '2026-09-22', 6);
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinFirstRewardClaimed: false });
		const started = Promise.withResolvers<void>();
		const resume = Promise.withResolvers<void>();
		const createRunner = db.createQueryRunner.bind(db);
		const runnerSpy = vi.spyOn(db, 'createQueryRunner').mockImplementationOnce(mode => {
			const runner = createRunner(mode);
			const query = runner.query.bind(runner);
			let paused = false;
			vi.spyOn(runner, 'query').mockImplementation(async (sql: string, parameters?: unknown[] | ObjectLiteral, structured?: boolean) => {
				const result = structured ? await query(sql, parameters, true) : await query(sql, parameters);
				if (!paused && sql.startsWith('SELECT') && sql.includes('user_checkin')) {
					paused = true;
					started.resolve();
					await resume.promise;
				}
				return result;
			});
			return runner;
		});
		const reading = service.getStatus(me.id);
		try {
			await started.promise;
			expect(await service.checkin(me.id)).toMatchObject({ earnedMakeupCards: 1 });
			resume.resolve();
			const before = await reading;
			expect(before).toMatchObject({ checkedInToday: false, points: 0, makeupCards: 0, makeupCardProgress: 6, makeupCardTarget: 7, rewardDates: [] });
			expect(before.checkedInDates).not.toContain('2026-09-28');
			expect(await service.getStatus(me.id)).toMatchObject({ checkedInToday: true, points: 1, makeupCards: 1, makeupCardProgress: 0, makeupCardTarget: 30, rewardDates: ['2026-09-28'] });
		} finally {
			resume.resolve();
			await reading;
			runnerSpy.mockRestore();
		}
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

	test('gifts once at seven then every thirty normal days within a continuous streak', async () => {
		const me = await user();
		for (let day = 1; day <= 60; day++) {
			vi.setSystemTime(new Date(Date.UTC(2026, 6, day, 4)));
			const response = await service.checkin(me.id);
			const cards = day < 7 ? 0 : 1 + Math.floor((day - 7) / 30);
			expect(response).toMatchObject({ earnedMakeupCards: day >= 7 && (day - 7) % 30 === 0 ? 1 : 0, makeupCards: cards, makeupCardProgress: day < 7 ? day : (day - 7) % 30, makeupCardTarget: day < 7 ? 7 : 30, makeupCardFirstRewardClaimed: day >= 7, makeupCardExchangeCost: 60, makeupCardLimit: 3 });
			expect(await service.checkin(me.id)).toMatchObject({ earnedMakeupCards: 0, makeupCards: cards });
		}
		vi.setSystemTime(new Date('2026-09-01T04:00:00Z'));
		expect(await service.getStatus(me.id)).toMatchObject({ consecutiveDays: 0, makeupCardProgress: 0 });
		expect(await service.checkin(me.id)).toMatchObject({ consecutiveDays: 1, earnedMakeupCards: 0, makeupCardProgress: 1 });
	});

	test('first reward survives a break, needs seven normal days, and records the actual award month', async () => {
		const me = await user();
		for (const date of ['2026-09-20', '2026-09-21', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28']) {
			vi.setSystemTime(new Date(`${date}T04:00:00Z`));
			await service.checkin(me.id);
		}
		expect(await service.getStatus(me.id)).toMatchObject({ makeupCardProgress: 6, makeupCardTarget: 7, rewardDates: [] });
		await redeemCards(me, 1);
		expect(await service.makeup(me.id, '2026-09-22')).toMatchObject({ earnedMakeupCards: 1, makeupCardProgress: 1, makeupCardTarget: 30, rewardDates: ['2026-09-28'] });
		vi.setSystemTime(new Date('2026-10-01T04:00:00Z'));
		expect(await service.checkin(me.id)).toMatchObject({ earnedMakeupCards: 0, makeupCardProgress: 1, makeupCardTarget: 30, rewardDates: [] });
		expect(await service.getStatus(me.id, '2026-09')).toMatchObject({ rewardDates: ['2026-09-28'] });
	});

	test('a full inventory settles the first reward once without showing a credited calendar reward', async () => {
		const me = await user();
		await redeemCards(me, 3);
		for (let day = 21; day <= 27; day++) {
			vi.setSystemTime(new Date(`2026-09-${day}T04:00:00Z`));
			await service.checkin(me.id);
		}
		expect(await service.getStatus(me.id)).toMatchObject({ makeupCardFirstRewardClaimed: true, makeupCardTarget: 30, makeupCardProgress: 0, makeupCards: 3, rewardDates: [] });
		vi.setSystemTime(new Date('2026-09-29T04:00:00Z'));
		await service.checkin(me.id);
		expect(await service.makeup(me.id, '2026-09-28')).toMatchObject({ earnedMakeupCards: 0, makeupCards: 2, makeupCardProgress: 1, rewardDates: [] });
	});

	test('makeup repairs continuity but only normal days progress the next reward', async () => {
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinFirstRewardClaimed: true });
		for (let day = 1; day <= 28; day++) {
			vi.setSystemTime(new Date(Date.UTC(2026, 8, day, 4)));
			await service.checkin(me.id);
		}
		vi.setSystemTime(new Date('2026-09-30T04:00:00Z'));
		await redeemCards(me, 1);
		expect(await service.makeup(me.id, '2026-09-29')).toMatchObject({ totalDays: 29, earnedPoints: 0, points: 28, earnedMakeupCards: 0, makeupCards: 0, makeupCardProgress: 28 });
		const results = await Promise.all(Array.from({ length: 12 }, () => service.checkin(me.id)));
		expect(results.reduce((sum, response) => sum + response.earnedMakeupCards, 0)).toBe(0);
		expect(await service.getStatus(me.id)).toMatchObject({ makeupCards: 0, makeupCardProgress: 29, totalDays: 30, points: 29 });
		vi.setSystemTime(new Date('2026-10-01T04:00:00Z'));
		const rewards = await Promise.all(Array.from({ length: 12 }, () => service.checkin(me.id)));
		expect(rewards.reduce((sum, response) => sum + response.earnedMakeupCards, 0)).toBe(1);
		expect(await service.getStatus(me.id)).toMatchObject({ rewardDates: ['2026-10-01'], makeupCardProgress: 0 });
	});

	test('does not revive the reward progress of an expired historical streak', async () => {
		const me = await user();
		await db.getRepository(MiUserCheckin).insert(Array.from({ length: 7 }, (_, index) => ({ userId: me.id, date: `2026-09-${index + 10}`, createdAt: new Date(), isMakeup: false, totalDays: index + 1, consecutiveDays: index + 1 })));
		await setPoints(me.id, 7);
		expect(await service.getStatus(me.id)).toMatchObject({ makeupCards: 0, makeupCardProgress: 0 });
		expect(await service.checkin(me.id)).toMatchObject({ earnedMakeupCards: 0, makeupCards: 0, makeupCardProgress: 1 });
	});

	test('makeup joins a 29-day streak to today and crossing the milestone rewards once under retries', async () => {
		const me = await user();
		vi.setSystemTime(new Date('2026-09-30T04:00:00Z'));
		await seedStreak(me.id, '2026-08-31', 29);
		await service.checkin(me.id);
		await expect(service.makeup(me.id, '2026-09-29')).rejects.toBeInstanceOf(CheckinService.NoMakeupCardsError);
		await redeemCards(me, 1);
		const results = await Promise.all([
			...Array.from({ length: 8 }, () => service.makeup(me.id, '2026-09-29')),
			...Array.from({ length: 8 }, () => service.checkin(me.id)),
		]);
		expect(results.reduce((sum, result) => sum + result.earnedMakeupCards, 0)).toBe(1);
		expect(await service.getStatus(me.id)).toMatchObject({ consecutiveDays: 31, makeupCardProgress: 0, makeupCards: 1, points: 1 });
		expect(await db.getRepository(MiUserCheckin).countBy({ userId: me.id, rewardConsumed: true })).toBe(30);
		expect(await db.getRepository(MiUserCheckinCardBatch).findBy({ userId: me.id, source: 'reward' })).toEqual([expect.objectContaining({ amount: 1 })]);
	});

	test('waits for today’s active check-in after makeup completes 30 days', async () => {
		const me = await user();
		vi.setSystemTime(new Date('2026-09-30T04:00:00Z'));
		await seedStreak(me.id, '2026-08-31', 29);
		await redeemCards(me, 1);
		expect(await service.makeup(me.id, '2026-09-29')).toMatchObject({ checkedInToday: false, consecutiveDays: 30, makeupCardProgress: 29, makeupCards: 0, earnedMakeupCards: 0 });
		expect(await db.getRepository(MiUserCheckin).countBy({ userId: me.id, rewardConsumed: true })).toBe(0);
		expect(await service.checkin(me.id)).toMatchObject({ consecutiveDays: 31, makeupCardProgress: 0, makeupCards: 1, earnedMakeupCards: 1 });
	});

	test('settles full-inventory rewards permanently without reclaiming them after spending a card', async () => {
		const me = await user();
		vi.setSystemTime(new Date('2026-09-30T04:00:00Z'));
		await seedStreak(me.id, '2026-09-01', 29);
		await redeemCards(me, 3);
		expect(await service.checkin(me.id)).toMatchObject({ earnedMakeupCards: 0, makeupCards: 3, makeupCardProgress: 0, points: 1 });
		expect(await db.getRepository(MiUserCheckin).countBy({ userId: me.id, rewardConsumed: true })).toBe(30);
		vi.setSystemTime(new Date('2026-10-02T04:00:00Z'));
		await service.checkin(me.id);
		expect(await service.makeup(me.id, '2026-10-01')).toMatchObject({ consecutiveDays: 32, earnedMakeupCards: 0, makeupCards: 2, makeupCardProgress: 1 });
		expect(await service.checkin(me.id)).toMatchObject({ earnedMakeupCards: 0, makeupCards: 2 });
	});

	test('joining an already settled streak preserves its accounting while retaining unconsumed days', async () => {
		const me = await user();
		vi.setSystemTime(new Date('2026-09-30T04:00:00Z'));
		await seedStreak(me.id, '2026-08-27', 30, true);
		await seedStreak(me.id, '2026-09-27', 3);
		await redeemCards(me, 1);
		await service.checkin(me.id);
		expect(await service.makeup(me.id, '2026-09-26')).toMatchObject({ consecutiveDays: 35, makeupCardProgress: 4, earnedMakeupCards: 0, makeupCards: 0 });
		expect(await db.getRepository(MiUserCheckin).countBy({ userId: me.id, rewardConsumed: true })).toBe(30);
	});

	test('rolls back a reward together with its consumed dates when batch insertion fails', async () => {
		const me = await user();
		vi.setSystemTime(new Date('2026-09-30T04:00:00Z'));
		await seedStreak(me.id, '2026-09-01', 29);
		await db.query(`CREATE FUNCTION checkin_reward_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source = 'reward' THEN RAISE EXCEPTION 'test reward failure'; END IF; RETURN NEW; END $$`);
		await db.query(`CREATE TRIGGER checkin_reward_fail BEFORE INSERT ON user_checkin_card_batch FOR EACH ROW EXECUTE FUNCTION checkin_reward_fail()`);
		try {
			await expect(service.checkin(me.id)).rejects.toThrow('test reward failure');
			expect(await service.getStatus(me.id)).toMatchObject({ totalDays: 29, makeupCardProgress: 29, makeupCards: 0, points: 0 });
			expect(await db.getRepository(MiUserCheckin).countBy({ userId: me.id, rewardConsumed: true })).toBe(0);
		} finally {
			await db.query('DROP TRIGGER checkin_reward_fail ON user_checkin_card_batch');
			await db.query('DROP FUNCTION checkin_reward_fail()');
		}
		expect(await service.checkin(me.id)).toMatchObject({ earnedMakeupCards: 1, makeupCards: 1, points: 1 });
	});

	test('migration settles existing milestones per streak, preserves tails and balances, and supports rollback', async () => {
		const me = await user();
		const continuing = await user();
		await seedStreak(continuing.id, '2026-08-02', 59);
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinMakeupCards: 9 });
		await setPoints(me.id, 777);
		const lengths = [29, 30, 31, 59, 60];
		let start = new Date('2025-01-01T00:00:00Z');
		for (const days of lengths) {
			await seedStreak(me.id, start.toISOString().slice(0, 10), days);
			start = new Date(start.getTime() + (days + 2) * 86400000);
		}
		const original = await db.getRepository(MiUserCheckin).find({ where: { userId: me.id }, order: { date: 'ASC' } });
		const migrationUrl = pathToFileURL(resolve('migration/1790786122156-checkin-streak-rewards.js')).href;
		const { CheckinStreakRewards1790786122156 } = await import(migrationUrl);
		const migration = new CheckinStreakRewards1790786122156();
		const runner = db.createQueryRunner();
		await runner.connect();
		await runner.startTransaction();
		try {
			await migration.down(runner);
			await migration.up(runner);
			const migrated = await runner.manager.find(MiUserCheckin, { where: { userId: me.id }, order: { date: 'ASC' } });
			let offset = 0;
			for (const days of lengths) {
				const segment = migrated.slice(offset, offset + days);
				expect(segment.filter(record => record.rewardConsumed)).toHaveLength(Math.floor(days / 30) * 30);
				expect(segment.slice(Math.floor(days / 30) * 30).every(record => !record.rewardConsumed)).toBe(true);
				offset += days;
			}
			expect(migrated.map(({ rewardConsumed: _consumed, ...record }) => record)).toEqual(original.map(({ rewardConsumed: _consumed, ...record }) => record));
			expect(await runner.manager.findOneByOrFail(MiUserProfile, { userId: me.id })).toMatchObject({ checkinMakeupCards: 9 });
			expect(await runner.manager.findOneByOrFail(MiWallet, { userId: me.id })).toMatchObject({ balance: 777 });
			await migration.down(runner);
			expect(await runner.hasColumn('user_checkin', 'rewardConsumed')).toBe(false);
			expect(await runner.query('SELECT COUNT(*)::integer AS count FROM user_checkin WHERE "userId" = $1', [me.id])).toEqual([{ count: lengths.reduce((sum, length) => sum + length, 0) }]);
			await migration.up(runner);
			await runner.commitTransaction();
		} finally {
			if (runner.isTransactionActive) await runner.rollbackTransaction();
			await runner.release();
		}
		const lastDate = original.at(-1)!.date;
		vi.setSystemTime(new Date(`${lastDate}T04:00:00Z`));
		expect(await service.checkin(me.id)).toMatchObject({ newlyCheckedIn: false, earnedMakeupCards: 0, makeupCards: 9, points: 777, makeupCardProgress: 0 });
		vi.setSystemTime(new Date('2026-09-30T04:00:00Z'));
		expect(await service.getStatus(continuing.id)).toMatchObject({ consecutiveDays: 59, makeupCardProgress: 29, makeupCards: 0 });
		expect(await service.checkin(continuing.id)).toMatchObject({ consecutiveDays: 60, makeupCardProgress: 0, earnedMakeupCards: 1, makeupCards: 1, points: 1 });
	});

	test('first-reward migration preserves legacy reward batches, skips and calendar dates through rollback', async () => {
		const rewarded = await user();
		const skipped = await user();
		const newcomer = await user();
		for (let day = 21; day <= 27; day++) {
			vi.setSystemTime(new Date(`2026-09-${day}T04:00:00Z`));
			await service.checkin(rewarded.id);
		}
		await db.getRepository(MiUserCheckin).update({ userId: rewarded.id }, { rewardConsumed: false });
		await seedStreak(skipped.id, '2026-08-29', 30, true);
		const migrationUrl = pathToFileURL(resolve('migration/1790827883430-checkin-first-reward.js')).href;
		const { CheckinFirstReward1790827883430 } = await import(migrationUrl);
		const migration = new CheckinFirstReward1790827883430();
		const runner = db.createQueryRunner();
		await runner.connect();
		await runner.startTransaction();
		try {
			await migration.down(runner);
			expect(await runner.hasColumn('user_profile', 'checkinFirstRewardClaimed')).toBe(false);
			expect(await runner.hasColumn('user_checkin', 'earnedMakeupCards')).toBe(false);
			await migration.up(runner);
			for (const me of [rewarded, skipped]) {
				expect(await runner.manager.findOneByOrFail(MiUserProfile, { userId: me.id })).toMatchObject({ checkinFirstRewardClaimed: true });
			}
			expect(await runner.manager.findOneByOrFail(MiUserProfile, { userId: newcomer.id })).toMatchObject({ checkinFirstRewardClaimed: false });
			expect(await runner.manager.findOneByOrFail(MiUserCheckin, { userId: rewarded.id, date: '2026-09-27' })).toMatchObject({ earnedMakeupCards: 1 });
			expect(await runner.manager.countBy(MiUserCheckin, { userId: skipped.id, earnedMakeupCards: 0 })).toBe(30);
			await runner.commitTransaction();
		} finally {
			if (runner.isTransactionActive) await runner.rollbackTransaction();
			await runner.release();
		}
		expect(await service.getStatus(rewarded.id)).toMatchObject({ rewardDates: ['2026-09-27'], makeupCardTarget: 30, makeupCards: 1 });
	});

	test('monthly exchange quota changes at Shanghai midnight and old retries do not consume the new month', async () => {
		const me = await user();
		await setPoints(me.id, 180);
		vi.setSystemTime(new Date('2026-09-30T15:59:59.999Z'));
		const requestId = randomUUID();
		await service.exchange(me.id, requestId);
		expect(await service.getStatus(me.id)).toMatchObject({ makeupCardExchangeAvailable: false });
		vi.setSystemTime(new Date('2026-09-30T16:00:00Z'));
		expect(await service.exchange(me.id, requestId)).toMatchObject({ exchanged: false, points: 120 });
		expect(await service.getStatus(me.id)).toMatchObject({ today: '2026-10-01', makeupCardExchangeAvailable: true });
		expect(await service.exchange(me.id, randomUUID())).toMatchObject({ exchanged: true, points: 60, makeupCards: 2 });
		await expect(service.exchange(me.id, randomUUID())).rejects.toBeInstanceOf(CheckinService.MonthlyExchangeLimitError);
	});

	test('limits makeup to seven civil days across months and advances the boundary at Shanghai midnight', async () => {
		const me = await user();
		await redeemCards(me, 3);
		vi.setSystemTime(new Date('2026-09-30T16:00:00Z'));
		expect(await service.getStatus(me.id)).toMatchObject({ today: '2026-10-01', makeupEarliestDate: '2026-09-24' });
		await expect(service.makeup(me.id, '2026-09-23')).rejects.toBeInstanceOf(CheckinService.InvalidDateError);
		expect(await service.makeup(me.id, '2026-09-24')).toMatchObject({ earnedPoints: 0, makeupCards: 2 });
		vi.setSystemTime(new Date('2026-10-01T16:00:00Z'));
		expect(await service.getStatus(me.id)).toMatchObject({ today: '2026-10-02', makeupEarliestDate: '2026-09-25' });
		await expect(service.makeup(me.id, '2026-09-24')).rejects.toBeInstanceOf(CheckinService.InvalidDateError);
		expect(await service.makeup(me.id, '2026-09-25')).toMatchObject({ earnedPoints: 0, makeupCards: 1 });
	});

	test('exchanges points once for concurrent retries and returns current balances for a later retry', async () => {
		const me = await user();
		await setPoints(me.id, 120);
		const requestId = randomUUID();
		const results = await Promise.all(Array.from({ length: 16 }, () => service.exchange(me.id, requestId)));
		expect(results.filter(result => result.exchanged)).toHaveLength(1);
		expect(results.every(result => result.points === 60 && result.makeupCards === 1)).toBe(true);
		expect(await db.getRepository(MiUserCheckinExchange).findBy({ userId: me.id })).toEqual([expect.objectContaining({ requestId, pointsSpent: 60, cardsGranted: 1 })]);
		await service.makeup(me.id, '2026-09-27');
		expect(await service.exchange(me.id, requestId.toUpperCase())).toEqual({ points: 60, makeupCards: 0, exchanged: false });
		await db.getRepository(MiUser).delete(me.id);
		expect(await db.getRepository(MiUserCheckinExchange).countBy({ userId: me.id })).toBe(0);
	});

	test('different concurrent exchanges cannot exceed the monthly quota', async () => {
		const me = await user();
		await setPoints(me.id, 120);
		const results = await Promise.allSettled([service.exchange(me.id, randomUUID()), service.exchange(me.id, randomUUID())]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(CheckinService.MonthlyExchangeLimitError) });
		expect(await service.getStatus(me.id)).toMatchObject({ points: 60, makeupCards: 1, makeupCardExchangeAvailable: false });
		expect(await db.getRepository(MiUserCheckinExchange).countBy({ userId: me.id })).toBe(1);
	});

	test('exchange, actual check-in, makeup and administrator grants preserve all balance changes', async () => {
		const me = await user();
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinMakeupCards: 1 });
		await setPoints(me.id, 60);
		await Promise.all([service.exchange(me.id, randomUUID()), service.checkin(me.id), service.makeup(me.id, '2026-09-27'), redeemCards(me, 1)]);
		expect(await service.getStatus(me.id)).toMatchObject({ points: 1, makeupCards: 2, totalDays: 2, makeupCardProgress: 1 });
	});

	test('a failed ledger insertion rolls back both exchanged balances and lets the same request retry', async () => {
		const me = await user();
		await setPoints(me.id, 60);
		await db.query(`CREATE FUNCTION checkin_exchange_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test exchange failure'; END $$`);
		await db.query(`CREATE TRIGGER checkin_exchange_fail BEFORE INSERT ON user_checkin_exchange FOR EACH ROW EXECUTE FUNCTION checkin_exchange_fail()`);
		const requestId = randomUUID();
		try {
			await expect(service.exchange(me.id, requestId)).rejects.toThrow('test exchange failure');
			expect(await service.getStatus(me.id)).toMatchObject({ points: 60, makeupCards: 0 });
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
		await setPoints(me.id, 59);
		await expect(service.exchange(me.id, randomUUID())).rejects.toBeInstanceOf(CheckinService.InsufficientPointsError);
		expect(await service.getStatus(me.id)).toMatchObject({ points: 59, makeupCards: 0, makeupCardExchangeAvailable: true });
		await db.getRepository(MiUserProfile).update({ userId: me.id }, { checkinMakeupCards: 3 });
		await setPoints(me.id, 60);
		await expect(service.exchange(me.id, randomUUID())).rejects.toBeInstanceOf(CheckinService.CardLimitError);
		expect(await service.getStatus(me.id)).toMatchObject({ points: 60, makeupCards: 3 });
	});

	test('concurrent duplicate makeups consume one card without awarding points and persist the calendar marker', async () => {
		const me = await user();
		vi.setSystemTime(new Date('2026-09-02T04:00:00Z'));
		await redeemCards(me, 1);
		const results = await Promise.all(Array.from({ length: 16 }, () => service.makeup(me.id, '2026-08-31')));
		expect(results.filter(result => result.newlyCheckedIn)).toHaveLength(1);
		expect(results.reduce((points, result) => points + result.earnedPoints, 0)).toBe(0);
		expect(results.flatMap(result => result.earnedAchievements)).toEqual(['checkin1']);
		expect(await service.getStatus(me.id, '2026-08')).toMatchObject({ month: '2026-08', checkedInToday: false, totalDays: 1, points: 0, makeupCards: 0, makeupDates: ['2026-08-31'] });
		expect(results.every(result => result.month === '2026-08')).toBe(true);
		expect(await service.makeup(me.id, '2026-08-31')).toMatchObject({ newlyCheckedIn: false, earnedPoints: 0, points: 0, makeupCards: 0 });
	});

	test('concurrent different makeups cannot overdraw the last card', async () => {
		const me = await user();
		await redeemCards(me, 1);
		const results = await Promise.allSettled([service.makeup(me.id, '2026-09-26'), service.makeup(me.id, '2026-09-27')]);
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(CheckinService.NoMakeupCardsError) });
		expect(await service.getStatus(me.id)).toMatchObject({ totalDays: 1, points: 0, makeupCards: 0 });
	});

	test('makeups repair later totals and join streaks before ranking and achievements are evaluated', async () => {
		const me = await user();
		for (const date of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-25', '2026-09-26', '2026-09-27']) {
			vi.setSystemTime(new Date(`${date}T04:00:00Z`));
			await service.checkin(me.id);
		}
		vi.setSystemTime(new Date('2026-09-28T04:00:00Z'));
		await redeemCards(me, 1);
		expect(await service.makeup(me.id, '2026-09-24')).toMatchObject({ totalDays: 7, consecutiveDays: 7, points: 6, makeupCards: 0, earnedAchievements: ['checkinStreak7'] });
		const records = await db.getRepository(MiUserCheckin).find({ where: { userId: me.id }, order: { date: 'ASC' } });
		expect(records.map(record => record.totalDays)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect(records.map(record => record.consecutiveDays)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect((await service.ranking('consecutive', 0, 20, me)).myRank).toEqual({ rank: 1, days: 7 });
		expect((await service.ranking('total', 0, 20, me)).myRank).toEqual({ rank: 1, days: 7 });
		expect(await service.checkin(me.id)).toMatchObject({ totalDays: 8, consecutiveDays: 8, points: 7 });
	});

	test('validates registration, leap dates, and site midnight without consuming cards', async () => {
		const me = await user();
		await redeemCards(me, 3);
		for (const date of ['2024-02-28', '2026-02-29', '2026-09-28', '2026-09-29', '2026-04-31']) {
			await expect(service.makeup(me.id, date)).rejects.toBeInstanceOf(CheckinService.InvalidDateError);
		}
		vi.setSystemTime(new Date('2024-03-01T04:00:00Z'));
		await expect(service.makeup(me.id, '2024-02-28')).rejects.toBeInstanceOf(CheckinService.InvalidDateError);
		expect(await service.makeup(me.id, '2024-02-29')).toMatchObject({ registeredDate: '2024-02-29', makeupEarliestDate: '2024-02-29', points: 0, makeupCards: 2, makeupDates: ['2024-02-29'] });
		vi.setSystemTime(new Date('2026-09-28T15:59:59.999Z'));
		await expect(service.makeup(me.id, '2026-09-28')).rejects.toBeInstanceOf(CheckinService.InvalidDateError);
		vi.setSystemTime(new Date('2026-09-28T16:00:00Z'));
		expect(await service.makeup(me.id, '2026-09-28')).toMatchObject({ today: '2026-09-29', points: 0, makeupCards: 1 });
	});

	test('daily check-in, redemption and makeup serialize without losing balances', async () => {
		const me = await user();
		await redeemCards(me, 1);
		await Promise.all([service.checkin(me.id), service.makeup(me.id, '2026-09-27'), redeemCards(me, 2)]);
		expect(await service.getStatus(me.id)).toMatchObject({ totalDays: 2, consecutiveDays: 2, points: 1, makeupCards: 2, checkedInDates: ['2026-09-27', '2026-09-28'] });
		const claims = await db.getRepository(MiBenefitRedemptionClaim).findBy({ userId: me.id });
		expect(claims).toHaveLength(2);
		expect(claims.map(claim => claim.amount).sort()).toEqual([1, 2]);
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
