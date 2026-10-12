/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('platform_account')
@Check('CHK_platform_account_balance', '"balanceUnits" >= 0 AND "balanceUnits" <= 100000000000000')
export class MiPlatformAccount {
	@PrimaryColumn('varchar', { length: 32, primaryKeyConstraintName: 'PK_platform_account' })
	public id: string;

	// 以 0.01 积分为单位持久化整数，累计手续费不产生浮点误差。
	@Column('bigint', { default: 0 })
	public balanceUnits: number;
}
