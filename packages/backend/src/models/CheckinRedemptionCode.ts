/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

@Entity('checkin_redemption_code')
@Check('CHK_checkin_redemption_code_limits', 'amount > 0 AND "maxRedemptions" > 0 AND redemptions >= 0 AND redemptions <= "maxRedemptions"')
export class MiCheckinRedemptionCode {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_checkin_redemption_code' })
	public id: string;

	@Index('IDX_checkin_redemption_code_code', { unique: true })
	@Column('varchar', { length: 32 })
	public code: string;

	@Column('varchar', { length: 100 })
	public name: string;

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

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column(id())
	public createdBy: string;
}
