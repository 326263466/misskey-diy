/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { CheckinService, checkinAchievements, checkinDate, previousCheckinDate, isValidCheckinDate } from '@/core/CheckinService.js';
import { AchievementService } from '@/core/AchievementService.js';
import { MiUser } from '@/models/User.js';
import { MiUserCheckin } from '@/models/UserCheckin.js';
import { CHECKIN_ACHIEVEMENT_TYPES } from '@/models/UserProfile.js';
import CheckinEndpoint from '@/server/api/endpoints/i/checkin.js';
import StatusEndpoint from '@/server/api/endpoints/i/checkin-status.js';
import RankingEndpoint from '@/server/api/endpoints/checkin/ranking.js';
import ClaimEndpoint from '@/server/api/endpoints/i/claim-achievement.js';
import MakeupEndpoint from '@/server/api/endpoints/i/checkin-makeup.js';
import GrantCardsEndpoint, { meta as grantCardsMeta } from '@/server/api/endpoints/admin/checkin/grant-cards.js';
import ExchangeEndpoint from '@/server/api/endpoints/i/checkin-exchange.js';
import RedeemEndpoint, { meta as redeemMeta } from '@/server/api/endpoints/i/checkin-redeem.js';
import CreateCodeEndpoint, { meta as createCodeMeta } from '@/server/api/endpoints/admin/checkin/codes/create.js';
import ListCodesEndpoint, { meta as listCodesMeta } from '@/server/api/endpoints/admin/checkin/codes/list.js';
import UpdateCodeEndpoint, { meta as updateCodeMeta } from '@/server/api/endpoints/admin/checkin/codes/update.js';
import CodeClaimsEndpoint, { meta as codeClaimsMeta } from '@/server/api/endpoints/admin/checkin/codes/claims.js';
import { CheckinRedemptionService } from '@/core/CheckinRedemptionService.js';

function setup(records: Partial<MiUserCheckin>[] = []) {
	const user = { id: 'user', username: 'user', host: null, isSuspended: false, isDeleted: false, movedToUri: null };
	const profile = { achievements: [] as { name: string; unlockedAt: number }[], checkinPoints: 0, checkinMakeupCards: 0 };
	const state = { failInsert: false };
	const latest = (): Partial<MiUserCheckin> | null => [...records].sort((a, b) => b.date!.localeCompare(a.date!))[0] ?? null;
	const query = {
		select: vi.fn().mockReturnThis(), addSelect: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(),
		getMany: vi.fn(async () => records),
		getRawOne: vi.fn(async () => ({ streak: Math.max(0, ...records.map(record => record.consecutiveDays ?? 0)), total: Math.max(0, ...records.map(record => record.totalDays ?? 0)) })),
	};
	const actualDays = () => records.filter(record => !record.isMakeup).length;
	const repository = { findOne: vi.fn(async () => latest()), createQueryBuilder: vi.fn(() => query), countBy: vi.fn(async () => actualDays()) };
	const manager = {
		findOne: vi.fn(async (entity: unknown) => entity === MiUser ? user : latest()),
		create: vi.fn((_entity: unknown, data: Partial<MiUserCheckin>) => data),
		increment: vi.fn(async (_entity: unknown, _where: unknown, property: 'checkinPoints' | 'checkinMakeupCards', amount: number) => { profile[property] += amount; }),
		findOneByOrFail: vi.fn(async () => profile),
		countBy: vi.fn(async () => actualDays()),
		insert: vi.fn(async (_entity: unknown, record: Partial<MiUserCheckin>) => {
			if (state.failInsert) throw new Error('insert failed');
			records.push(record);
		}),
	};
	const achievements = { create: vi.fn(async (_id: string, name: string) => {
		if (profile.achievements.some(achievement => achievement.name === name)) return false;
		profile.achievements.push({ name, unlockedAt: Date.now() });
		return true;
	}) };
	const db = {
		transaction: vi.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(manager)),
		query: vi.fn().mockResolvedValue([]),
	};
	const pack = { packMany: vi.fn(async (ids: string[]) => ids.map(id => ({ id }))) };
	const service = new CheckinService(db as never, repository as never, { findOneByOrFail: vi.fn(async () => profile) } as never, achievements as never, pack as never, { parse: () => ({ date: new Date('2024-01-01T00:00:00Z') }) } as never, { log: vi.fn() } as never);
	return { service, records, user, state, manager, achievements, profile, repository, query, db, pack };
}

afterEach(() => vi.useRealTimers());

describe('check-in date and milestones', () => {
	test('uses the fixed site date at midnight rather than the process timezone', () => {
		expect(checkinDate(new Date('2026-09-28T15:59:59.999Z'))).toBe('2026-09-28');
		expect(checkinDate(new Date('2026-09-28T16:00:00.000Z'))).toBe('2026-09-29');
		expect(previousCheckinDate('2024-03-01')).toBe('2024-02-29');
		expect(previousCheckinDate('2026-01-01')).toBe('2025-12-31');
	});

	test('awards only reached server milestones', () => {
		expect(checkinAchievements(0, 0)).toEqual([]);
		expect(checkinAchievements(6, 6)).toEqual(['checkin1']);
		expect(checkinAchievements(7, 7)).toEqual(['checkin1', 'checkinStreak7']);
		expect(checkinAchievements(30, 30)).toEqual(['checkin1', 'checkinStreak7', 'checkinStreak30', 'checkinTotal30']);
		expect(checkinAchievements(365, 1)).toEqual(['checkin1', 'checkinTotal30', 'checkinTotal100', 'checkinTotal365']);
	});

	test.each(['2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', 'invalid'])('rejects an invalid civil date: %s', date => {
		expect(isValidCheckinDate(date)).toBe(false);
	});

	test('accepts leap days only in leap years', () => {
		expect(isValidCheckinDate('2024-02-29')).toBe(true);
		expect(isValidCheckinDate('2100-02-29')).toBe(false);
	});
});

describe('manual check-in service', () => {
	test('locks before first insertion, returns calendar state, and is idempotent on retry', async () => {
		vi.useFakeTimers().setSystemTime(new Date('2026-09-28T04:00:00Z'));
		const fixture = setup();
		const first = await fixture.service.checkin('user');
		expect(fixture.manager.findOne).toHaveBeenNthCalledWith(1, MiUser, { where: { id: 'user' }, lock: { mode: 'for_no_key_update' } });
		expect(first).toMatchObject({ newlyCheckedIn: true, checkedInToday: true, totalDays: 1, consecutiveDays: 1, monthlyDays: 1, checkedInDates: ['2026-09-28'], earnedAchievements: ['checkin1'], points: 1, earnedPoints: 1 });
		const retry = await fixture.service.checkin('user');
		expect(retry).toMatchObject({ newlyCheckedIn: false, totalDays: 1, earnedAchievements: [], points: 1, earnedPoints: 0 });
		expect(fixture.manager.insert).toHaveBeenCalledOnce();
		expect(retry.achievements).toHaveLength(1);
	});

	test('continues across a month boundary and resets a broken streak', async () => {
		vi.useFakeTimers().setSystemTime(new Date('2026-10-01T04:00:00Z'));
		const fixture = setup([{ userId: 'user', date: '2026-09-30', totalDays: 9, consecutiveDays: 6 }]);
		expect(await fixture.service.checkin('user')).toMatchObject({ totalDays: 10, consecutiveDays: 7, earnedAchievements: ['checkin1', 'checkinStreak7'] });
		vi.setSystemTime(new Date('2026-10-03T04:00:00Z'));
		expect(await fixture.service.checkin('user')).toMatchObject({ totalDays: 11, consecutiveDays: 1 });
	});

	test('does not write or grant achievements when only reading the calendar', async () => {
		const fixture = setup([{ date: '2026-09-27', totalDays: 15, consecutiveDays: 5 }]);
		fixture.query.getMany.mockResolvedValue([{ date: '2024-02-29' }]);
		fixture.profile.achievements.push({ name: 'checkin1', unlockedAt: 1 }, { name: 'login7', unlockedAt: 2 });
		const current = await fixture.service.getStatus('user', '2024-02', new Date('2026-09-28T04:00:00Z'));
		expect(current).toMatchObject({ checkedInToday: false, consecutiveDays: 5, monthlyDays: 1, month: '2024-02', checkedInDates: ['2024-02-29'], achievements: [{ name: 'checkin1', unlockedAt: 1 }] });
		expect(fixture.query.andWhere).toHaveBeenCalledWith(expect.any(String), { start: '2024-02-01', end: '2024-03-01' });
		expect((await fixture.service.getStatus('user', undefined, new Date('2026-09-29T04:00:00Z'))).consecutiveDays).toBe(0);
		expect(fixture.manager.insert).not.toHaveBeenCalled();
		expect(fixture.achievements.create).not.toHaveBeenCalled();
	});

	test.each([{ host: 'remote.example' }, { isSuspended: true }, { isDeleted: true }, { movedToUri: 'https://other.example/user' }, { username: 'system.proxy' }])('rejects ineligible accounts: %o', async overrides => {
		const fixture = setup();
		Object.assign(fixture.user, overrides);
		await expect(fixture.service.checkin('user')).rejects.toBeInstanceOf(CheckinService.NotAllowedError);
		expect(fixture.manager.insert).not.toHaveBeenCalled();
		expect(fixture.achievements.create).not.toHaveBeenCalled();
	});

	test('does not award milestones if record insertion fails', async () => {
		const fixture = setup();
		fixture.state.failInsert = true;
		await expect(fixture.service.checkin('user')).rejects.toThrow('insert failed');
		expect(fixture.achievements.create).not.toHaveBeenCalled();
	});

	test('recovers a historical milestone even if a prior response was interrupted before granting it', async () => {
		vi.useFakeTimers().setSystemTime(new Date('2026-09-28T04:00:00Z'));
		const fixture = setup([{ userId: 'user', date: '2026-09-20', totalDays: 7, consecutiveDays: 7 }]);
		expect(await fixture.service.checkin('user')).toMatchObject({ consecutiveDays: 1, earnedAchievements: ['checkin1', 'checkinStreak7'] });
	});

	test('returns the personal rank beyond the public top 100 without leaking it into the page', async () => {
		const fixture = setup();
		fixture.db.query.mockResolvedValue([{ userId: 'visible', days: 12, rank: 99, position: 100 }, { userId: 'user', days: 1, rank: 104, position: 108 }]);
		const response = await fixture.service.ranking('total', 99, 50, { id: 'user' } as MiUser, new Date('2026-09-28T04:00:00Z'));
		expect(response.items).toEqual([{ days: 12, rank: 99, user: { id: 'visible' } }]);
		expect(response.myRank).toEqual({ days: 1, rank: 104 });
		expect(fixture.db.query.mock.calls[0][1]).toEqual(['0001-01-01', '2026-09-28', 99, 100, 'user']);
		expect(fixture.pack.packMany).toHaveBeenCalledWith(['visible'], { id: 'user' }, { schema: 'UserDetailedNotMe' });
	});
});

describe('check-in endpoint contracts', () => {
	test('requires a UUID idempotency key for exchanging points', async () => {
		const exchange = vi.fn();
		const endpoint = new ExchangeEndpoint({ exchange } as never);
		for (const params of [{}, { requestId: 'invalid' }, { requestId: '' }]) {
			await expect(endpoint.exec(params, { id: 'user' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		expect(exchange).not.toHaveBeenCalled();
	});

	test.each([
		[CheckinService.InsufficientPointsError, 'INSUFFICIENT_CHECKIN_POINTS'],
		[CheckinService.CardLimitError, 'CARD_LIMIT_EXCEEDED'],
		[CheckinService.NotAllowedError, 'CHECKIN_NOT_ALLOWED'],
	] as const)('maps exchange errors to the API contract', async (ErrorClass, code) => {
		const endpoint = new ExchangeEndpoint({ exchange: vi.fn().mockRejectedValue(new ErrorClass()) } as never);
		await expect(endpoint.exec({ requestId: '75922ac6-4381-4548-bbcb-0b19da426ea3' }, { id: 'user' } as never, null)).rejects.toMatchObject({ code });
	});
	test('restricts card grants to administrators and validates their amount', async () => {
		expect(grantCardsMeta).toMatchObject({ requireCredential: true, requireAdmin: true, kind: 'write:admin:account' });
		const grantCards = vi.fn();
		const endpoint = new GrantCardsEndpoint({ grantCards } as never);
		for (const amount of [0, -1, 1.5, 10001]) {
			await expect(endpoint.exec({ userId: '9i7a2pgm1b', amount }, { id: 'admin' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		expect(grantCards).not.toHaveBeenCalled();
	});

	test.each([
		[CheckinService.InvalidDateError, 'INVALID_CHECKIN_DATE'],
		[CheckinService.NoMakeupCardsError, 'NO_MAKEUP_CARDS'],
		[CheckinService.NotAllowedError, 'CHECKIN_NOT_ALLOWED'],
	] as const)('maps makeup errors to the API contract', async (ErrorClass, code) => {
		const endpoint = new MakeupEndpoint({ makeup: vi.fn().mockRejectedValue(new ErrorClass()) } as never);
		await expect(endpoint.exec({ date: '2026-09-27' }, { id: 'user' } as never, null)).rejects.toMatchObject({ code });
	});

	test.each([
		[CheckinService.NoSuchUserError, 'NO_SUCH_USER'],
		[CheckinService.CardLimitError, 'CARD_LIMIT_EXCEEDED'],
		[CheckinService.NotAllowedError, 'CHECKIN_NOT_ALLOWED'],
	] as const)('maps card grant errors to the API contract', async (ErrorClass, code) => {
		const endpoint = new GrantCardsEndpoint({ grantCards: vi.fn().mockRejectedValue(new ErrorClass()) } as never);
		await expect(endpoint.exec({ userId: '9i7a2pgm1b', amount: 1 }, { id: 'admin' } as never, null)).rejects.toMatchObject({ code });
	});
	test.each(CHECKIN_ACHIEVEMENT_TYPES)('blocks client claims for %s', async name => {
		const create = vi.fn();
		const endpoint = new ClaimEndpoint({ create } as never);
		await expect(endpoint.exec({ name }, { id: 'user' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(create).not.toHaveBeenCalled();
	});

	test('keeps existing client achievements available', async () => {
		const create = vi.fn();
		await new ClaimEndpoint({ create } as never).exec({ name: 'login7' }, { id: 'user' } as never, null);
		expect(create).toHaveBeenCalledWith('user', 'login7');
	});

	test.each(['2026-00', '2026-13', '0000-01', '9999-12', '2026-1'])('rejects invalid calendar month %s', async month => {
		const endpoint = new StatusEndpoint({ getStatus: vi.fn() } as never);
		await expect(endpoint.exec({ month }, { id: 'user' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	});

	test('maps check-in eligibility errors and rejects ranking pagination outside the public cap', async () => {
		const endpoint = new CheckinEndpoint({ checkin: vi.fn().mockRejectedValue(new CheckinService.NotAllowedError()) } as never);
		await expect(endpoint.exec({}, { id: 'user' } as never, null)).rejects.toMatchObject({ code: 'CHECKIN_NOT_ALLOWED' });
		const ranking = new RankingEndpoint({ ranking: vi.fn() } as never);
		await expect(ranking.exec({ offset: 100 }, null, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		await expect(ranking.exec({ limit: 51 }, null, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	});

	test('emits the achievement notification only when the atomic append added a row', async () => {
		const query = { update: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), setParameters: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 }) };
		const notification = { createNotification: vi.fn() };
		const service = new AchievementService({ createQueryBuilder: () => query } as never, notification as never);
		expect(await service.create('user', 'checkin1')).toBe(true);
		expect(await service.create('user', 'checkin1')).toBe(false);
		expect(notification.createNotification).toHaveBeenCalledExactlyOnceWith('user', 'achievementEarned', { achievement: 'checkin1' });
	});
});

describe('benefit redemption endpoint contracts', () => {
	test('separates administrator code management from personal redemption permissions', () => {
		for (const meta of [createCodeMeta, updateCodeMeta]) {
			expect(meta).toMatchObject({ requireCredential: true, requireAdmin: true, kind: 'write:admin:account' });
		}
		for (const meta of [listCodesMeta, codeClaimsMeta]) {
			expect(meta).toMatchObject({ requireCredential: true, requireAdmin: true, kind: 'read:admin:show-user' });
		}
		expect(redeemMeta).toMatchObject({ requireCredential: true, prohibitMoved: true, kind: 'write:account' });
	});

	test('rejects invalid card amounts, quotas and expiration dates before creating a code', async () => {
		const create = vi.fn();
		const endpoint = new CreateCodeEndpoint({ create } as never);
		const valid = { name: 'Holiday', amount: 2, maxRedemptions: 10 };
		for (const invalid of [{ name: '' }, { amount: 0 }, { amount: 10001 }, { amount: 1.5 }, { maxRedemptions: 0 }, { maxRedemptions: 1000001 }, { expiresAt: 'invalid' }]) {
			await expect(endpoint.exec({ ...valid, ...invalid }, { id: 'admin' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		expect(create).not.toHaveBeenCalled();
	});

	test.each([undefined, null, '2027-01-01T00:00:00.000Z', '2027-01-01T08:00:00+08:00'])('accepts supported expiration settings: %s', async expiresAt => {
		const create = vi.fn().mockResolvedValue({ id: 'code' });
		const params = { name: 'Holiday', amount: 2, maxRedemptions: 10, expiresAt };
		const me = { id: 'admin' };
		await new CreateCodeEndpoint({ create } as never).exec(params, me as never, null);
		expect(create).toHaveBeenCalledExactlyOnceWith(params, me);
	});

	test('rejects malformed codes and redeems only for the authenticated user', async () => {
		const redeem = vi.fn().mockResolvedValue({ newlyRedeemed: true, amount: 2, makeupCards: 2, points: 0 });
		const endpoint = new RedeemEndpoint({ redeem } as never);
		for (const code of ['', 'a'.repeat(31), 'a'.repeat(33), 'g'.repeat(32)]) {
			await expect(endpoint.exec({ code }, { id: 'me' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		expect(redeem).not.toHaveBeenCalled();
		await endpoint.exec({ code: 'A'.repeat(32), userId: 'other' }, { id: 'me' } as never, null);
		expect(redeem).toHaveBeenCalledExactlyOnceWith('me', 'A'.repeat(32));
	});

	test.each([
		[CheckinRedemptionService.NoSuchCodeError, 'NO_SUCH_REDEMPTION_CODE'],
		[CheckinRedemptionService.DisabledCodeError, 'REDEMPTION_CODE_DISABLED'],
		[CheckinRedemptionService.ExpiredCodeError, 'REDEMPTION_CODE_EXPIRED'],
		[CheckinRedemptionService.ExhaustedCodeError, 'REDEMPTION_CODE_EXHAUSTED'],
		[CheckinService.NotAllowedError, 'CHECKIN_NOT_ALLOWED'],
		[CheckinService.CardLimitError, 'CARD_LIMIT_EXCEEDED'],
	] as const)('maps redemption failures to the user-visible API contract', async (ErrorClass, code) => {
		const endpoint = new RedeemEndpoint({ redeem: vi.fn().mockRejectedValue(new ErrorClass()) } as never);
		await expect(endpoint.exec({ code: 'a'.repeat(32) }, { id: 'me' } as never, null)).rejects.toMatchObject({ code });
	});

	test('maps invalid configuration and missing codes to administrator API errors', async () => {
		const create = new CreateCodeEndpoint({ create: vi.fn().mockRejectedValue(new CheckinRedemptionService.InvalidConfigurationError()) } as never);
		await expect(create.exec({ name: ' ', amount: 1, maxRedemptions: 1 }, { id: 'admin' } as never, null)).rejects.toMatchObject({ code: 'INVALID_REDEMPTION_CONFIGURATION' });
		const update = new UpdateCodeEndpoint({ update: vi.fn().mockRejectedValue(new CheckinRedemptionService.NoSuchCodeError()) } as never);
		await expect(update.exec({ id: '9i7a2pgm1b', enabled: false }, { id: 'admin' } as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_REDEMPTION_CODE' });
	});

	test('validates administrator pagination and claim identifiers before querying', async () => {
		const list = vi.fn();
		const claims = vi.fn();
		const listEndpoint = new ListCodesEndpoint({ list } as never);
		const claimsEndpoint = new CodeClaimsEndpoint({ claims } as never);
		for (const params of [{ offset: -1 }, { offset: 100001 }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }]) {
			await expect(listEndpoint.exec(params, { id: 'admin' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
			await expect(claimsEndpoint.exec({ codeId: '9i7a2pgm1b', ...params }, { id: 'admin' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		await expect(claimsEndpoint.exec({ codeId: 'bad-id!' }, { id: 'admin' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(list).not.toHaveBeenCalled();
		expect(claims).not.toHaveBeenCalled();
	});
});
