/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';

const publishedArticles = new WeakMap<object, { articleId: string; detail: entities.ArticlesShowResponse | null }>();

export function rememberPublishedArticle(router: object, articleId: string, detail: entities.ArticlesShowResponse | null): void {
	publishedArticles.set(router, { articleId, detail });
}

export function takePublishedArticle(router: object, articleId: string): entities.ArticlesShowResponse | null | undefined {
	const published = publishedArticles.get(router);
	if (published?.articleId !== articleId) return undefined;
	publishedArticles.delete(router);
	// 预载失败也交接一次刷新标记，避免返回缓存中的旧文章。
	return published.detail?.article?.id === articleId && isArticle(published.detail.article) ? published.detail : null;
}

export function isArticle(page: Pick<entities.Page, 'content'>): boolean {
	return page.content.length === 1 && page.content[0].type === 'markdown' && typeof page.content[0].text === 'string';
}

export function articleBody(page: Pick<entities.Page, 'content'>): string {
	const block = page.content[0];
	return isArticle(page) && block.type === 'markdown' ? block.text : '';
}
