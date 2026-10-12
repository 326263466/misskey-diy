/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ArticleService } from '@/core/ArticleService.js';
import { ApiError } from '@/server/api/error.js';

export const articleApiErrors = {
	noSuchArticle: { message: 'No such article.', code: 'NO_SUCH_ARTICLE', id: 'dec1e690-1c81-4401-983c-49d1bcc3bc68' },
	noSuchComment: { message: 'No such article comment.', code: 'NO_SUCH_COMMENT', id: '2a37812f-941f-477c-8c53-1cfb136d1f4f' },
	invalidComment: { message: 'Invalid article comment.', code: 'INVALID_COMMENT', id: 'f1373f97-0766-4af8-8f9e-902aca0f2fab' },
	accessDenied: { message: 'You cannot delete this article comment.', code: 'ACCESS_DENIED', id: 'a6838cce-f08c-4692-ac35-e4b74d835ee0' },
	yourArticle: { message: 'You cannot like your own article.', code: 'YOUR_ARTICLE', id: 'f75403b5-d1b7-452c-923c-27a2de462e3d' },
} as const;

export function throwArticleApiError(error: unknown): never {
	if (error instanceof ArticleService.NoSuchArticleError) throw new ApiError(articleApiErrors.noSuchArticle);
	if (error instanceof ArticleService.NoSuchCommentError) throw new ApiError(articleApiErrors.noSuchComment);
	if (error instanceof ArticleService.InvalidCommentError) throw new ApiError(articleApiErrors.invalidComment);
	if (error instanceof ArticleService.AccessDeniedError) throw new ApiError(articleApiErrors.accessDenied);
	throw error;
}
