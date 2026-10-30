/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

export type SearchIndexKind = 'notes' | 'articles' | 'users';

@Entity('search_index_state')
export class MiSearchIndexState {
	@PrimaryColumn('integer', { default: 0, primaryKeyConstraintName: 'PK_search_index_state' })
	public id: number;

	@Column('boolean', { default: false })
	public enabled: boolean;

	@Column('boolean', { default: false })
	public ready: boolean;

	@Column('varchar', { length: 64, default: '' })
	public target: string;
}

@Entity('search_index_job')
@Index('IDX_search_index_job_updated_at', ['updatedAt'])
export class MiSearchIndexJob {
	@PrimaryColumn('varchar', { length: 16, primaryKeyConstraintName: 'PK_search_index_job' })
	public kind: SearchIndexKind;

	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_search_index_job' })
	public documentId: string;

	@Column('bigint', { default: 0 })
	public revision: string;

	@Column('timestamp with time zone', { default: () => 'now()' })
	public updatedAt: Date;
}
