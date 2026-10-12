/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('payment_settings')
@Check('CHK_payment_settings_fee_rate', '"feeRateBps" >= 0 AND "feeRateBps" <= 10000')
export class MiPaymentSettings {
	@PrimaryColumn('varchar', { length: 32, primaryKeyConstraintName: 'PK_payment_settings' })
	public id: string;

	@Column('integer', { default: 1500 })
	public feeRateBps: number;
}
