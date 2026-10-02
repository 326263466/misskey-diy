/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('wallet')
@Check('CHK_wallet_balance', '"balance" >= 0 AND "reservedBalance" >= 0 AND "balance"::bigint + "reservedBalance"::bigint <= 2000000000')
export class MiWallet {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_wallet' })
	public userId: MiUser['id'];

	@OneToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_wallet_user' })
	public user: MiUser | null;

	@Column('integer', { default: 0 })
	public balance: number;

	@Column('integer', { default: 0 })
	public reservedBalance: number;
}
