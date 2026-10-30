/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiArticleComment } from './ArticleComment.js';

@Entity('article_comment_like')
@Index('IDX_article_comment_like_user_comment', ['userId', 'commentId'], { unique: true })
@Index('IDX_article_comment_like_comment_id', ['commentId'])
export class MiArticleCommentLike {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_article_comment_like' })
	public id: string;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_article_comment_like_user' })
	public user: MiUser | null;

	@Column(id())
	public commentId: MiArticleComment['id'];

	@ManyToOne(() => MiArticleComment, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_article_comment_like_comment' })
	public comment: MiArticleComment | null;
}
