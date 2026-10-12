/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { coinColumn } from './util/coin.js';
import { MiUser } from './User.js';

export type TipTarget = { targetType: 'note' | 'page'; targetId: string };

@Entity('tip')
@Index('IDX_tip_sender_request', ['senderId', 'requestId'], { unique: true })
@Index('IDX_tip_target_id', ['targetType', 'targetId', 'id'])
@Check('CHK_tip_amount', '"amount" >= 1 AND "amount" <= 1000')
@Check('CHK_tip_target', '("targetType" IS NULL AND "targetId" IS NULL) OR ("targetType" IS NOT NULL AND "targetId" IS NOT NULL)')
export class MiTip {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_tip' })
	public id: string;

	@Column({ ...id(), nullable: true })
	public senderId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_tip_sender' })
	public sender: MiUser | null;

	@Column(id())
	public recipientId: MiUser['id'];

	@Column('uuid')
	public requestId: string;

	@Column(coinColumn)
	public amount: number;

	@Column('varchar', { length: 100, nullable: true })
	public message: string | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('varchar', { length: 32, nullable: true })
	public targetType: TipTarget['targetType'] | null;

	// 内容删除后保留目标标识和幂等凭证；读取时重新检查内容权限。
	@Column({ ...id(), nullable: true })
	public targetId: string | null;
}
