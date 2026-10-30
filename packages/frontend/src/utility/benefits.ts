/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';
import { i18n } from '@/i18n.js';

export type BenefitRewardType = entities.IBenefitsRedeemResponse['rewardType'];

export function benefitRewardName(type: BenefitRewardType): string {
	return { makeupCards: i18n.ts._checkin.makeupCards, points: i18n.ts._checkin.points }[type];
}

export function benefitRewardLabel(type: BenefitRewardType, amount: number): string {
	return i18n.tsx._benefits.rewardSummary({ type: benefitRewardName(type), amount: amount.toLocaleString() });
}
