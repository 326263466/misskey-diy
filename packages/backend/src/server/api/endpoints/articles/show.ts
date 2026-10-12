/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ArticleService } from '@/core/ArticleService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { articleApiErrors, throwArticleApiError } from '@/server/api/article-errors.js';

export const meta = {
	tags: ['pages'], requireCredential: false,
	errors: articleApiErrors,
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			article: { type: 'object', ref: 'Page', optional: false, nullable: false },
			commentsCount: { type: 'integer', optional: false, nullable: false },
			isFavorited: { type: 'boolean', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object', properties: { articleId: { type: 'string', format: 'misskey:id' } }, required: ['articleId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private articleService: ArticleService) {
		super(meta, paramDef, (ps, me, _token, _file, _cleanup, ip) => this.articleService.show(ps.articleId, me, ip).catch(throwArticleApiError));
	}
}
