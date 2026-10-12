/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { MiPlatformAccount } from './PlatformAccount.js';

@Entity('platform_transaction')
@Index('IDX_platform_transaction_reference', ['accountId', 'referenceId'], { unique: true })
@Index('IDX_platform_transaction_created', ['accountId', 'createdAt'])
@Check('CHK_platform_transaction_amount', '"amountUnits" > 0 AND "amountUnits" <= 200000000000')
@Check('CHK_platform_transaction_balance', '"balanceUnits" >= 0 AND "balanceUnits" <= 100000000000000')
export class MiPlatformTransaction {
	@PrimaryColumn('uuid', { primaryKeyConstraintName: 'PK_platform_transaction' })
	public id: string;

	@Column('varchar', { length: 32 })
	public accountId: string;

	@ManyToOne(() => MiPlatformAccount, { onDelete: 'RESTRICT' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_platform_transaction_account' })
	public account: MiPlatformAccount | null;

	// 业务凭证只作引用；平台账本不依赖订单实体的生命周期。
	@Column('varchar', { length: 64 })
	public referenceId: string;

	@Column('bigint')
	public amountUnits: number;

	@Column('bigint')
	public balanceUnits: number;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
