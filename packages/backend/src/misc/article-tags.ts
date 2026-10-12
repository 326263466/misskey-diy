/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CONTENT_LIMITS } from 'misskey-js';
import type { MetasRepository } from '@/models/_.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import type { MiPage } from '@/models/Page.js';

export const invalidArticleTagsErrorId = 'b454220d-b96e-447a-a07a-6b588658bf03';

export async function assertArticleTagsAvailable(tags: string[], repository: Pick<MetasRepository, 'findOne'>, previous: string[] = []): Promise<void> {
	// 新选项必须已入库；旧文章和云稿中已保存的标签仍可原样保留。
	const allowed = new Set<string>(previous);
	const unknown = tags.filter(tag => !allowed.has(tag));
	if (unknown.length === 0) return;
	if (unknown.some(tag => Array.from(tag).length > CONTENT_LIMITS.articleTag)) throw new IdentifiableError(invalidArticleTagsErrorId);
	const meta = await repository.findOne({ where: {}, order: { id: 'DESC' }, select: { articleTags: true } });
	for (const tag of meta?.articleTags ?? []) allowed.add(tag);
	if (unknown.some(tag => !allowed.has(tag))) throw new IdentifiableError(invalidArticleTagsErrorId);
}

export const articleTagsSchema = {
	type: 'array', maxItems: 3, uniqueItems: true,
	// 更新和筛选需要接受历史名称，新标签另在事务内验证当前上限。
	items: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[^\\u0000]*$' },
} as const;

export const newArticleTagsSchema = {
	...articleTagsSchema,
	items: { ...articleTagsSchema.items, maxLength: CONTENT_LIMITS.articleTag },
} as const;

export function normalizeArticleTags(value: unknown): string[] {
	if (!Array.isArray(value) || value.length > 3 || value.some(tag => typeof tag !== 'string')) {
		throw new IdentifiableError(invalidArticleTagsErrorId);
	}
	const tags = (value as string[]).map(tag => normalizeForSearch(tag).trim());
	if (tags.some(tag => !tag || tag.includes('\u0000') || Array.from(tag).length > 100) || new Set(tags).size !== tags.length) {
		throw new IdentifiableError(invalidArticleTagsErrorId);
	}
	return tags;
}

function articleBlock(content: MiPage['content']) {
	return content.length === 1 && content[0]?.type === 'markdown' && typeof content[0].text === 'string' ? content[0] : null;
}

export function getArticleTags(content: MiPage['content']): string[] {
	try { return normalizeArticleTags(articleBlock(content)?.articleTags ?? []); } catch { return []; }
}

export function withArticleTags(content: MiPage['content'], tags?: string[], previousContent?: MiPage['content']): MiPage['content'] {
	const block = articleBlock(content);
	if (!block) {
		if (tags !== undefined && normalizeArticleTags(tags).length > 0) throw new IdentifiableError(invalidArticleTagsErrorId);
		return content;
	}
	// 独立参数优先；旧客户端更新正文时不能清掉已经绑定的话题。
	const source = tags !== undefined ? tags : Object.hasOwn(block, 'articleTags')
		? block.articleTags : previousContent ? articleBlock(previousContent)?.articleTags : undefined;
	if (source === undefined) return content;
	return [{ ...block, articleTags: normalizeArticleTags(source) }];
}
