/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ArticleDraftService } from '@/core/ArticleDraftService.js';
import { articleDraftIdSchema, articleDraftSchema } from '@/misc/article-draft-schema.js';
import { articleTagsSchema, invalidArticleTagsErrorId } from '@/misc/article-tags.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { contentTooLongError } from '@/misc/content-limits.js';
import { articleCategoryIdSchema, pageNameSchema } from '@/models/Page.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['articles', 'drafts'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:pages',
	limit: { duration: 60_000, max: 120 },
	res: articleDraftSchema,
	errors: {
		contentTooLong: { ...contentTooLongError, id: 'dc67571f-3b78-4a1f-b5fb-926bf2c4ba7c' },
		draftConflict: { message: 'The article draft has changed. Reload it before saving.', code: 'DRAFT_CONFLICT', id: '82f801d4-216c-406d-880a-18f7fcd1c639' },
		tooManyDrafts: { message: 'You cannot create more article drafts.', code: 'TOO_MANY_DRAFTS', id: '1af57786-20fb-41cd-9cd0-82e0cf9a6349' },
		invalidContent: { message: 'An article draft must contain text or a cover.', code: 'INVALID_CONTENT', id: 'ac7cf674-0bc8-4c02-8816-b7b4582a9376' },
		noSuchArticle: { message: 'No such owned article.', code: 'NO_SUCH_ARTICLE', id: '5f928c69-28a1-417f-b896-07f81dc706c7' },
		invalidCover: { message: 'The cover must be an owned non-sensitive image.', code: 'INVALID_COVER', id: '12f924dd-be4d-4628-8492-6b1cacb65c93' },
		fileUnavailable: { message: 'An attached file is no longer available.', code: 'FILE_UNAVAILABLE', id: '98158006-2bb2-4d46-b0d4-b9b608032f50' },
		invalidTags: { message: 'Article tags are invalid.', code: 'INVALID_ARTICLE_TAGS', id: '25535e45-9259-4b42-8c08-53a78487c093' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		draftId: articleDraftIdSchema,
		expectedRevision: { type: 'integer', minimum: 0, maximum: 2147483646 },
		title: { type: 'string', maxLength: 256 },
		summary: { type: 'string', maxLength: 256 },
		text: { type: 'string', maxLength: 100000 },
		name: pageNameSchema,
		articleCategoryId: { ...articleCategoryIdSchema, nullable: true },
		articleTags: articleTagsSchema,
		articleId: { type: 'string', format: 'misskey:id', nullable: true },
		coverId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['draftId', 'expectedRevision', 'title', 'summary', 'text', 'name', 'articleCategoryId', 'articleTags', 'articleId', 'coverId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private articleDraftService: ArticleDraftService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const { draftId, expectedRevision, ...data } = ps;
				return await this.articleDraftService.pack(await this.articleDraftService.save(me.id, draftId, expectedRevision, data));
			} catch (error) {
				if (error instanceof IdentifiableError && error.id === contentTooLongError.id) throw new ApiError(meta.errors.contentTooLong);
				if (error instanceof ArticleDraftService.ConflictError) throw new ApiError(meta.errors.draftConflict);
				if (error instanceof ArticleDraftService.LimitError) throw new ApiError(meta.errors.tooManyDrafts);
				if (error instanceof ArticleDraftService.InvalidContentError) throw new ApiError(meta.errors.invalidContent);
				if (error instanceof ArticleDraftService.InvalidArticleError) throw new ApiError(meta.errors.noSuchArticle);
				if (error instanceof ArticleDraftService.InvalidCoverError) throw new ApiError(meta.errors.invalidCover);
				if (error instanceof ArticleDraftService.FileUnavailableError) throw new ApiError(meta.errors.fileUnavailable);
				if (error instanceof IdentifiableError && error.id === invalidArticleTagsErrorId) throw new ApiError(meta.errors.invalidTags);
				throw error;
			}
		});
	}
}
