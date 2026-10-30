/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiPage } from '@/models/Page.js';

export type ArticleRecommendationCandidate = Pick<MiPage, 'id' | 'userId' | 'articleCategoryId' | 'likedCount' | 'articleViews'> & {
	createdAt: number;
};

export function rankArticles(candidates: ArticleRecommendationCandidate[], followedAuthors: ReadonlySet<string>, now: number): string[] {
	const remaining = [...new Map(candidates.map(article => [article.id, article])).values()].map(article => {
		const ageInDays = Math.max(0, now - article.createdAt) / (24 * 60 * 60 * 1000);
		// 阅读量权重低且封顶，旧文编辑不会重置由创建时间计算的新鲜度。
		const engagement = 1 + 2 * Math.log1p(Math.max(0, article.likedCount)) + 0.12 * Math.log1p(Math.min(10000, Math.max(0, article.articleViews)));
		const score = engagement / Math.pow(1 + ageInDays, 1.25) * (followedAuthors.has(article.userId) ? 1.25 : 1);
		return { article, score };
	});
	const authors = new Map<string, number>();
	const categories = new Map<string, number>();
	const ranked: string[] = [];
	let previousAuthor: string | null = null;
	let previousCategory: string | null = null;
	while (remaining.length > 0) {
		let bestIndex = 0;
		let bestScore = -Infinity;
		for (let i = 0; i < remaining.length; i++) {
			const { article, score } = remaining[i];
			const categoryCount = article.articleCategoryId ? categories.get(article.articleCategoryId) ?? 0 : 0;
			const diversity = (1 + 0.65 * (authors.get(article.userId) ?? 0)) * (1 + 0.15 * categoryCount);
			const consecutiveAuthor = article.userId === previousAuthor ? 0.4 : 1;
			const consecutiveCategory = article.articleCategoryId && article.articleCategoryId === previousCategory ? 0.8 : 1;
			const adjusted = score / diversity * consecutiveAuthor * consecutiveCategory;
			if (adjusted > bestScore || (adjusted === bestScore && article.id > remaining[bestIndex].article.id)) {
				bestIndex = i;
				bestScore = adjusted;
			}
		}
		const { article } = remaining.splice(bestIndex, 1)[0];
		ranked.push(article.id);
		authors.set(article.userId, (authors.get(article.userId) ?? 0) + 1);
		if (article.articleCategoryId) categories.set(article.articleCategoryId, (categories.get(article.articleCategoryId) ?? 0) + 1);
		previousAuthor = article.userId;
		previousCategory = article.articleCategoryId;
	}
	return ranked;
}
