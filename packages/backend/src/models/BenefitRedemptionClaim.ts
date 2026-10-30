/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiBenefitRedemptionCode, type BenefitRewardType } from './BenefitRedemptionCode.js';

@Entity('benefit_redemption_claim')
@Index('IDX_benefit_redemption_claim_user_code', ['userId', 'codeId'], { unique: true })
@Index('IDX_benefit_redemption_claim_code_created', ['codeId', 'createdAt', 'id'])
@Index('IDX_benefit_redemption_claim_user_created', ['userId', 'createdAt', 'id'])
@Check('CHK_benefit_redemption_claim_reward', 'amount > 0 AND (("rewardType" = \'makeupCards\' AND "batchId" IS NOT NULL) OR ("rewardType" = \'points\' AND "batchId" IS NULL))')
export class MiBenefitRedemptionClaim {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_benefit_redemption_claim' })
	public id: string;

	@Column(id())
	public userId: string;

	@Column(id())
	public codeId: string;

	@ManyToOne(() => MiBenefitRedemptionCode, { onDelete: 'CASCADE', nullable: false })
	@JoinColumn({ foreignKeyConstraintName: 'FK_benefit_redemption_claim_code' })
	public code: MiBenefitRedemptionCode;

	@Column({ ...id(), nullable: true })
	public batchId: string | null;

	@Column('varchar', { length: 16 })
	public rewardType: BenefitRewardType;

	@Column('integer')
	public amount: number;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
