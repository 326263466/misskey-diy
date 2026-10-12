/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('drive_file_draft')
export class MiDriveFileDraft {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_drive_file_draft' })
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_drive_file_draft_user' })
	public user: MiUser | null;

	@PrimaryColumn('varchar', { length: 100, primaryKeyConstraintName: 'PK_drive_file_draft' })
	public draftId: string;

	@Column('jsonb', { default: {} })
	public data: { fileIds: string[]; text: string | null };

	@Column('timestamp with time zone', { default: () => 'CURRENT_TIMESTAMP' })
	public updatedAt: Date;
}
