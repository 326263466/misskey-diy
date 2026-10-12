/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiPage } from './Page.js';

@Entity('article_comment')
@Index('IDX_article_comment_article_id_id', ['articleId', 'id'])
@Index('IDX_article_comment_user_id', ['userId'])
export class MiArticleComment {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_article_comment' })
	public id: string;

	@Column(id())
	public articleId: MiPage['id'];

	@ManyToOne(() => MiPage, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_article_comment_article' })
	public article: MiPage | null;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_article_comment_user' })
	public user: MiUser | null;

	@Column('varchar', { length: 3000 })
	public text: string;

	@Column('varchar', { length: 32, array: true, default: '{}' })
	public fileIds: string[];

	@Column({ ...id(), nullable: true })
	public replyId: MiArticleComment['id'] | null;

	@ManyToOne(() => MiArticleComment, { onDelete: 'SET NULL' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_article_comment_reply' })
	public reply: MiArticleComment | null;
}
