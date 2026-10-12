/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { ArticleService } from '@/core/ArticleService.js';
import { DriveFileLifecycleService } from '@/core/DriveFileLifecycleService.js';
import { ApiError } from '@/server/api/error.js';
import { packedArticleCommentSchema } from '@/models/json-schema/article-comment.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { articleApiErrors, throwArticleApiError } from '@/server/api/article-errors.js';

export const meta = {
	tags: ['pages'], requireCredential: true, prohibitMoved: true, kind: 'write:pages',
	limit: { duration: 60 * 60_000, max: 60 },
	errors: { ...articleApiErrors, invalidFiles: { message: 'Invalid image attachments.', code: 'INVALID_FILES', id: 'b3c40f4d-2e9d-4703-90a9-a78027abc7f8' } },
	res: packedArticleCommentSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		articleId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string', maxLength: CONTENT_LIMITS.commentText },
		fileIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, maxItems: 16, uniqueItems: true },
		replyId: { type: 'string', format: 'misskey:id' },
	},
	required: ['articleId', 'text'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private articleService: ArticleService) {
		super(meta, paramDef, (ps, me) => this.articleService.createComment(ps.articleId, me, ps.text, ps.replyId, ps.fileIds).catch(error => {
			if (DriveFileLifecycleService.isInvalidImagesError(error)) throw new ApiError(meta.errors.invalidFiles);
			throwArticleApiError(error);
		}));
	}
}
