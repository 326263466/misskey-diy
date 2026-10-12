/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_room_invitation')
@Index(['userId', 'roomId'], { unique: true })
export class MiChatRoomInvitation {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column({ ...id(), nullable: true })
	public inviterId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_chat_room_invitation_inviter' })
	public inviter: MiUser | null;

	@Index()
	@Column({
		...id(),
	})
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public room: MiChatRoom | null;

	@Column('boolean', {
		default: false,
	})
	public ignored: boolean;

	@Column('boolean', { default: false })
	public isRequest: boolean;

	@Column('varchar', { length: 500, nullable: true })
	public requestMessage: string | null;
}
