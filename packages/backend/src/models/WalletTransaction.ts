/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export const WALLET_TRANSACTION_TYPES = ['exchange', 'adminAdjustment', 'redPacketSend', 'redPacketClaim', 'redPacketRefund'] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

@Entity('wallet_transaction')
@Index('IDX_wallet_transaction_user_id', ['userId', 'id'])
@Index('IDX_wallet_transaction_user_request', ['userId', 'requestId'], { unique: true })
@Check('CHK_wallet_transaction_amount', '"amount" <> 0 AND "amount" >= -2000000000 AND "amount" <= 2000000000')
@Check('CHK_wallet_transaction_balance', '"balance" >= 0 AND "balance" <= 2000000000')
export class MiWalletTransaction {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_wallet_transaction' })
	public id: string;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_wallet_transaction_user' })
	public user: MiUser | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('varchar', { length: 32 })
	public type: WalletTransactionType;

	@Column('integer')
	public amount: number;

	@Column('integer')
	public balance: number;

	@Column('varchar', { length: 500, nullable: true })
	public description: string | null;

	@Column({ ...id(), nullable: true })
	public relatedId: string | null;

	@Column('uuid', { nullable: true })
	public requestId: string | null;

	@Column('integer', { nullable: true })
	public pointsSpent: number | null;

	@Column({ ...id(), nullable: true })
	public actorId: string | null;
}
