/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('user_checkin_exchange')
export class MiUserCheckinExchange {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_user_checkin_exchange_user_request' })
	public userId: MiUser['id'];

	@PrimaryColumn('uuid', { primaryKeyConstraintName: 'PK_user_checkin_exchange_user_request' })
	public requestId: string;

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_user_checkin_exchange_user' })
	public user: MiUser | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('integer')
	public pointsSpent: number;

	@Column('integer')
	public cardsGranted: number;
}
