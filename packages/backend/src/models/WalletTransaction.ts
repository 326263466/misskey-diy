/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { coinColumn } from './util/coin.js';
import { MiUser } from './User.js';

export const WALLET_TRANSACTION_TYPES = [
	'exchange', 'adminAdjustment',
	'redPacketSend', 'redPacketClaim', 'redPacketRefund', 'redPacketReservationRelease',
	'tipSend', 'tipReceive',
	'transferSend', 'transferReceive', 'transferRefund', 'transferReservationRelease',
	'checkinReward', 'checkinMakeupExchange', 'checkinAdminGrant', 'checkinAdminRevoke', 'orderPayment', 'orderIncome', 'pointsOpeningBalance', 'pointsUnification',
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];
export const WALLET_TRANSACTION_CURRENCIES = ['coins', 'points'] as const;
export type WalletTransactionCurrency = (typeof WALLET_TRANSACTION_CURRENCIES)[number];

@Entity('wallet_transaction')
@Index('IDX_wallet_transaction_user_id', ['userId', 'id'])
@Index('IDX_wallet_transaction_user_currency_request', ['userId', 'currency', 'requestId'], { unique: true })
@Check('CHK_wallet_transaction_currency', '"currency" IN (\'coins\', \'points\')')
@Check('CHK_wallet_transaction_amount', '("amount" <> 0 OR "reservedAmount" <> 0) AND "amount" >= -2000000000 AND "amount" <= 2000000000 AND "reservedAmount" >= -2000000000 AND "reservedAmount" <= 2000000000')
@Check('CHK_wallet_transaction_balance', '"balance" >= 0 AND "balance" <= 2000000000 AND "reservedBalance" >= 0 AND "reservedBalance" <= 2000000000 AND "balance" + "reservedBalance" <= 2000000000')
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

	@Column('varchar', { length: 8, default: 'coins' })
	public currency: WalletTransactionCurrency;

	@Column(coinColumn)
	public amount: number;

	@Column(coinColumn)
	public balance: number;

	@Column({ ...coinColumn, default: 0 })
	public reservedAmount: number;

	@Column({ ...coinColumn, default: 0 })
	public reservedBalance: number;

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
