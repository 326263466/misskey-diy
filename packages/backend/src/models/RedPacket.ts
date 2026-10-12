/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { coinColumn } from './util/coin.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

export type RedPacketMode = 'equal' | 'random';
export type RedPacketStatus = 'active' | 'exhausted' | 'expired' | 'cancelled';
export const redPacketCoverIds = ['classic', 'lucky', 'sunset'] as const;
export type RedPacketCoverId = typeof redPacketCoverIds[number];

@Entity('red_packet')
@Index('IDX_red_packet_request', ['userId', 'requestId'], { unique: true })
@Index('IDX_red_packet_user_id', ['userId', 'id'])
@Index('IDX_red_packet_expiration', ['status', 'expiresAt'])
@Index('IDX_red_packet_password', ['password'], { where: '"password" IS NOT NULL' })
@Check('CHK_red_packet_amounts', '"totalCoins" >= 1 AND "totalCoins" >= count * 0.01 AND count >= 1 AND count <= 100 AND "remainingCoins" >= 0 AND "remainingCoins" <= "totalCoins" AND "remainingCount" >= 0 AND "remainingCount" <= count')
export class MiRedPacket {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_red_packet' })
	public id: string;

	@Column('varchar', { length: 8 })
	public kind: 'direct' | 'group';

	@Column('varchar', { length: 16 })
	public audience: 'public' | 'recipients' | 'room';

	@Index('IDX_red_packet_room')
	@Column({ ...id(), nullable: true })
	public roomId: MiChatRoom['id'] | null;

	@ManyToOne(() => MiChatRoom, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_red_packet_room' })
	public room: MiChatRoom | null;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_red_packet_user' })
	public user: MiUser | null;

	@Column('varchar', { length: 64 })
	public recipientIdsHash: string;

	@Column('uuid')
	public requestId: string;

	@Column('varchar', { length: 8 })
	public mode: RedPacketMode;

	@Column('varchar', { length: 100 })
	public message: string;

	@Column('varchar', { length: 64, nullable: true })
	public password: string | null;

	@Column('varchar', { length: 16, default: 'classic' })
	public coverId: RedPacketCoverId;

	@Column({ ...id(), nullable: true })
	public coverFileId: string | null;

	@Column('varchar', { length: 1024, nullable: true })
	public coverUrl: string | null;

	@Column(coinColumn)
	public totalCoins: number;

	@Column('integer')
	public count: number;

	@Column(coinColumn)
	public remainingCoins: number;

	@Column('integer')
	public remainingCount: number;

	@Column('integer')
	public expiresInHours: number;

	@Column('timestamp with time zone', { nullable: true })
	public startsAt: Date | null;

	@Column('timestamp with time zone')
	public expiresAt: Date;

	@Column('varchar', { length: 16, default: 'active' })
	public status: RedPacketStatus;
}
