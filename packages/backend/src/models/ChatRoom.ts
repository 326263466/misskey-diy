/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';

@Entity('chat_room')
export class MiChatRoom {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Index()
	@Column({
		...id(),
	})
	public ownerId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public owner: MiUser | null;

	@Column('varchar', {
		length: 2048, default: '',
	})
	public description: string;

	@Column('varchar', { length: 2048, default: '' })
	public announcement: string;

	@Column('varchar', { length: 32, default: '' })
	public ownerNickname: string;

	@Column({
		...id(),
		nullable: true,
	})
	public avatarId: MiDriveFile['id'] | null;

	@ManyToOne(() => MiDriveFile, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public avatar: MiDriveFile | null;

	@Column('varchar', {
		length: 24, default: 'invitation',
	})
	public joinPolicy: 'public' | 'approval' | 'invitation' | 'closed';

	@Column('boolean', { default: false })
	public isSilenced: boolean;

	@Column('timestamp with time zone', { nullable: true })
	public silenceUntil: Date | null;

	@Column('boolean', { default: false })
	public ownerIsMuted: boolean;

	@Column('timestamp with time zone', { nullable: true })
	public ownerMutedUntil: Date | null;

	@Column('boolean', {
		default: false,
	})
	public isArchived: boolean;
}
