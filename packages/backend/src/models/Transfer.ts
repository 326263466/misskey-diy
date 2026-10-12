/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { coinColumn } from './util/coin.js';
import { MiUser } from './User.js';

export const transferStatuses = ['pending', 'accepted', 'refunded', 'expired'] as const;
export type TransferStatus = typeof transferStatuses[number];

@Entity('transfer')
@Index('IDX_transfer_request', ['senderId', 'requestId'], { unique: true })
@Index('IDX_transfer_sender', ['senderId', 'id'])
@Index('IDX_transfer_recipient', ['recipientId', 'id'])
@Index('IDX_transfer_expiration', ['status', 'expiresAt'])
@Check('CHK_transfer_amount', '"amount" >= 0.01 AND "amount" <= 2000000000')
export class MiTransfer {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_transfer' })
	public id: string;

	@Column(id())
	public senderId: string;

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_transfer_sender' })
	public sender: MiUser | null;

	// 收款账户删除后仍保留凭证，确保未收资金可以原路退回。
	@Column(id())
	public recipientId: string;

	@Column('uuid')
	public requestId: string;

	@Column(coinColumn)
	public amount: number;

	@Column('varchar', { length: 200, nullable: true })
	public message: string | null;

	@Column('varchar', { length: 16, default: 'pending' })
	public status: TransferStatus;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public expiresAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public completedAt: Date | null;
}
