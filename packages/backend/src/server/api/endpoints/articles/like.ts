/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ArticleService } from '@/core/ArticleService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { articleApiErrors, throwArticleApiError } from '@/server/api/article-errors.js';

export const meta = {
	tags: ['pages'], requireCredential: true, prohibitMoved: true, kind: 'write:page-likes',
	limit: { duration: 60_000, max: 60 }, errors: articleApiErrors,
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			likedCount: { type: 'integer', optional: false, nullable: false },
			isLiked: { type: 'boolean', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object', properties: { articleId: { type: 'string', format: 'misskey:id' }, liked: { type: 'boolean' } }, required: ['articleId', 'liked'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private articleService: ArticleService) {
		super(meta, paramDef, (ps, me) => this.articleService.setLiked(ps.articleId, me, ps.liked).catch(throwArticleApiError));
	}
}
