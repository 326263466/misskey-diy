/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ArticleDraft } from '@/utility/article-drafts.js';
import { createArticleDraftKey, hasArticleDraftContent, listArticleDrafts, removeArticleDraft, writeArticleDraft } from '@/utility/article-drafts.js';

function draft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
	return { version: 1, title: 'Article', summary: '', text: '# Body', name: 'article-name', articleCategoryId: null, articleTags: [], cover: null, updatedAt: '2026-10-07T12:00:00.000Z', ...overrides };
}

beforeEach(() => {
	const values: Record<string, string> = {};
	vi.stubGlobal('localStorage', new Proxy({
		getItem: vi.fn((key: string) => values[key] ?? null),
		setItem: vi.fn((key: string, value: string) => { values[key] = value; }),
		removeItem: vi.fn((key: string) => { delete values[key]; }),
	}, { ownKeys: () => Object.keys(values), getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }) }));
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('keeps account boundaries exact and does not include post drafts', () => {
	const ownKey = createArticleDraftKey('alice');
	writeArticleDraft('alice', ownKey, draft());
	writeArticleDraft('alice-other', createArticleDraftKey('alice-other'), draft({ title: 'Other account' }));
	localStorage.setItem('drafts', JSON.stringify(draft({ title: 'Post draft' })));
	expect(listArticleDrafts('alice').map(item => item.key)).toEqual([ownKey]);
	expect(() => writeArticleDraft('alice', 'misskey:articleDraft:alice-other:one', draft())).toThrow(TypeError);
	expect(() => removeArticleDraft('drafts', localStorage.getItem('drafts')!)).toThrow(TypeError);
	expect(localStorage.getItem('drafts')).not.toBeNull();
});

test('restores legacy keys, inferred article IDs, and optional fields in timestamp order', () => {
	const legacy = { version: 1, title: 'Legacy', summary: '', text: '# Legacy', name: 'legacy-name' };
	localStorage.setItem('misskey:articleDraft:alice', JSON.stringify(legacy));
	localStorage.setItem('misskey:articleDraft:alice:edit:article-one', JSON.stringify({ ...legacy, updatedAt: '2026-10-06T12:00:00.000Z' }));
	localStorage.setItem('misskey:articleDraft:alice:edit:article-two:unique', JSON.stringify({ ...legacy, updatedAt: '2026-10-07T12:00:00.000Z', articleCategoryId: 'deleted-category', fileProtectionId: 'composer:legacy-id', cover: { id: 'cover', type: 'image/png', url: 'https://example.com/cover.png', thumbnailUrl: 'javascript:invalid' } }));
	const saved = listArticleDrafts('alice');
	expect(saved.map(item => item.draft.articleId)).toEqual(['article-two', 'article-one', undefined]);
	expect(saved[0].draft).toMatchObject({ articleCategoryId: 'deleted-category', fileProtectionId: 'composer:legacy-id', cover: { id: 'cover', isSensitive: false, thumbnailUrl: null } });
	expect(saved[2].draft).toMatchObject({ articleCategoryId: null, cover: null, updatedAt: '' });
	expect(saved[2].raw).toBe(JSON.stringify(legacy));
});

test('retains Unicode text at the legacy limits and cloud identity across local recovery', () => {
	const original = draft({
		name: '文章_Title', cloudId: 'saved-draft_1', cloudRevision: 12,
		title: '😀'.repeat(256), summary: '😀'.repeat(256), text: '😀'.repeat(100000), articleTags: ['😀'.repeat(100)],
	});
	writeArticleDraft('alice', createArticleDraftKey('alice'), original);
	expect(listArticleDrafts('alice')[0].draft).toEqual(original);
});

test('skips malformed drafts without deleting them and preserves text when a cover is invalid', () => {
	const invalid = [
		'{', JSON.stringify({ ...draft(), version: 2 }),
		JSON.stringify(draft({ title: 'x'.repeat(257) })), JSON.stringify(draft({ summary: 'x'.repeat(257) })),
		JSON.stringify(draft({ text: 'x'.repeat(100001) })), JSON.stringify(draft({ name: '../invalid' })),
	];
	invalid.forEach((raw, index) => localStorage.setItem(`misskey:articleDraft:alice:invalid-${index}`, raw));
	localStorage.setItem('misskey:articleDraft:alice:valid', JSON.stringify({ ...draft(), cover: { id: 'cover', type: 'image/png', url: 'https://example.com/cover.png', isSensitive: true } }));
	expect(listArticleDrafts('alice').map(item => item.draft)).toEqual([draft()]);
	expect(localStorage.removeItem).not.toHaveBeenCalled();
	invalid.forEach((raw, index) => expect(localStorage.getItem(`misskey:articleDraft:alice:invalid-${index}`)).toBe(raw));
});

test('ignores only whitespace and zero-width text when checking whether a draft has content', () => {
	expect(hasArticleDraftContent({})).toBe(false);
	expect(hasArticleDraftContent({ title: ' \t\n', summary: '\u200B\u200C\u200D', text: '\u2060\uFEFF\u3000' })).toBe(false);
	expect(hasArticleDraftContent({ title: ' a ' })).toBe(true);
	expect(hasArticleDraftContent({ summary: '.' })).toBe(true);
	expect(hasArticleDraftContent({ text: '👩‍💻' })).toBe(true);
	expect(hasArticleDraftContent({ cover: { id: 'cover' } as ArticleDraft['cover'] })).toBe(true);
});

test('removes only the matching revision and leaves independently saved drafts intact', () => {
	const key = createArticleDraftKey('alice');
	const otherKey = createArticleDraftKey('alice');
	const original = writeArticleDraft('alice', key, draft());
	const replacement = writeArticleDraft('alice', key, draft({ title: 'Newer editing' }));
	const other = writeArticleDraft('alice', otherKey, draft({ title: 'Separate editor' }));
	expect(removeArticleDraft(key, original)).toBe(false);
	expect(localStorage.getItem(key)).toBe(replacement);
	expect(removeArticleDraft(key, replacement)).toBe(true);
	expect(removeArticleDraft(key, replacement)).toBe(false);
	expect(localStorage.getItem(otherKey)).toBe(other);
});

test('generates different draft keys for concurrent editors even when their short IDs collide', async () => {
	const ids = await import('@/utility/id.js');
	vi.spyOn(ids, 'genId').mockReturnValue('same-time-and-counter');
	const keys = Array.from({ length: 4 }, () => createArticleDraftKey('alice', 'article-one'));
	expect(new Set(keys).size).toBe(keys.length);
	keys.forEach((key, index) => writeArticleDraft('alice', key, draft({ title: `Editor ${index}` })));
	expect(listArticleDrafts('alice')).toHaveLength(keys.length);
	expect(listArticleDrafts('alice').every(item => item.draft.articleId === 'article-one')).toBe(true);
});

test('propagates storage failures and leaves the prior draft intact when validation or saving fails', () => {
	const key = createArticleDraftKey('alice');
	const original = writeArticleDraft('alice', key, draft());
	expect(() => writeArticleDraft('alice', key, draft({ text: 'x'.repeat(100001) }))).toThrow(TypeError);
	expect(localStorage.getItem(key)).toBe(original);
	const quotaError = new Error('quota exceeded');
	vi.mocked(localStorage.setItem).mockImplementationOnce(() => { throw quotaError; });
	expect(() => writeArticleDraft('alice', key, draft({ title: 'New title' }))).toThrow(quotaError);
	expect(localStorage.getItem(key)).toBe(original);
	const readError = new Error('storage unavailable');
	vi.mocked(localStorage.getItem).mockImplementationOnce(() => { throw readError; });
	expect(() => listArticleDrafts('alice')).toThrow(readError);
	vi.mocked(localStorage.removeItem).mockImplementationOnce(() => { throw readError; });
	expect(() => removeArticleDraft(key, original)).toThrow(readError);
	expect(localStorage.getItem(key)).toBe(original);
});
