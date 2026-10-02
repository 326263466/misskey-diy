/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiRedPacket } from './RedPacket.js';
import { MiUser } from './User.js';

@Entity('red_packet_claim')
@Index('IDX_red_packet_claim_user', ['redPacketId', 'userId'], { unique: true })
@Check('CHK_red_packet_claim_coins', 'coins > 0')
export class MiRedPacketClaim {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_red_packet_claim' })
	public id: string;

	@Column(id())
	public redPacketId: MiRedPacket['id'];

	@ManyToOne(() => MiRedPacket, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_red_packet_claim_packet' })
	public redPacket: MiRedPacket | null;

	@Column({ ...id(), nullable: true })
	public userId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_red_packet_claim_user' })
	public user: MiUser | null;

	@Column('integer')
	public coins: number;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
