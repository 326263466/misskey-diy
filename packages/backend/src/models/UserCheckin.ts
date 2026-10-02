/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiUserCheckinCardBatch } from './UserCheckinCardBatch.js';

@Entity('user_checkin')
@Index('IDX_user_checkin_date_user', ['date', 'userId'])
export class MiUserCheckin {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_user_checkin_user_date' })
	public userId: MiUser['id'];

	@PrimaryColumn('date', { primaryKeyConstraintName: 'PK_user_checkin_user_date' })
	public date: string;

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_user_checkin_user' })
	public user: MiUser | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('boolean', { default: false })
	public isMakeup: boolean;

	@Column('boolean', { default: false })
	public rewardConsumed: boolean;

	@Column('integer', { default: 0 })
	public earnedMakeupCards: number;

	@Column({ ...id(), nullable: true })
	public cardBatchId: string | null;

	@ManyToOne(() => MiUserCheckinCardBatch, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_user_checkin_card_batch' })
	public cardBatch: MiUserCheckinCardBatch | null;

	@Column('integer')
	public totalDays: number;

	@Column('integer')
	public consecutiveDays: number;
}
