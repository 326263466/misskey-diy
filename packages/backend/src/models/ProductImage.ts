/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiProduct } from './Product.js';

@Entity('product_image')
@Index('IDX_product_image_user', ['userId'])
@Index('IDX_product_image_cleanup', ['expiresAt'])
@Index('IDX_product_image_url', ['url'], { unique: true })
@Check('CHK_product_image_size', '"size" >= 1 AND "size" <= 10485760')
export class MiProductImage {
	@PrimaryColumn('varchar', { length: 32, primaryKeyConstraintName: 'PK_product_image' })
	public id: string;

	@Column({ ...id(), nullable: true })
	public userId: string | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_product_image_user' })
	public user: MiUser | null;

	@Column('varchar', { length: 64, nullable: true })
	public productId: string | null;

	@ManyToOne(() => MiProduct, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_product_image_product' })
	public product: MiProduct | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public expiresAt: Date | null;

	@Column('timestamp with time zone', { nullable: true })
	public deletingAt: Date | null;

	@Column('boolean', { default: false })
	public ready: boolean;

	@Column('boolean')
	public storedInternal: boolean;

	@Column('varchar', { length: 1024 })
	public storageKey: string;

	@Column('varchar', { length: 2048 })
	public url: string;

	@Column('varchar', { length: 32 })
	public type: string;

	@Column('integer')
	public size: number;
}
