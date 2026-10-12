/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiPage } from './Page.js';

@Entity('article_favorite')
@Index('IDX_article_favorite_user_article', ['userId', 'articleId'], { unique: true })
export class MiArticleFavorite {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_article_favorite' })
	public id: string;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_article_favorite_user' })
	public user: MiUser | null;

	@Column(id())
	public articleId: MiPage['id'];

	@ManyToOne(() => MiPage, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_article_favorite_article' })
	public article: MiPage | null;
}
