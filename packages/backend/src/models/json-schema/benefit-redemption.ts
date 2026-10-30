/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CONTENT_LIMITS } from 'misskey-js';
import { BENEFIT_REWARD_TYPES } from '@/models/BenefitRedemptionCode.js';

export const benefitRedemptionCodeProperties = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: CONTENT_LIMITS.collectionName },
		rewardType: { type: 'string', enum: BENEFIT_REWARD_TYPES },
		amount: { type: 'integer', minimum: 1, maximum: 1000000 },
		maxRedemptions: { type: 'integer', minimum: 1, maximum: 1000000 },
		expiresAt: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$', nullable: true },
	},
} as const;

export const benefitRedemptionCodeCreateParams = {
	...benefitRedemptionCodeProperties,
	required: ['name', 'rewardType', 'amount', 'maxRedemptions'],
} as const;

export const benefitRedemptionCodeUpdateParams = {
	...benefitRedemptionCodeProperties,
	properties: { ...benefitRedemptionCodeProperties.properties, enabled: { type: 'boolean' } },
	required: ['name', 'rewardType', 'amount', 'maxRedemptions', 'enabled'],
} as const;

export const benefitRedemptionCodeSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { type: 'string', optional: false, nullable: false },
		name: { type: 'string', optional: false, nullable: false },
		code: { type: 'string', optional: false, nullable: false },
		rewardType: { type: 'string', enum: BENEFIT_REWARD_TYPES, optional: false, nullable: false },
		amount: { type: 'integer', optional: false, nullable: false },
		maxRedemptions: { type: 'integer', optional: false, nullable: false },
		redemptions: { type: 'integer', optional: false, nullable: false },
		expiresAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		enabled: { type: 'boolean', optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
	},
} as const;
