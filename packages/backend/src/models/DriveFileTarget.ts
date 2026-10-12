/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiDriveFile } from './DriveFile.js';

@Entity('drive_file_target')
@Index('IDX_drive_file_target_hash', ['tokenHash'])
export class MiDriveFileTarget {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_drive_file_target' })
	public fileId: MiDriveFile['id'];

	@ManyToOne(() => MiDriveFile, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_drive_file_target_file' })
	public file: MiDriveFile | null;

	@PrimaryColumn('varchar', { length: 32, primaryKeyConstraintName: 'PK_drive_file_target' })
	public kind: string;

	@Column('text')
	public token: string;

	@Column('varchar', { length: 32 })
	public tokenHash: string;
}
