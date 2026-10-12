/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ArticleService } from '@/core/ArticleService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { articleApiErrors, throwArticleApiError } from '@/server/api/article-errors.js';

export const meta = {
	tags: ['pages'], requireCredential: true, kind: 'write:pages', errors: articleApiErrors,
} as const;

export const paramDef = {
	type: 'object', properties: { commentId: { type: 'string', format: 'misskey:id' } }, required: ['commentId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private articleService: ArticleService) {
		super(meta, paramDef, (ps, me) => this.articleService.deleteComment(ps.commentId, me).catch(throwArticleApiError));
	}
}
