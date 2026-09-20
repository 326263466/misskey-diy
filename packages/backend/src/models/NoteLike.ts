/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiNote } from './Note.js';
import { MiUser } from './User.js';

@Entity('note_like')
@Index('IDX_note_like_user_note', ['userId', 'noteId'], { unique: true })
@Index('IDX_note_like_note', ['noteId', 'id'])
export class MiNoteLike {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_note_like' })
	public id: string;

	@Index('IDX_note_like_user')
	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_note_like_user' })
	public user: MiUser | null;

	@Column(id())
	public noteId: MiNote['id'];

	@ManyToOne(() => MiNote, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_note_like_note' })
	public note: MiNote | null;
}
