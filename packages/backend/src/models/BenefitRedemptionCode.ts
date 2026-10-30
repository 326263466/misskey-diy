/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

export const BENEFIT_REWARD_TYPES = ['makeupCards', 'points'] as const;
export type BenefitRewardType = (typeof BENEFIT_REWARD_TYPES)[number];

@Entity('benefit_redemption_code')
@Check('CHK_benefit_redemption_code_limits', 'amount > 0 AND "maxRedemptions" > 0 AND redemptions >= 0 AND redemptions <= "maxRedemptions"')
@Check('CHK_benefit_redemption_code_reward', '"rewardType" IN (\'makeupCards\', \'points\')')
export class MiBenefitRedemptionCode {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_benefit_redemption_code' })
	public id: string;

	@Index('IDX_benefit_redemption_code_code', { unique: true })
	@Column('varchar', { length: 32 })
	public code: string;

	@Column('varchar', { length: 100 })
	public name: string;

	@Column('varchar', { length: 16 })
	public rewardType: BenefitRewardType;

	@Column('integer')
	public amount: number;

	@Column('integer')
	public maxRedemptions: number;

	@Column('integer', { default: 0 })
	public redemptions: number;

	@Column('timestamp with time zone', { nullable: true })
	public expiresAt: Date | null;

	@Column('boolean', { default: true })
	public enabled: boolean;

	@Column('timestamp with time zone', { nullable: true })
	public deletedAt: Date | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column(id())
	public createdBy: string;
}
