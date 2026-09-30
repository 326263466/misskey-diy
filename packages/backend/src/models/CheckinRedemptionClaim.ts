/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiCheckinRedemptionCode } from './CheckinRedemptionCode.js';

@Entity('checkin_redemption_claim')
@Index('IDX_checkin_redemption_claim_user_code', ['userId', 'codeId'], { unique: true })
@Index('IDX_checkin_redemption_claim_code_created', ['codeId', 'createdAt', 'id'])
export class MiCheckinRedemptionClaim {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_checkin_redemption_claim' })
	public id: string;

	@Column(id())
	public userId: string;

	@Column(id())
	public codeId: string;

	@ManyToOne(() => MiCheckinRedemptionCode, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_checkin_redemption_claim_code' })
	public code: MiCheckinRedemptionCode | null;

	@Column(id())
	public batchId: string;

	@Column('integer')
	public amount: number;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
