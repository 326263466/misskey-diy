/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('wallet_settings')
@Check('CHK_wallet_settings_rate', '"exchangeRate" >= 1 AND "exchangeRate" <= 1000000')
export class MiWalletSettings {
	@PrimaryColumn('varchar', { length: 16, primaryKeyConstraintName: 'PK_wallet_settings' })
	public id: string;

	@Column('boolean', { default: true })
	public exchangeEnabled: boolean;

	@Column('integer', { default: 1 })
	public exchangeRate: number;
}
