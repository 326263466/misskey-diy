/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiRedPacket } from './RedPacket.js';
import { MiUser } from './User.js';

@Entity('red_packet_recipient')
@Index('IDX_red_packet_recipient_user', ['userId', 'redPacketId'])
export class MiRedPacketRecipient {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_red_packet_recipient' })
	public redPacketId: string;

	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_red_packet_recipient' })
	public userId: string;

	@ManyToOne(() => MiRedPacket, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_red_packet_recipient_packet' })
	public redPacket: MiRedPacket | null;

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_red_packet_recipient_user' })
	public user: MiUser | null;
}
