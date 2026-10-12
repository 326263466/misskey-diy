/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('wallet_settings')
@Check('CHK_wallet_settings_rate', '"exchangeRate" >= 1 AND "exchangeRate" <= 1000000')
@Check('CHK_wallet_settings_points_per_coin', '"pointsPerCoin" IS NULL OR ("pointsPerCoin" >= 1 AND "pointsPerCoin" <= 1000000)')
export class MiWalletSettings {
	@PrimaryColumn('varchar', { length: 16, primaryKeyConstraintName: 'PK_wallet_settings' })
	public id: string;

	@Column('boolean', { default: true })
	public exchangeEnabled: boolean;

	@Column('integer', { default: 1 })
	public exchangeRate: number;

	// null 保留旧版“每积分兑换单位数”配置，当前兑换功能已停用。
	@Column('integer', { nullable: true })
	public pointsPerCoin: number | null;
}
