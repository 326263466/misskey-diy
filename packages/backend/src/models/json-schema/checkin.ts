/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CHECKIN_ACHIEVEMENT_TYPES } from '@/models/UserProfile.js';

export const checkinStatusSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		timeZone: { type: 'string', optional: false, nullable: false },
		today: { type: 'string', optional: false, nullable: false },
		month: { type: 'string', optional: false, nullable: false },
		checkedInToday: { type: 'boolean', optional: false, nullable: false },
		totalDays: { type: 'integer', optional: false, nullable: false },
		consecutiveDays: { type: 'integer', optional: false, nullable: false },
		monthlyDays: { type: 'integer', optional: false, nullable: false },
		lastCheckinDate: { type: 'string', optional: false, nullable: true },
		checkedInDates: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
		makeupDates: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
		registeredDate: { type: 'string', optional: false, nullable: false },
		points: { type: 'integer', optional: false, nullable: false },
		makeupCards: { type: 'integer', optional: false, nullable: false },
		makeupCardProgress: { type: 'integer', optional: false, nullable: false },
		makeupCardTarget: { type: 'integer', optional: false, nullable: false },
		makeupCardFirstRewardClaimed: { type: 'boolean', optional: false, nullable: false },
		rewardDates: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
		makeupCardExchangeCost: { type: 'integer', optional: false, nullable: false },
		makeupEarliestDate: { type: 'string', optional: false, nullable: false },
		makeupCardLimit: { type: 'integer', optional: false, nullable: false },
		makeupCardExchangeAvailable: { type: 'boolean', optional: false, nullable: false },
		achievements: {
			type: 'array', optional: false, nullable: false,
			items: {
				type: 'object', optional: false, nullable: false,
				properties: {
					name: { type: 'string', enum: CHECKIN_ACHIEVEMENT_TYPES, optional: false, nullable: false },
					unlockedAt: { type: 'number', optional: false, nullable: false },
				},
			},
		},
	},
} as const;

export const checkinResultSchema = {
	...checkinStatusSchema,
	properties: {
		...checkinStatusSchema.properties,
		newlyCheckedIn: { type: 'boolean', optional: false, nullable: false },
		earnedAchievements: { type: 'array', optional: false, nullable: false, items: { type: 'string', enum: CHECKIN_ACHIEVEMENT_TYPES, optional: false, nullable: false } },
		earnedPoints: { type: 'integer', optional: false, nullable: false },
		earnedMakeupCards: { type: 'integer', optional: false, nullable: false },
	},
} as const;
