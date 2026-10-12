/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('product')
@Index('IDX_product_seller_id', ['sellerId', 'id'])
@Index('IDX_product_enabled_created_id', ['enabled', 'createdAt', 'id'])
@Index('IDX_product_create_request', ['sellerId', 'createRequestId'], { unique: true })
@Check('CHK_product_price', '"price" >= 1 AND "price" <= 1000000')
@Check('CHK_product_limits', '"perUserLimit" >= 0 AND "perUserLimit" <= 1000000 AND "stockLimit" >= 0 AND "stockLimit" <= 1000000 AND "soldCount" >= 0 AND "soldCount" <= 9007199254740991')
@Check('CHK_product_type', '"type" IN (\'physical\', \'virtual\')')
export class MiProduct {
	@PrimaryColumn('varchar', { length: 64, primaryKeyConstraintName: 'PK_product' })
	public id: string;

	@Column({ ...id(), nullable: true })
	public sellerId: string | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_product_seller' })
	public seller: MiUser | null;

	@Column('uuid', { nullable: true })
	public createRequestId: string | null;

	@Column('varchar', { length: 64, nullable: true })
	public createFingerprint: string | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	@Column('varchar', { length: 64 })
	public version: string;

	@Column('varchar', { length: 40 })
	public name: string;

	@Column('varchar', { length: 200 })
	public description: string;

	@Column('varchar', { length: 16 })
	public type: 'physical' | 'virtual';

	@Column('varchar', { length: 20 })
	public category: string;

	@Column('varchar', { length: 2048 })
	public imageUrl: string;

	@Column('varchar', { length: 8 })
	public unit: string;

	@Column('integer')
	public price: number;

	@Column('integer', { default: 0 })
	public perUserLimit: number;

	@Column('integer', { default: 0 })
	public stockLimit: number;

	@Column('bigint', { default: 0 })
	public soldCount: number;

	@Column('varchar', { length: 2000 })
	public deliveryText: string;

	@Column('boolean', { default: true })
	public enabled: boolean;
}
