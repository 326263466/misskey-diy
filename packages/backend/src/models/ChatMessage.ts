/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_message')
export class MiChatMessage {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public fromUserId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public fromUser: MiUser | null;

	@Index()
	@Column({
		...id(), nullable: true,
	})
	public toUserId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public toUser: MiUser | null;

	@Index()
	@Column({
		...id(), nullable: true,
	})
	public toRoomId: MiChatRoom['id'] | null;

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public toRoom: MiChatRoom | null;

	@Column('varchar', {
		length: 4096, nullable: true,
	})
	public text: string | null;

	@Column('jsonb', { nullable: true })
	public systemEvent: { type: 'membersJoined'; userIds: MiUser['id'][]; invited: boolean } | null;

	@Index('IDX_chat_message_reply')
	@Column({ ...id(), nullable: true })
	public replyId: MiChatMessage['id'] | null;

	@ManyToOne(() => MiChatMessage, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_chat_message_reply' })
	public reply: MiChatMessage | null;

	@Column('varchar', { length: 8, nullable: true })
	public replyType: 'reply' | 'quote' | null;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public editedAt: Date | null;

	@Column('boolean', {
		default: false,
	})
	public isAutoReply: boolean;

	@Column('boolean', { default: false })
	public isPoke: boolean;

	@Index('IDX_chat_message_poke_user')
	@Column({ ...id(), nullable: true })
	public pokeUserId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_chat_message_poke_user' })
	public pokeUser: MiUser | null;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public uri: string | null;

	@Column({
		...id(),
		array: true, default: '{}',
	})
	public reads: MiUser['id'][];

	@Column({
		...id(),
		nullable: true,
	})
	public fileId: MiDriveFile['id'] | null;

	@ManyToOne(() => MiDriveFile, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public file: MiDriveFile | null;

	@Index('IDX_chat_message_red_packet')
	@Column({ ...id(), nullable: true })
	public redPacketId: string | null;

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public reactions: string[];
}
