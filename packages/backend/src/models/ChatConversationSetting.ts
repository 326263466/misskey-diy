/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_conversation_setting')
@Index('UQ_chat_conversation_user', ['ownerId', 'userId'], { unique: true })
@Index('UQ_chat_conversation_room', ['ownerId', 'roomId'], { unique: true })
@Index('IDX_chat_conversation_room', ['roomId'])
@Check('CHK_chat_conversation_target', '("userId" IS NULL) <> ("roomId" IS NULL)')
export class MiChatConversationSetting {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_chat_conversation_setting' })
	public id: string;

	@Column(id())
	public ownerId: string;

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_chat_conversation_owner' })
	public owner: MiUser | null;

	@Column({ ...id(), nullable: true })
	public userId: string | null;

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_chat_conversation_user' })
	public user: MiUser | null;

	@Column({ ...id(), nullable: true })
	public roomId: string | null;

	@ManyToOne(() => MiChatRoom, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_chat_conversation_room' })
	public room: MiChatRoom | null;

	@Column('varchar', { length: 16, default: 'all' })
	public notificationMode: 'all' | 'silent' | 'assistant' | 'blocked';

	@Column('timestamp with time zone', { nullable: true })
	public mutedUntil: Date | null;

	@Column('boolean', { default: false })
	public hidden: boolean;

	@Column({ ...id(), nullable: true })
	public hiddenThroughId: string | null;

	@Column('boolean', { default: false })
	public markedUnread: boolean;
}
