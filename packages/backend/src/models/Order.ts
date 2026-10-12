/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { coinColumn } from './util/coin.js';

const optionalAmountColumn = {
	...coinColumn,
	nullable: true,
	transformer: { to: (value: number | null) => value, from: (value: string | null) => value === null ? null : Number(value) },
};

export type OrderReceipt = {
	name: string;
	type: 'physical' | 'virtual';
	unit: string;
	deliveryText: string;
	version: string;
};

@Entity('order')
@Index('IDX_order_buyer_id', ['buyerId', 'id'])
@Index('IDX_order_seller_id', ['sellerId', 'id'])
@Index('IDX_order_product_buyer', ['productId', 'buyerId'])
@Index('IDX_order_request', ['buyerId', 'requestId'], { unique: true })
@Index('IDX_order_transaction', ['transactionId'], { unique: true })
@Index('IDX_order_seller_transaction', ['sellerTransactionId'], { unique: true })
@Index('IDX_order_redemption_code', ['redemptionCode'], { unique: true })
@Check('CHK_order_number', '"id" ~ \'^[0-9]{19}$\'')
@Check('CHK_order_amount', '"quantity" >= 1 AND "quantity" <= 1000000 AND "total" >= 1 AND "total" <= 2000000000')
@Check('CHK_order_redemption_code', '"redemptionCode" IS NULL OR "redemptionCode" ~ \'^[0-9A-Z]{20}$\'')
@Check('CHK_order_settlement', '("redemptionCode" IS NULL OR "feeRateBps" IS NOT NULL) AND (("feeRateBps" IS NULL AND "platformFee" IS NULL AND "sellerAmount" IS NULL) OR ("feeRateBps" IS NOT NULL AND "platformFee" IS NOT NULL AND "sellerAmount" IS NOT NULL AND "feeRateBps" >= 0 AND "feeRateBps" <= 10000 AND "platformFee" >= 0 AND "sellerAmount" >= 0 AND "platformFee" + "sellerAmount" = "total" AND "platformFee" = CEIL("total"::numeric * 100 * "feeRateBps" / 10000) / 100))')
export class MiOrder {
	// 编号由数据库序列分配，并以字符串传输，避免 JavaScript 大整数精度丢失。
	@PrimaryColumn('varchar', { length: 19, primaryKeyConstraintName: 'PK_order' })
	public id: string;

	// 保留交易快照，不因参与者注销而丢失已售库存、限购记录和卖家凭证。
	@Column(id())
	public buyerId: string;

	@Column({ ...id(), nullable: true })
	public sellerId: string | null;

	@Column('varchar', { length: 64 })
	public productId: string;

	@Column('uuid', { nullable: true })
	public requestId: string | null;

	@Column({ ...id(), nullable: true })
	public transactionId: string | null;

	@Column({ ...id(), nullable: true })
	public sellerTransactionId: string | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('integer')
	public quantity: number;

	@Column('integer')
	public total: number;

	@Column('integer', { nullable: true })
	public feeRateBps: number | null;

	@Column(optionalAmountColumn)
	public platformFee: number | null;

	@Column(optionalAmountColumn)
	public sellerAmount: number | null;

	@Column('jsonb')
	public receipt: OrderReceipt;

	@Column('varchar', { length: 20, nullable: true })
	public redemptionCode: string | null;
}
