/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ArticleService } from '@/core/ArticleService.js';
import { packedArticleCommentSchema } from '@/models/json-schema/article-comment.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { articleApiErrors, throwArticleApiError } from '@/server/api/article-errors.js';

export const meta = {
	tags: ['pages'], requireCredential: false, errors: articleApiErrors,
	res: { type: 'array', optional: false, nullable: false, items: packedArticleCommentSchema },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		articleId: { type: 'string', format: 'misskey:id' },
		replyId: { type: 'string', format: 'misskey:id', nullable: true, description: 'Omit to list all comments, use null for top-level comments, or an ID for all visible descendants, flattened in descending ID order (ascending with sinceId).' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceId: { type: 'string', format: 'misskey:id', description: 'Return comments newer than this ID in ascending ID order. Ignored when untilId is set.' },
	},
	required: ['articleId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private articleService: ArticleService) {
		super(meta, paramDef, (ps, me) => this.articleService.comments(ps.articleId, me, ps.limit, ps.untilId, ps.replyId, ps.sinceId).catch(throwArticleApiError));
	}
}
