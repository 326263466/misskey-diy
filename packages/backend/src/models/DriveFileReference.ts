/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiDriveFile } from './DriveFile.js';

@Entity('drive_file_reference')
@Index('IDX_drive_file_reference_source', ['sourceType', 'sourceId'])
export class MiDriveFileReference {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_drive_file_reference' })
	public fileId: MiDriveFile['id'];

	@ManyToOne(() => MiDriveFile, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_drive_file_reference_file' })
	public file: MiDriveFile | null;

	@PrimaryColumn('varchar', { length: 64, primaryKeyConstraintName: 'PK_drive_file_reference' })
	public sourceType: string;

	@PrimaryColumn('varchar', { length: 160, primaryKeyConstraintName: 'PK_drive_file_reference' })
	public sourceId: string;
}
