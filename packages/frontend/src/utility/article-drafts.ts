/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';
import { genId } from '@/utility/id.js';

export type ArticleDraft = {
	version: 1;
	title: string;
	summary: string;
	text: string;
	name: string;
	articleCategoryId: string | null;
	articleTags?: string[];
	cover: entities.DriveFile | null;
	fileProtectionId?: string;
	updatedAt: string;
	articleId?: string;
	cloudId?: string;
	cloudRevision?: number;
};

export type StoredArticleDraft = {
	key: string;
	raw: string;
	draft: ArticleDraft;
};

const prefix = 'misskey:articleDraft:';

function accountPrefix(accountId: string): string {
	return `${prefix}${accountId}`;
}

function belongsToAccount(key: string, accountId: string): boolean {
	const accountKey = accountPrefix(accountId);
	return key === accountKey || key.startsWith(`${accountKey}:`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function imageUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
	} catch {
		return null;
	}
}

function restoreCover(value: unknown): entities.DriveFile | null {
	if (!isRecord(value) || typeof value.id !== 'string' || !value.id ||
		typeof value.type !== 'string' || !value.type.startsWith('image/') || (value.isSensitive != null && value.isSensitive !== false)) return null;
	const url = imageUrl(value.url);
	if (!url) return null;
	return { ...value, url, thumbnailUrl: imageUrl(value.thumbnailUrl), isSensitive: false } as entities.DriveFile;
}

function parseDraft(value: unknown, key: string, accountId: string): ArticleDraft | null {
	// 本地恢复沿用历史上限并按码点计数，避免丢弃含 emoji 或尚待修正的旧稿。
	if (!isRecord(value) || value.version !== 1 ||
		typeof value.title !== 'string' || Array.from(value.title).length > 256 ||
		typeof value.summary !== 'string' || Array.from(value.summary).length > 256 ||
		typeof value.text !== 'string' || Array.from(value.text).length > 100000 ||
		typeof value.name !== 'string' || !/^[^\s:/?#\[\]@!$&'()*+,;=\\%\x00-\x20]{1,256}$/u.test(value.name)) return null;

	const suffix = key.slice(accountPrefix(accountId).length);
	const legacyArticleId = suffix.startsWith(':edit:') ? suffix.slice(':edit:'.length).split(':')[0] : undefined;
	const articleId = legacyArticleId || (typeof value.articleId === 'string' && value.articleId ? value.articleId : undefined);
	return {
		version: 1,
		title: value.title,
		summary: value.summary,
		text: value.text,
		name: value.name,
		articleCategoryId: typeof value.articleCategoryId === 'string' && value.articleCategoryId ? value.articleCategoryId : null,
		articleTags: Array.isArray(value.articleTags) ? [...new Set(value.articleTags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0 && Array.from(tag).length <= 100))].slice(0, 3) : [],
		cover: restoreCover(value.cover),
		...(typeof value.fileProtectionId === 'string' && /^composer:[a-zA-Z0-9_-]+$/.test(value.fileProtectionId) && value.fileProtectionId.length <= 100
			? { fileProtectionId: value.fileProtectionId } : {}),
		updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
		...(articleId ? { articleId } : {}),
		...(typeof value.cloudId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value.cloudId) && Number.isInteger(value.cloudRevision) && Number(value.cloudRevision) >= 0 && Number(value.cloudRevision) <= 2147483647
			? { cloudId: value.cloudId, cloudRevision: Number(value.cloudRevision) } : {}),
	};
}

export function listArticleDrafts(accountId: string): StoredArticleDraft[] {
	const drafts: StoredArticleDraft[] = [];
	for (const key of Object.keys(localStorage)) {
		if (!belongsToAccount(key, accountId)) continue;
		// 存储读取失败要交给界面处理，只有损坏的单条记录可以跳过。
		const raw = localStorage.getItem(key);
		if (raw == null) continue;
		let value: unknown;
		try { value = JSON.parse(raw); } catch { continue; }
		const draft = parseDraft(value, key, accountId);
		if (draft) drafts.push({ key, raw, draft });
	}
	return drafts.sort((a, b) => b.draft.updatedAt.localeCompare(a.draft.updatedAt));
}

export function hasArticleDraftContent(draft: Partial<Pick<ArticleDraft, 'title' | 'summary' | 'text' | 'cover'>>): boolean {
	return !!draft.cover || [draft.title, draft.summary, draft.text].some(value =>
		typeof value === 'string' && value.replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu, '').length > 0);
}

export function writeArticleDraft(accountId: string, key: string, draft: ArticleDraft): string {
	if (!belongsToAccount(key, accountId)) throw new TypeError('Article draft key belongs to another account');
	if (!parseDraft(draft, key, accountId)) throw new TypeError('Invalid article draft');
	const raw = JSON.stringify(draft);
	localStorage.setItem(key, raw);
	return raw;
}

export function removeArticleDraft(key: string, expectedRaw: string): boolean {
	if (!key.startsWith(prefix)) throw new TypeError('Invalid article draft key');
	if (localStorage.getItem(key) !== expectedRaw) return false;
	localStorage.removeItem(key);
	return true;
}

export function createArticleDraftKey(accountId: string, articleId?: string): string {
	return `${accountPrefix(accountId)}:${articleId ? `edit:${articleId}:` : ''}${genId()}-${crypto.randomUUID()}`;
}
