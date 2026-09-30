/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('user_checkin_card_batch')
@Index('IDX_checkin_card_batch_user_created', ['userId', 'createdAt', 'id'])
@Check('CHK_checkin_card_batch_balance', 'amount > 0 AND remaining >= 0 AND used >= 0 AND revoked >= 0 AND amount = remaining + used + revoked')
export class MiUserCheckinCardBatch {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_checkin_card_batch' })
	public id: string;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_checkin_card_batch_user' })
	public user: MiUser | null;

	@Column('varchar', { length: 16 })
	public source: 'admin' | 'exchange' | 'reward' | 'legacy' | 'redemption';

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('integer')
	public amount: number;

	@Column('integer')
	public remaining: number;

	@Column('integer', { default: 0 })
	public used: number;

	@Column('integer', { default: 0 })
	public revoked: number;

	@Index('IDX_checkin_card_batch_grant_log', { unique: true })
	@Column({ ...id(), nullable: true })
	public grantLogId: string | null;

	@Column({ ...id(), nullable: true })
	public adminId: MiUser['id'] | null;
}
