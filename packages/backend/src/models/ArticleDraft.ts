/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export type ArticleDraftData = {
	title: string;
	summary: string;
	text: string;
	name: string;
	articleCategoryId: string | null;
	articleTags: string[];
	articleId: string | null;
	coverId: string | null;
	fileIds: string[];
};

@Entity('article_draft')
@Index('IDX_article_draft_user_updated', ['userId', 'updatedAt'])
export class MiArticleDraft {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_article_draft' })
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_article_draft_user' })
	public user: MiUser | null;

	@PrimaryColumn('varchar', { length: 100, primaryKeyConstraintName: 'PK_article_draft' })
	public draftId: string;

	@Column('integer')
	public revision: number;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	// 删除后只留版本号，防止超时重试或晚到的请求重新创建已删除草稿。
	@Column('jsonb', { nullable: true })
	public data: ArticleDraftData | null;
}
