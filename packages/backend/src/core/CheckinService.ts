/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, LessThanOrEqual, MoreThan, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { MiUserCheckin } from '@/models/UserCheckin.js';
import { MiUserCheckinExchange } from '@/models/UserCheckinExchange.js';
import { MiUserCheckinCardBatch } from '@/models/UserCheckinCardBatch.js';
import type { UserCheckinsRepository, UserProfilesRepository } from '@/models/_.js';
import { CHECKIN_ACHIEVEMENT_TYPES, MiUserProfile } from '@/models/UserProfile.js';
import { AchievementService } from '@/core/AchievementService.js';
import { IdService } from '@/core/IdService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';

export const CHECKIN_TIME_ZONE = 'Asia/Shanghai';
export const CHECKIN_MAKEUP_CARD_TARGET = 7;
export const CHECKIN_MAKEUP_CARD_EXCHANGE_COST = 7;
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: CHECKIN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export function checkinDate(now: Date): string {
	const parts = dateFormatter.formatToParts(now);
	const get = (type: string): string => parts.find(part => part.type === type)!.value;
	return `${get('year')}-${get('month')}-${get('day')}`;
}

export function previousCheckinDate(date: string): string {
	return new Date(new Date(`${date}T00:00:00.000Z`).getTime() - 86400000).toISOString().slice(0, 10);
}

export function isValidCheckinDate(date: string): boolean {
	if (!/^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(date)) return false;
	const parsed = new Date(`${date}T00:00:00.000Z`);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function nextMonth(month: string): string {
	const date = new Date(`${month}-01T00:00:00.000Z`);
	date.setUTCMonth(date.getUTCMonth() + 1);
	return date.toISOString().slice(0, 10);
}

export function checkinAchievements(total: number, streak: number): (typeof CHECKIN_ACHIEVEMENT_TYPES)[number][] {
	const achievements: (typeof CHECKIN_ACHIEVEMENT_TYPES)[number][] = [];
	if (total >= 1) achievements.push('checkin1');
	if (streak >= 7) achievements.push('checkinStreak7');
	if (streak >= 30) achievements.push('checkinStreak30');
	if (total >= 30) achievements.push('checkinTotal30');
	if (total >= 100) achievements.push('checkinTotal100');
	if (total >= 365) achievements.push('checkinTotal365');
	return achievements;
}

export type CheckinStatus = {
	timeZone: string;
	today: string;
	month: string;
	checkedInToday: boolean;
	totalDays: number;
	consecutiveDays: number;
	monthlyDays: number;
	lastCheckinDate: string | null;
	checkedInDates: string[];
	makeupDates: string[];
	registeredDate: string;
	points: number;
	makeupCards: number;
	makeupCardProgress: number;
	makeupCardTarget: number;
	makeupCardExchangeCost: number;
	achievements: { name: typeof CHECKIN_ACHIEVEMENT_TYPES[number]; unlockedAt: number }[];
};

type CheckinResult = CheckinStatus & {
	newlyCheckedIn: boolean;
	earnedAchievements: typeof CHECKIN_ACHIEVEMENT_TYPES[number][];
	earnedPoints: number;
	earnedMakeupCards: number;
};

@Injectable()
export class CheckinService {
	public static NotAllowedError = class extends Error {};
	public static InvalidDateError = class extends Error {};
	public static NoMakeupCardsError = class extends Error {};
	public static NoSuchUserError = class extends Error {};
	public static CardLimitError = class extends Error {};
	public static InsufficientPointsError = class extends Error {};
	public static NoSuchCardBatchError = class extends Error {};
	public static CardBatchNotRevokableError = class extends Error {};

	constructor(
		@Inject(DI.db) private db: DataSource,
		@Inject(DI.userCheckinsRepository) private userCheckinsRepository: UserCheckinsRepository,
		@Inject(DI.userProfilesRepository) private userProfilesRepository: UserProfilesRepository,
		private achievementService: AchievementService,
		private userEntityService: UserEntityService,
		private idService: IdService,
		private moderationLogService: ModerationLogService,
	) {
	}

	@bindThis
	public async getStatus(userId: string, month?: string, now = new Date()): Promise<CheckinStatus> {
		const today = checkinDate(now);
		const requestedMonth = month ?? today.slice(0, 7);
		const [latest, dates, profile, actualDays] = await Promise.all([
			this.userCheckinsRepository.findOne({ where: { userId, date: LessThanOrEqual(today) }, order: { date: 'DESC' } }),
			this.userCheckinsRepository.createQueryBuilder('checkin').select(['checkin.date', 'checkin.isMakeup'])
				.where('checkin.userId = :userId', { userId })
				.andWhere('checkin.date >= :start AND checkin.date < :end', { start: `${requestedMonth}-01`, end: nextMonth(requestedMonth) })
				.orderBy('checkin.date', 'ASC').getMany(),
			this.userProfilesRepository.findOneByOrFail({ userId }),
			this.userCheckinsRepository.countBy({ userId, isMakeup: false }),
		]);
		return {
			timeZone: CHECKIN_TIME_ZONE,
			today,
			month: requestedMonth,
			checkedInToday: latest?.date === today,
			totalDays: latest?.totalDays ?? 0,
			consecutiveDays: latest && latest.date >= previousCheckinDate(today) ? latest.consecutiveDays : 0,
			monthlyDays: dates.length,
			lastCheckinDate: latest?.date ?? null,
			checkedInDates: dates.map(record => record.date),
			makeupDates: dates.filter(record => record.isMakeup).map(record => record.date),
			registeredDate: checkinDate(this.idService.parse(userId).date),
			points: profile.checkinPoints,
			makeupCards: profile.checkinMakeupCards,
			makeupCardProgress: actualDays % CHECKIN_MAKEUP_CARD_TARGET,
			makeupCardTarget: CHECKIN_MAKEUP_CARD_TARGET,
			makeupCardExchangeCost: CHECKIN_MAKEUP_CARD_EXCHANGE_COST,
			achievements: profile.achievements.filter((achievement): achievement is CheckinStatus['achievements'][number] => (CHECKIN_ACHIEVEMENT_TYPES as readonly string[]).includes(achievement.name)),
		};
	}

	@bindThis
	public async checkin(userId: string): Promise<CheckinResult> {
		const result = await this.db.transaction(async manager => {
			// Lock an existing row before looking for today's record, including the first check-in.
			await this.lockEligibleUser(manager, userId);
			const now = new Date();
			const today = checkinDate(now);
			const latest = await manager.findOne(MiUserCheckin, { where: { userId }, order: { date: 'DESC' } });
			if (latest?.date === today) return { newlyCheckedIn: false, earnedMakeupCards: 0, now };
			const record = manager.create(MiUserCheckin, {
				userId, date: today, createdAt: now, isMakeup: false,
				totalDays: (latest?.totalDays ?? 0) + 1,
				consecutiveDays: latest?.date === previousCheckinDate(today) ? latest.consecutiveDays + 1 : 1,
			});
			await manager.insert(MiUserCheckin, record);
			await manager.increment(MiUserProfile, { userId }, 'checkinPoints', 1);
			const actualDays = await manager.countBy(MiUserCheckin, { userId, isMakeup: false });
			const earnedMakeupCards = actualDays % CHECKIN_MAKEUP_CARD_TARGET === 0 ? 1 : 0;
			if (earnedMakeupCards) {
				const profile = await manager.findOneByOrFail(MiUserProfile, { userId });
				if (profile.checkinMakeupCards >= 2147483647) throw new CheckinService.CardLimitError();
				await this.ensureOpeningBatch(manager, userId, profile.checkinMakeupCards);
				await manager.increment(MiUserProfile, { userId }, 'checkinMakeupCards', earnedMakeupCards);
				await this.createCardBatch(manager, userId, 'reward', earnedMakeupCards, now);
			}
			return { newlyCheckedIn: true, earnedMakeupCards, now };
		});
		return this.completeCheckin(userId, result.newlyCheckedIn, result.now, undefined, result.earnedMakeupCards);
	}

	@bindThis
	public async makeup(userId: string, date: string): Promise<CheckinResult> {
		if (!isValidCheckinDate(date)) throw new CheckinService.InvalidDateError();
		const result = await this.db.transaction(async manager => {
			await this.lockEligibleUser(manager, userId);
			const now = new Date();
			if (date < checkinDate(this.idService.parse(userId).date) || date >= checkinDate(now)) throw new CheckinService.InvalidDateError();
			if (await manager.findOneBy(MiUserCheckin, { userId, date })) return { newlyCheckedIn: false, now };
			const profile = await manager.findOneByOrFail(MiUserProfile, { userId });
			if (profile.checkinMakeupCards < 1) throw new CheckinService.NoMakeupCardsError();
			await this.ensureOpeningBatch(manager, userId, profile.checkinMakeupCards);
			const batch = await manager.findOne(MiUserCheckinCardBatch, { where: { userId, remaining: MoreThan(0) }, order: { createdAt: 'ASC', id: 'ASC' } });
			if (!batch) throw new Error('Check-in card balance has no corresponding batch.');
			await manager.update(MiUserCheckinCardBatch, { id: batch.id }, { remaining: batch.remaining - 1, used: batch.used + 1 });
			await manager.insert(MiUserCheckin, { userId, date, createdAt: now, isMakeup: true, totalDays: 0, consecutiveDays: 0, cardBatchId: batch.id });
			await manager.decrement(MiUserProfile, { userId }, 'checkinMakeupCards', 1);
			await manager.increment(MiUserProfile, { userId }, 'checkinPoints', 1);
			// Inserting an older day changes cumulative totals and can join two streaks.
			// Recompute every stored snapshot together while the user's write lock is held.
			await manager.query(`
				WITH ordered AS (
					SELECT date, ROW_NUMBER() OVER (ORDER BY date)::integer AS total,
						date - ROW_NUMBER() OVER (ORDER BY date)::integer AS streak_group
					FROM "user_checkin" WHERE "userId" = $1
				), corrected AS (
					SELECT date, total, ROW_NUMBER() OVER (PARTITION BY streak_group ORDER BY date)::integer AS streak
					FROM ordered
				)
				UPDATE "user_checkin" c SET "totalDays" = corrected.total, "consecutiveDays" = corrected.streak
				FROM corrected WHERE c."userId" = $1 AND c.date = corrected.date
			`, [userId]);
			return { newlyCheckedIn: true, now };
		});
		return this.completeCheckin(userId, result.newlyCheckedIn, result.now, date.slice(0, 7));
	}

	@bindThis
	public async exchange(userId: string, requestId: string): Promise<{ points: number; makeupCards: number; exchanged: boolean }> {
		return this.db.transaction(async manager => {
			await this.lockEligibleUser(manager, userId);
			const profile = await manager.findOneByOrFail(MiUserProfile, { userId });
			if (await manager.findOneBy(MiUserCheckinExchange, { userId, requestId })) {
				return { points: profile.checkinPoints, makeupCards: profile.checkinMakeupCards, exchanged: false };
			}
			if (profile.checkinPoints < CHECKIN_MAKEUP_CARD_EXCHANGE_COST) throw new CheckinService.InsufficientPointsError();
			if (profile.checkinMakeupCards >= 2147483647) throw new CheckinService.CardLimitError();
			await this.ensureOpeningBatch(manager, userId, profile.checkinMakeupCards);
			await manager.decrement(MiUserProfile, { userId }, 'checkinPoints', CHECKIN_MAKEUP_CARD_EXCHANGE_COST);
			await manager.increment(MiUserProfile, { userId }, 'checkinMakeupCards', 1);
			await manager.insert(MiUserCheckinExchange, { userId, requestId, createdAt: new Date(), pointsSpent: CHECKIN_MAKEUP_CARD_EXCHANGE_COST, cardsGranted: 1 });
			await this.createCardBatch(manager, userId, 'exchange', 1);
			return { points: profile.checkinPoints - CHECKIN_MAKEUP_CARD_EXCHANGE_COST, makeupCards: profile.checkinMakeupCards + 1, exchanged: true };
		});
	}

	@bindThis
	public async grantCards(userId: string, amount: number, administrator: { id: string }): Promise<{ makeupCards: number }> {
		if (!Number.isInteger(amount) || amount < 1 || amount > 10000) throw new CheckinService.CardLimitError();
		return this.db.transaction(async manager => {
			const user = await manager.findOne(MiUser, { where: { id: userId }, lock: { mode: 'for_no_key_update' } });
			if (!user) throw new CheckinService.NoSuchUserError();
			if (user.host !== null || user.isSuspended || user.isDeleted || user.movedToUri || user.username.includes('.')) throw new CheckinService.NotAllowedError();
			const profile = await manager.findOneByOrFail(MiUserProfile, { userId });
			const makeupCards = profile.checkinMakeupCards + amount;
			if (makeupCards > 2147483647) throw new CheckinService.CardLimitError();
			await this.ensureOpeningBatch(manager, userId, profile.checkinMakeupCards);
			const grantLogId = this.idService.gen();
			await manager.update(MiUserProfile, { userId }, { checkinMakeupCards: makeupCards });
			await this.moderationLogService.log(administrator, 'grantCheckinCards', {
				userId, userUsername: user.username, userHost: user.host, amount,
				before: profile.checkinMakeupCards, after: makeupCards,
			}, manager, grantLogId);
			await this.createCardBatch(manager, userId, 'admin', amount, new Date(), grantLogId, administrator.id);
			return { makeupCards };
		});
	}

	@bindThis
	public async revokeCards(batchId: string, administrator: { id: string }): Promise<{ batchId: string; revokedCards: number; makeupCards: number }> {
		return this.db.transaction(async manager => {
			const initial = await manager.findOneBy(MiUserCheckinCardBatch, { id: batchId });
			if (!initial) throw new CheckinService.NoSuchCardBatchError();
			// Match all earning/spending paths' lock order. Administrators can also reclaim cards from suspended accounts.
			const user = await manager.findOne(MiUser, { where: { id: initial.userId }, lock: { mode: 'for_no_key_update' } });
			if (!user) throw new CheckinService.NoSuchCardBatchError();
			const batch = await manager.findOneByOrFail(MiUserCheckinCardBatch, { id: batchId });
			if (batch.source !== 'admin') throw new CheckinService.CardBatchNotRevokableError();
			const profile = await manager.findOneByOrFail(MiUserProfile, { userId: user.id });
			const revokedCards = batch.remaining;
			if (revokedCards === 0) return { batchId, revokedCards: 0, makeupCards: profile.checkinMakeupCards };
			if (profile.checkinMakeupCards < revokedCards) throw new Error('Check-in card batch exceeds the available balance.');
			const makeupCards = profile.checkinMakeupCards - revokedCards;
			await manager.update(MiUserCheckinCardBatch, { id: batchId }, { remaining: 0, revoked: batch.revoked + revokedCards });
			await manager.update(MiUserProfile, { userId: user.id }, { checkinMakeupCards: makeupCards });
			await this.moderationLogService.log(administrator, 'revokeCheckinCards', {
				userId: user.id, userUsername: user.username, userHost: user.host, batchId,
				amount: revokedCards, before: profile.checkinMakeupCards, after: makeupCards,
			}, manager);
			return { batchId, revokedCards, makeupCards };
		});
	}

	public async creditRedemptionCards(manager: EntityManager, userId: string, amount: number, now: Date): Promise<{ batchId: string; makeupCards: number; points: number }> {
		// The redemption transaction holds the same user row lock as check-in, makeup and reclaim.
		const profile = await manager.findOneByOrFail(MiUserProfile, { userId });
		const makeupCards = profile.checkinMakeupCards + amount;
		if (makeupCards > 2147483647) throw new CheckinService.CardLimitError();
		await this.ensureOpeningBatch(manager, userId, profile.checkinMakeupCards);
		await manager.update(MiUserProfile, { userId }, { checkinMakeupCards: makeupCards });
		const batchId = await this.createCardBatch(manager, userId, 'redemption', amount, now);
		return { batchId, makeupCards, points: profile.checkinPoints };
	}

	private async createCardBatch(manager: EntityManager, userId: string, source: MiUserCheckinCardBatch['source'], amount: number, now = new Date(), grantLogId: string | null = null, adminId: string | null = null): Promise<string> {
		const batchId = this.idService.gen();
		await manager.insert(MiUserCheckinCardBatch, {
			id: batchId, userId, source, createdAt: now, amount, remaining: amount, used: 0, revoked: 0, grantLogId, adminId,
		});
		return batchId;
	}

	private async ensureOpeningBatch(manager: EntityManager, userId: string, balance: number): Promise<void> {
		// Preserve unattributed balances from legacy imports. Never invent attribution to an old administrator grant.
		if (balance > 0 && !await manager.existsBy(MiUserCheckinCardBatch, { userId })) {
			await this.createCardBatch(manager, userId, 'legacy', balance);
		}
	}

	private async lockEligibleUser(manager: EntityManager, userId: string): Promise<void> {
		// Serialize this user's balance changes without blocking audit-log foreign keys
		// when administrators concurrently grant cards to one another.
		const user = await manager.findOne(MiUser, { where: { id: userId }, lock: { mode: 'for_no_key_update' } });
		if (!user || user.host !== null || user.isSuspended || user.isDeleted || user.movedToUri || user.username.includes('.')) throw new CheckinService.NotAllowedError();
	}

	private async completeCheckin(userId: string, newlyCheckedIn: boolean, now: Date, month?: string, earnedMakeupCards = 0): Promise<CheckinResult> {
		// Repeat requests can repair a missed award after an interrupted response without adding another day.
		const historical = await this.userCheckinsRepository.createQueryBuilder('checkin')
			.select('MAX(checkin.consecutiveDays)', 'streak').addSelect('MAX(checkin.totalDays)', 'total')
			.where('checkin.userId = :userId', { userId }).getRawOne<{ streak: number | null; total: number | null }>();
		const earnedAchievements: typeof CHECKIN_ACHIEVEMENT_TYPES[number][] = [];
		for (const achievement of checkinAchievements(historical?.total ?? 0, historical?.streak ?? 0)) {
			if (await this.achievementService.create(userId, achievement)) earnedAchievements.push(achievement);
		}
		return { ...await this.getStatus(userId, month, now), newlyCheckedIn, earnedAchievements, earnedPoints: newlyCheckedIn ? 1 : 0, earnedMakeupCards };
	}

	@bindThis
	public async ranking(type: 'consecutive' | 'total' | 'monthly', offset: number, limit: number, me: MiUser | null, now = new Date()) {
		const today = checkinDate(now);
		const month = today.slice(0, 7);
		const scores = type === 'monthly'
			? `SELECT "userId", COUNT(*)::integer AS days FROM "user_checkin" WHERE date >= $1::date AND date <= $2::date GROUP BY "userId"`
			: `SELECT DISTINCT ON ("userId") "userId", "${type === 'consecutive' ? 'consecutiveDays' : 'totalDays'}" AS days FROM "user_checkin" WHERE date >= $1::date AND date <= $2::date ORDER BY "userId", date DESC`;
		const rows = await this.db.query<{ userId: string; days: number; rank: number; position: number }[]>(`
			WITH scores AS (${scores}), ranked AS (
				SELECT scores."userId", scores.days,
					RANK() OVER (ORDER BY scores.days DESC)::integer AS rank,
					ROW_NUMBER() OVER (ORDER BY scores.days DESC, scores."userId" ASC)::integer AS position
				FROM scores INNER JOIN "user" u ON u.id = scores."userId"
				WHERE scores.days > 0 AND u.host IS NULL AND u."isSuspended" = FALSE
					AND u."isDeleted" = FALSE AND u."isExplorable" = TRUE AND u."movedToUri" IS NULL
			)
			SELECT * FROM ranked WHERE (position > $3 AND position <= $4) OR "userId" = $5 ORDER BY position ASC
		`, [type === 'monthly' ? `${month}-01` : type === 'consecutive' ? previousCheckinDate(today) : '0001-01-01', today, offset, Math.min(offset + limit, 100), me?.id ?? null]);
		const entries = rows.filter(row => row.position > offset && row.position <= Math.min(offset + limit, 100));
		const users = await this.userEntityService.packMany(entries.map(row => row.userId), me, { schema: 'UserDetailedNotMe' });
		const own = rows.find(row => row.userId === me?.id);
		return {
			timeZone: CHECKIN_TIME_ZONE, today, month, type,
			items: entries.map(row => ({ rank: row.rank, days: row.days, user: users.find(user => user.id === row.userId)! })),
			myRank: own ? { rank: own.rank, days: own.days } : null,
		};
	}
}
