/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Blob } from 'node-fetch';
import { MiArticleComment } from '@/models/ArticleComment.js';
import { MiArticleFavorite } from '@/models/ArticleFavorite.js';
import { MiNote } from '@/models/Note.js';
import { MiPage } from '@/models/Page.js';
import { MiUser } from '@/models/User.js';
import { MiHashtag } from '@/models/Hashtag.js';
import { MiMeta } from '@/models/Meta.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { MiDriveFileReference } from '@/models/DriveFileReference.js';
import { DriveFileLifecycle1791215330183 } from '../../migration/1791215330183-DriveFileLifecycle.js';
import { CommentFeedbackImages1791547968366 } from '../../migration/1791547968366-CommentFeedbackImages.js';
import { api, castAsError, initTestDb, page, post, signup, uploadFile } from '../utils.js';
import type { entities } from 'misskey-js';

describe('Markdown article publication and listing', () => {
	let admin: entities.SignupResponse;
	let author: entities.SignupResponse;
	let reader: entities.SignupResponse;
	let originalCategories: { id: string; name: string }[];
	let first: entities.Page;
	let second: entities.Page;
	beforeAll(async () => {
		admin = await signup({ username: 'articleadmin' });
		author = await signup({ username: 'articleauthor' });
		reader = await signup({ username: 'articlereader' });
		originalCategories = (await api('admin/meta', {}, admin)).body.articleCategories;
		await page(author, { name: 'ordinary-page', title: 'MFM Page' });
		first = await page(author, { name: 'first-article', title: 'First article', summary: 'Summary', content: [{ id: 'body', type: 'markdown', text: '# First\n\n**Body**' }] });
		second = await page(author, { name: 'second-article', title: 'Second article', content: [{ id: 'body', type: 'markdown', text: '# Second' }] });
		await page(author, { name: 'mixed-page', title: 'Mixed Page', content: [{ id: 'body', type: 'markdown', text: '# Markdown' }, { id: 'extra', type: 'text', text: 'MFM' }] });
		await page(author, { name: 'invalid-markdown', title: 'Malformed', content: [{ id: 'body', type: 'markdown' } as never] });
	});

	test('lists only well-formed public articles for visitors, newest first, with cursor pagination', async () => {
		const listed = await api('articles/list', { userId: author.id });
		expect(listed.status).toBe(200);
		expect(listed.body.map(item => item.id)).toEqual([second.id, first.id]);
		const newest = await api('articles/list', { userId: author.id, limit: 1 });
		expect(newest.body.map(item => item.id)).toEqual([second.id]);
		const older = await api('articles/list', { userId: author.id, untilId: second.id });
		expect(older.body.map(item => item.id)).toEqual([first.id]);
		const newer = await api('articles/list', { userId: author.id, sinceId: first.id });
		expect(newer.body.map(item => item.id)).toEqual([second.id]);
	});

	test('shows Markdown and author metadata, updates only for the owner, and preserves the article identifier', async () => {
		const shown = await api('pages/show', { pageId: first.id });
		expect(shown.body.content).toEqual([{ id: 'body', type: 'markdown', text: '# First\n\n**Body**' }]);
		const data = { pageId: first.id, name: first.name, title: 'Updated', summary: 'New summary', content: [{ id: 'body', type: 'markdown', text: '# Updated' }], variables: [], script: '' };
		expect((await api('pages/update', data, reader)).status).toBe(400);
		expect((await api('pages/update', data, author)).status).toBe(204);
		const updated = await api('pages/show', { pageId: first.id });
		expect(updated.body).toMatchObject({ id: first.id, title: 'Updated', name: first.name, summary: 'New summary', content: [{ id: 'body', type: 'markdown', text: '# Updated' }] });
	});

	test("returns the signed-in reader's like state", async () => {
		expect((await api('pages/like', { pageId: second.id }, reader)).status).toBe(204);
		const list = await api('articles/list', { userId: author.id }, reader);
		expect(list.body.find(item => item.id === second.id)).toMatchObject({ isLiked: true, likedCount: 1 });
		expect((await api('pages/unlike', { pageId: second.id }, reader)).status).toBe(204);
	});

	test('ranks recommended articles by likes with stable ties and offset pagination independently of latest cursors', async () => {
		const params = { userId: author.id, sort: 'recommended' as const };
		expect((await api('articles/list', params)).body.map(item => item.id)).toEqual([second.id, first.id]);
		expect((await api('pages/like', { pageId: first.id }, reader)).status).toBe(204);
		try {
			expect((await api('articles/list', { ...params, limit: 1 })).body.map(item => item.id)).toEqual([first.id]);
			expect((await api('articles/list', { ...params, offset: 1, limit: 1, untilId: first.id })).body.map(item => item.id)).toEqual([second.id]);
			expect((await api('articles/list', { ...params, offset: 2 })).body).toEqual([]);
			expect((await api('articles/list', { userId: author.id, sort: 'latest' })).body.map(item => item.id)).toEqual([second.id, first.id]);
		} finally {
			await api('pages/unlike', { pageId: first.id }, reader);
		}
	});

	test('lists only followed authors for authenticated readers and applies muted-author filtering', async () => {
		await page(reader, { name: 'reader-article', title: 'Own article', content: [{ id: 'body', type: 'markdown', text: '# Own' }] });
		expect((await api('articles/list', { following: true })).body).toEqual([]);
		expect((await api('articles/list', { following: true }, reader)).body).toEqual([]);
		expect((await api('following/create', { userId: author.id }, reader)).status).toBe(200);
		try {
			expect((await api('articles/list', { following: true }, reader)).body.map(item => item.id)).toEqual([second.id, first.id]);
			expect((await api('articles/list', { following: true, sort: 'recommended', limit: 1, offset: 1 }, reader)).body.map(item => item.id)).toEqual([first.id]);
			expect((await api('mute/create', { userId: author.id }, reader)).status).toBe(204);
			expect((await api('articles/list', { following: true }, reader)).body).toEqual([]);
		} finally {
			await api('mute/delete', { userId: author.id }, reader);
			await api('following/delete', { userId: author.id }, reader);
		}
		expect((await api('articles/list', { following: true }, reader)).body).toEqual([]);
	});

	test('excludes muted and blocked authors for the current reader', async () => {
		expect((await api('mute/create', { userId: author.id }, reader)).status).toBe(204);
		expect((await api('articles/list', { userId: author.id }, reader)).body).toEqual([]);
		await api('mute/delete', { userId: author.id }, reader);
		await api('blocking/create', { userId: author.id }, reader);
		expect((await api('articles/list', { userId: author.id }, reader)).body).toEqual([]);
		await api('blocking/delete', { userId: author.id }, reader);
		await api('blocking/create', { userId: reader.id }, author);
		expect((await api('articles/list', { userId: author.id }, reader)).body).toEqual([]);
	});

	test('only administrators can configure ordered categories with unique identifiers and nonempty names', async () => {
		const categories = [{ id: 'category-one', name: ' 技术 ' }, { id: 'category-two', name: '分享' }];
		try {
			expect((await api('admin/update-meta', { articleCategories: categories }, author)).status).toBe(403);
			const duplicate = await api('admin/update-meta', { articleCategories: [categories[0], { ...categories[0], name: '重复' }] }, admin);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.code).toBe('INVALID_ARTICLE_CATEGORIES');
			expect((await api('admin/update-meta', { articleCategories: [{ id: 'category-one', name: '  ' }] }, admin)).status).toBe(400);
			for (const name of ['字'.repeat(11), '😀'.repeat(11), '技术\u0000']) {
				expect((await api('admin/update-meta', { articleCategories: [{ id: 'category-one', name }] }, admin)).status).toBe(400);
			}
			expect((await api('admin/meta', {}, admin)).body.articleCategories).toEqual(originalCategories);
			expect((await api('admin/update-meta', { articleCategories: categories }, admin)).status).toBe(204);
			const normalized = [{ id: 'category-one', name: '技术' }, categories[1]];
			expect((await api('admin/meta', {}, admin)).body.articleCategories).toEqual(normalized);
			expect((await api('meta', {})).body.articleCategories).toEqual(normalized);
		} finally {
			await api('admin/update-meta', { articleCategories: originalCategories }, admin);
		}
	});

	test('persists article categories, preserves them on partial updates and renames, and clears deleted categories', async () => {
		const category = { id: 'article-category', name: '技术交流' };
		try {
			expect((await api('admin/update-meta', { articleCategories: [category] }, admin)).status).toBe(204);
			const article = await page(author, { name: 'categorized-article', title: 'Category article', articleCategoryId: category.id, content: [{ id: 'body', type: 'markdown', text: '# Category' }] });
			expect(article.articleCategoryId).toBe(category.id);
			expect((await api('articles/list', { categoryId: category.id })).body.map(item => item.id)).toEqual([article.id]);
			expect((await api('pages/update', { pageId: article.id, articleCategoryId: null }, reader)).status).toBe(400);
			expect((await api('pages/update', { pageId: article.id, title: 'Updated category article' }, author)).status).toBe(204);
			expect((await api('pages/show', { pageId: article.id })).body.articleCategoryId).toBe(category.id);

			const invalidCreate = await api('pages/create', { title: 'Invalid', name: 'invalid-category', content: [], variables: [], script: '', articleCategoryId: 'missing-category' }, author);
			expect(invalidCreate.status).toBe(400);
			expect(castAsError(invalidCreate.body as any).error.code).toBe('NO_SUCH_ARTICLE_CATEGORY');
			const invalidUpdate = await api('pages/update', { pageId: article.id, articleCategoryId: 'missing-category', title: 'Must not save' }, author);
			expect(invalidUpdate.status).toBe(400);
			expect(castAsError(invalidUpdate.body as any).error.code).toBe('NO_SUCH_ARTICLE_CATEGORY');
			expect((await api('pages/show', { pageId: article.id })).body).toMatchObject({ title: 'Updated category article', articleCategoryId: category.id });

			expect((await api('admin/update-meta', { articleCategories: [{ ...category, name: '开发交流' }] }, admin)).status).toBe(204);
			expect((await api('articles/list', { categoryId: category.id })).body.map(item => item.id)).toEqual([article.id]);
			expect((await api('pages/update', { pageId: article.id, articleCategoryId: null }, author)).status).toBe(204);
			expect((await api('pages/show', { pageId: article.id })).body.articleCategoryId).toBeNull();
			expect((await api('pages/update', { pageId: article.id, articleCategoryId: category.id }, author)).status).toBe(204);
			expect((await api('admin/update-meta', { articleCategories: [] }, admin)).status).toBe(204);
			expect((await api('pages/show', { pageId: article.id })).body.articleCategoryId).toBeNull();
			expect((await api('articles/list', { categoryId: category.id })).body).toEqual([]);
			expect((await api('articles/list', {})).body.some(item => item.id === article.id)).toBe(true);
		} finally {
			await api('admin/update-meta', { articleCategories: originalCategories }, admin);
		}
	});

	test('persists article tags independently of posts, normalizes filtering, and preserves them for older editors', async () => {
		const owner = await signup({ username: 'articletagsowner' });
		const article = await page(owner, {
			name: 'article-with-tags', title: 'Tagged article', articleTags: [' Vue ', 'TypeScript', '生活'],
			content: [{ id: 'body', type: 'markdown', text: '# Tagged' }],
		});
		expect(article.articleTags).toEqual(['vue', 'typescript', '生活']);
		expect(article.content[0]).toMatchObject({ articleTags: article.articleTags });
		expect((await api('articles/list', { tag: 'ＶＵＥ', userId: owner.id })).body.map(item => item.id)).toEqual([article.id]);
		expect((await api('articles/list', { tag: 'absent-tag', userId: owner.id })).body).toEqual([]);
		expect((await api('users/notes', { userId: owner.id })).body).toEqual([]);
		expect((await api('pages/update', { pageId: article.id, articleTags: ['other'] }, reader)).status).toBe(400);
		expect((await api('pages/update', { pageId: article.id, title: 'Changed title' }, owner)).status).toBe(204);
		expect((await api('pages/update', { pageId: article.id, content: [{ id: 'body', type: 'markdown', text: '# New body' }] }, owner)).status).toBe(204);
		expect((await api('pages/show', { pageId: article.id })).body.articleTags).toEqual(article.articleTags);
		expect((await api('pages/update', {
			pageId: article.id, articleTags: ['后端'], content: [{ id: 'body', type: 'markdown', text: '# New body', articleTags: ['ignored'] }],
		}, owner)).status).toBe(204);
		const updated = (await api('pages/show', { pageId: article.id })).body;
		expect(updated.articleTags).toEqual(['后端']);
		expect(updated.content[0]).toMatchObject({ articleTags: updated.articleTags });
		expect((await api('pages/update', { pageId: article.id, articleTags: [] }, owner)).status).toBe(204);
		expect((await api('pages/show', { pageId: article.id })).body.articleTags).toEqual([]);
	});

	test('rejects invalid article tags and cannot bypass the limit through Markdown block metadata', async () => {
		const owner = await signup({ username: 'articletagscheck' });
		const article = await page(owner, { name: 'validated-tags', title: 'Original', articleTags: ['技术'], content: [{ id: 'body', type: 'markdown', text: '# Body' }] });
		for (const tags of [['one', 'two', 'three', 'four'], ['Vue', ' ＶＵＥ '], [' '], ['x'.repeat(101)], ['\u0000'], ['unlisted-article-tag']]) {
			expect((await api('pages/update', { pageId: article.id, title: 'Must not save', articleTags: tags }, owner)).status).toBe(400);
		}
		for (const articleTags of [['one', 'two', 'three', 'four'], ['Vue', 'vue'], ['\u0000'], ['unlisted-article-tag'], null, 'tag']) {
			const result = await api('pages/update', { pageId: article.id, title: 'Must not save', content: [{ id: 'body', type: 'markdown', text: '# Invalid', articleTags }] as never }, owner);
			expect(result.status).toBe(400);
			expect(castAsError(result.body as any).error.code).toBe('INVALID_ARTICLE_TAGS');
		}
		expect((await api('pages/show', { pageId: article.id })).body).toMatchObject({ title: 'Original', articleTags: ['技术'] });
		expect((await api('articles/list', { tag: '\u0000' })).status).toBe(400);
		const invalidCreate = await api('pages/create', { title: 'Invalid', name: 'invalid-tagged-article', content: [{ id: 'body', type: 'markdown', text: '# Body', articleTags: ['one', 'two', 'three', 'four'] }], variables: [], script: '' }, owner);
		expect(invalidCreate.status).toBe(400);
		expect(castAsError(invalidCreate.body as any).error.code).toBe('INVALID_ARTICLE_TAGS');
		const ordinary = await page(owner, { name: 'not-an-article', title: 'Ordinary Page' });
		expect(ordinary.articleTags).toEqual([]);
		expect((await api('pages/update', { pageId: ordinary.id, articleTags: ['article-only'] }, owner)).status).toBe(400);
	});

	test('lets only admins configure searchable tags and preserves removed tags on existing articles', async () => {
		const owner = await signup({ username: 'articleexistingtag' });
		const db = await initTestDb(true);
		const originalTags = (await api('admin/meta', {}, admin)).body.articleTags;
		try {
			await db.getRepository(MiHashtag).insert({ id: owner.id, name: 'stored-tag' });
			expect((await api('articles/tags', { query: 'stored-tag' })).body).toEqual([]);
			expect((await api('admin/update-meta', { articleTags: [] }, owner)).status).toBe(403);
			expect((await api('admin/update-meta', { articleTags: ['vue', ' ＶＵＥ '] }, admin)).status).toBe(400);
			expect((await api('admin/update-meta', { articleTags: [' '] }, admin)).status).toBe(400);
			expect((await api('admin/update-meta', { articleTags: ['x'.repeat(101)] }, admin)).status).toBe(400);
			expect((await api('admin/update-meta', { articleTags: ['x'.repeat(11)] }, admin)).status).toBe(400);
			expect((await api('admin/update-meta', { articleTags: [...originalTags, ' Stored-Tag '] }, admin)).status).toBe(204);
			expect((await api('admin/meta', {}, admin)).body.articleTags).toContain('stored-tag');
			expect((await api('articles/tags', { limit: 3 })).body).toEqual(originalTags.slice(0, 3));
			expect((await api('articles/tags', { query: 'a', limit: 1 })).body).toHaveLength(1);
			expect((await api('articles/tags', { query: 'stored-tag' })).body).toEqual(['stored-tag']);
			const article = await page(owner, { name: 'existing-tag-article', title: 'Existing', articleTags: ['stored-tag'], content: [{ id: 'body', type: 'markdown', text: '# Body' }] });
			expect((await api('admin/update-meta', { articleTags: [] }, admin)).status).toBe(204);
			expect((await api('articles/tags', { query: 'stored-tag' })).body).toEqual([]);
			expect((await api('articles/tags', { query: 'vue' })).body).toEqual([]);
			expect(await db.getRepository(MiHashtag).existsBy({ id: owner.id })).toBe(true);
			expect((await api('pages/update', { pageId: article.id, title: 'Preserved', articleTags: ['stored-tag'] }, owner)).status).toBe(204);
			expect((await api('pages/show', { pageId: article.id })).body.articleTags).toEqual(['stored-tag']);
			const unknown = await api('pages/create', { title: 'New', name: 'unknown-tag-article', articleTags: ['stored-tag'], content: [{ id: 'body', type: 'markdown', text: '# Body' }], variables: [], script: '' }, owner);
			expect(castAsError(unknown.body as any).error.code).toBe('INVALID_ARTICLE_TAGS');
		} finally {
			await api('admin/update-meta', { articleTags: originalTags }, admin);
			await db.destroy();
		}
	});

	test('lets administrators add, rename and delete individual tags without replacing the other tags', async () => {
		const originalTags = (await api('admin/meta', {}, admin)).body.articleTags;
		try {
			expect((await api('admin/update-meta', { articleTags: ['keep-me', 'old-tag'] }, admin)).status).toBe(204);
			expect((await api('admin/article-tags/update', { action: 'create', name: 'forbidden' })).status).toBe(401);
			expect((await api('admin/article-tags/update', { action: 'delete', name: 'keep-me' }, author)).status).toBe(403);
			const added = await api('admin/article-tags/update', { action: 'create', name: ' ＮＥＷ-ＴＡＧ ' }, admin);
			expect(added.status).toBe(200);
			expect(added.body).toEqual(['keep-me', 'old-tag', 'new-tag']);
			const duplicate = await api('admin/article-tags/update', { action: 'create', name: ' New-Tag ' }, admin);
			expect(castAsError(duplicate.body as any).error.code).toBe('ARTICLE_TAG_ALREADY_EXISTS');
			const collision = await api('admin/article-tags/update', { action: 'update', name: 'old-tag', newName: 'new-tag' }, admin);
			expect(castAsError(collision.body as any).error.code).toBe('ARTICLE_TAG_ALREADY_EXISTS');
			const renamed = await api('admin/article-tags/update', { action: 'update', name: 'old-tag', newName: ' Renamed ' }, admin);
			expect(renamed.status).toBe(200);
			expect(renamed.body).toEqual(['keep-me', 'renamed', 'new-tag']);
			expect((await api('articles/tags', { query: 'renamed' })).body).toEqual(['renamed']);
			expect((await api('articles/tags', { query: 'old-tag' })).body).toEqual([]);
			const removed = await api('admin/article-tags/update', { action: 'delete', name: 'renamed' }, admin);
			expect(removed.status).toBe(200);
			expect(removed.body).toEqual(['keep-me', 'new-tag']);
			const stale = await api('admin/article-tags/update', { action: 'update', name: 'renamed', newName: 'stale' }, admin);
			expect(castAsError(stale.body as any).error.code).toBe('NO_SUCH_ARTICLE_TAG');
			expect((await api('admin/meta', {}, admin)).body.articleTags).toEqual(['keep-me', 'new-tag']);
		} finally {
			await api('admin/update-meta', { articleTags: originalTags }, admin);
		}
	});

	test('validates individual tags after normalization and leaves stored tags unchanged on failure', async () => {
		const originalTags = (await api('admin/meta', {}, admin)).body.articleTags;
		try {
			for (const name of [' ', '\u0000', 'x'.repeat(11), '😀'.repeat(11), '㍿'.repeat(3)]) {
				expect((await api('admin/article-tags/update', { action: 'create', name }, admin)).status).toBe(400);
			}
			expect((await api('admin/article-tags/update', { action: 'update', name: originalTags[0] }, admin)).status).toBe(400);
			expect((await api('admin/meta', {}, admin)).body.articleTags).toEqual(originalTags);
			const full = Array.from({ length: 500 }, (_, i) => `tag-${i}`);
			expect((await api('admin/update-meta', { articleTags: full }, admin)).status).toBe(204);
			const overflow = await api('admin/article-tags/update', { action: 'create', name: 'extra-tag' }, admin);
			expect(castAsError(overflow.body as any).error.code).toBe('TOO_MANY_ARTICLE_TAGS');
			expect((await api('admin/meta', {}, admin)).body.articleTags).toEqual(full);
		} finally {
			await api('admin/update-meta', { articleTags: originalTags }, admin);
		}
	});

	test('keeps legacy category and tag names unchanged while rejecting new or renamed overlong names', async () => {
		const db = await initTestDb(true);
		const saved = (await api('admin/meta', {}, admin)).body;
		const storedMeta = await db.getRepository(MiMeta).findOneByOrFail({});
		const legacyCategory = { id: 'legacy-category', name: '旧'.repeat(11) };
		const legacyTag = 'legacy-tag-name';
		try {
			await db.getRepository(MiMeta).update(storedMeta.id, { articleCategories: [legacyCategory], articleTags: [legacyTag] });
			expect((await api('admin/update-meta', { articleCategories: [legacyCategory], articleTags: [legacyTag, '😀'.repeat(10)] }, admin)).status).toBe(204);
			expect((await api('articles/tags', { query: 'legacy' })).body).toEqual([]);
			for (const name of ['字'.repeat(11), '😀'.repeat(11)]) {
				expect((await api('admin/update-meta', { articleCategories: [{ ...legacyCategory, name }] }, admin)).status).toBe(400);
				expect((await api('admin/article-tags/update', { action: 'update', name: legacyTag, newName: name }, admin)).status).toBe(400);
			}
			const current = (await api('admin/meta', {}, admin)).body;
			expect(current.articleCategories).toEqual([legacyCategory]);
			expect(current.articleTags).toEqual([legacyTag, '😀'.repeat(10)]);
			expect((await api('admin/article-tags/update', { action: 'update', name: legacyTag, newName: ' TypeScript ' }, admin)).body).toEqual(['typescript', '😀'.repeat(10)]);
			expect((await api('admin/update-meta', { articleCategories: [{ ...legacyCategory, name: '😀'.repeat(10) }] }, admin)).status).toBe(204);
		} finally {
			await db.getRepository(MiMeta).update(storedMeta.id, { articleCategories: saved.articleCategories, articleTags: saved.articleTags });
			await api('admin/meta', {}, admin);
			await db.destroy();
		}
	});

	test('merges concurrent tag operations against the database and does not restore deleted defaults', async () => {
		const originalTags = (await api('admin/meta', {}, admin)).body.articleTags;
		try {
			expect((await api('admin/update-meta', { articleTags: ['vue'] }, admin)).status).toBe(204);
			const results = await Promise.all([
				api('admin/article-tags/update', { action: 'create', name: 'first-tag' }, admin),
				api('admin/article-tags/update', { action: 'create', name: 'second-tag' }, admin),
				api('admin/article-tags/update', { action: 'delete', name: 'vue' }, admin),
			]);
			expect(results.map(result => result.status)).toEqual([200, 200, 200]);
			expect((await api('admin/meta', {}, admin)).body.articleTags.sort()).toEqual(['first-tag', 'second-tag']);
			const renames = await Promise.all([
				api('admin/article-tags/update', { action: 'update', name: 'first-tag', newName: 'rename-one' }, admin),
				api('admin/article-tags/update', { action: 'update', name: 'first-tag', newName: 'rename-two' }, admin),
			]);
			expect(renames.map(result => result.status).sort()).toEqual([200, 400]);
			const stored = (await api('admin/meta', {}, admin)).body.articleTags;
			expect(stored).toContain('second-tag');
			expect(stored).toHaveLength(2);
			await Promise.all(stored.map(name => api('admin/article-tags/update', { action: 'delete', name }, admin)));
			expect((await api('admin/update-meta', { articleCategories: originalCategories }, admin)).status).toBe(204);
			expect((await api('admin/meta', {}, admin)).body.articleTags).toEqual([]);
			expect((await api('articles/tags', { query: 'vue' })).body).toEqual([]);
		} finally {
			await api('admin/update-meta', { articleTags: originalTags }, admin);
		}
	});

	test('preserves unverified uploads from a deleted page cover, blocks, Markdown, variables and script', async () => {
		const owner = await signup({ username: 'articlemediaowner' });
		const upload = async (user = owner) => {
			const result = await uploadFile(user, { blob: new Blob([crypto.randomUUID()], { type: 'text/plain' }), name: 'article-media.txt' });
			expect(result.status).toBe(200);
			return result.body!;
		};
		const [cover, block, markdown, variable, script, unused, foreign] = await Promise.all([
			upload(), upload(), upload(), upload(), upload(), upload(), upload(reader),
		]);
		const article = await page(owner, {
			name: 'delete-all-owned-media', title: 'Delete page media', eyeCatchingImageId: cover.id,
			content: [{ id: 'section', type: 'section', title: 'Media', children: [
				{ id: 'image', type: 'image', fileId: block.id },
				{ id: 'markdown', type: 'markdown', text: `[own](${markdown.url}) [foreign](${foreign.url})` },
			] }],
			variables: [{ value: variable.url }], script: `let image = "${script.url}"`,
		});
		expect((await api('pages/delete', { pageId: article.id }, reader)).status).toBe(400);
		expect((await api('drive/files/show', { fileId: cover.id }, owner)).status).toBe(200);
		expect((await api('pages/delete', { pageId: article.id }, owner)).status).toBe(204);
		for (const file of [cover, block, markdown, variable, script]) {
			expect((await api('drive/files/show', { fileId: file.id }, owner)).status).toBe(200);
		}
		expect((await api('drive/files/show', { fileId: unused.id }, owner)).status).toBe(200);
		expect((await api('drive/files/show', { fileId: foreign.id }, reader)).status).toBe(200);
	});

	test('preserves deleted-article uploads still used by posts, other articles, clips and saved settings', async () => {
		const owner = await signup({ username: 'articlesharedmedia' });
		const upload = async () => {
			const result = await uploadFile(owner, { blob: new Blob([crypto.randomUUID()], { type: 'text/plain' }), name: 'shared-media.txt' });
			expect(result.status).toBe(200);
			return result.body!;
		};
		const [inPost, inArticle, inClip, inSettings] = await Promise.all([upload(), upload(), upload(), upload()]);
		const article = await page(owner, {
			name: 'delete-shared-media', title: 'Delete shared media', eyeCatchingImageId: inPost.id,
			content: [{ id: 'body', type: 'markdown', text: `[article](${inArticle.url}) [clip](${inClip.url}) [settings](${inSettings.url})` }],
		});
		await post(owner, { text: `[keep](${inPost.url})` });
		await page(owner, { name: 'keep-shared-media', title: 'Keep shared media', content: [{ id: 'body', type: 'markdown', text: `[keep](${new URL(inArticle.url).pathname})` }] });
		expect((await api('clips/create', { name: 'Keep media', description: `[keep](${inClip.url})` }, owner)).status).toBe(200);
		expect((await api('i/registry/set', { key: 'wallpaper', value: inSettings.url, scope: ['client', 'preferences'] }, owner)).status).toBe(204);
		expect((await api('pages/delete', { pageId: article.id }, owner)).status).toBe(204);
		for (const file of [inPost, inArticle, inClip, inSettings]) {
			expect((await api('drive/files/show', { fileId: file.id }, owner)).status).toBe(200);
		}
	});

	test('preserves uploads linked with query strings, fragments or URL substrings while usage is unverified', async () => {
		const owner = await signup({ username: 'articleexactmedia' });
		const upload = async () => {
			const result = await uploadFile(owner, { blob: new Blob([crypto.randomUUID()], { type: 'text/plain' }), name: 'exact-media.txt' });
			expect(result.status).toBe(200);
			return result.body!;
		};
		const [absolute, relative, suffix, nested, encoded, relativeSuffix] = await Promise.all([upload(), upload(), upload(), upload(), upload(), upload()]);
		const article = await page(owner, {
			name: 'delete-exact-media', title: 'Delete exact resources',
			content: [{ id: 'body', type: 'markdown', text: [
				`[absolute](${absolute.url}?download=1#preview)`,
				`[relative](${new URL(relative.url).pathname}?download=1#preview)`,
				`[suffix](${suffix.url}.bak)`,
				`[nested](https://external.test/?example=${nested.url})`,
				`[encoded](https://external.test/?example=${encodeURIComponent(`"${encoded.url}"`)})`,
				`[relative suffix](${new URL(relativeSuffix.url).pathname}.bak)`,
			].join('\n') }],
		});
		expect((await api('pages/delete', { pageId: article.id }, owner)).status).toBe(204);
		for (const file of [absolute, relative, suffix, nested, encoded, relativeSuffix]) {
			expect((await api('drive/files/show', { fileId: file.id }, owner)).status).toBe(200);
		}
	});

	test('does not retain a deleted category when article creation or assignment happens concurrently', async () => {
		const category = { id: 'concurrent-category', name: '并发分类' };
		try {
			expect((await api('admin/update-meta', { articleCategories: [category] }, admin)).status).toBe(204);
			const [created, assigned, removed] = await Promise.all([
				api('pages/create', { title: 'Concurrent', name: 'concurrent-category', content: [], variables: [], script: '', articleCategoryId: category.id }, author),
				api('pages/update', { pageId: first.id, articleCategoryId: category.id }, author),
				api('admin/update-meta', { articleCategories: [] }, admin),
			]);
			expect(removed.status).toBe(204);
			expect([200, 400]).toContain(created.status);
			expect([204, 400]).toContain(assigned.status);
			if (created.status === 200) {
				expect((await api('pages/show', { pageId: created.body.id })).body.articleCategoryId).toBeNull();
			} else {
				expect(castAsError(created.body as any).error.code).toBe('NO_SUCH_ARTICLE_CATEGORY');
			}
			if (assigned.status === 400) expect(castAsError(assigned.body as any).error.code).toBe('NO_SUCH_ARTICLE_CATEGORY');
			expect((await api('pages/show', { pageId: first.id })).body.articleCategoryId).toBeNull();
		} finally {
			await api('admin/update-meta', { articleCategories: originalCategories }, admin);
		}
	});

	describe('article interactions', () => {
		let db: Awaited<ReturnType<typeof initTestDb>>;
		let owner: entities.SignupResponse;
		let commenter: entities.SignupResponse;
		let stranger: entities.SignupResponse;
		beforeAll(async () => {
			db = await initTestDb(true);
			const runner = db.createQueryRunner();
			try {
				await new DriveFileLifecycle1791215330183().installTracking(runner);
				await new CommentFeedbackImages1791547968366().installTracking(runner);
			} finally { await runner.release(); }
			owner = await signup({ username: 'artintowner' });
			commenter = await signup({ username: 'artintreader' });
			stranger = await signup({ username: 'artintstranger' });
			for (const user of [owner, commenter, stranger]) {
				expect(user).toMatchObject({ id: expect.any(String), token: expect.any(String) });
			}
		});
		afterAll(async () => { await db?.destroy(); });
		const createArticle = (name: string) => page(owner, { name, title: name, content: [{ id: 'body', type: 'markdown', text: '# Article' }] });

		test('aggregates public author article statistics without exposing private, malformed or filtered articles', async () => {
			const statsOwner = await signup({ username: 'articlestatsowner' });
			const params = { userId: statsOwner.id };
			const empty = { articlesCount: 0, articleViewsCount: 0 };
			expect((await api('articles/stats', params)).body).toEqual(empty);
			const publish = (name: string) => page(statsOwner, { name, title: name, content: [{ id: 'body', type: 'markdown', text: '# Article' }] });
			const one = await publish('stats-public-one');
			const two = await publish('stats-public-two');
			const privateArticle = await publish('stats-private');
			await page(statsOwner, { name: 'stats-ordinary', title: 'Ordinary page' });
			await page(statsOwner, { name: 'stats-malformed', title: 'Malformed', content: [{ id: 'body', type: 'markdown' } as never] });
			await db.getRepository(MiPage).update(one.id, { articleViews: 7 });
			await db.getRepository(MiPage).update(two.id, { articleViews: 11 });
			await db.getRepository(MiPage).update(privateArticle.id, { articleViews: 1000, visibility: 'specified', visibleUserIds: [commenter.id] });
			const visible = { articlesCount: 2, articleViewsCount: 18 };
			expect((await api('articles/stats', params)).body).toEqual(visible);
			expect((await api('articles/stats', params, commenter)).body).toEqual(visible);
			try {
				expect((await api('mute/create', { userId: statsOwner.id }, commenter)).status).toBe(204);
				expect((await api('articles/stats', params, commenter)).body).toEqual(empty);
				await api('mute/delete', { userId: statsOwner.id }, commenter);
				await api('blocking/create', { userId: commenter.id }, statsOwner);
				expect((await api('articles/stats', params, commenter)).body).toEqual(empty);
				await api('blocking/delete', { userId: commenter.id }, statsOwner);
				await db.getRepository(MiUser).update(statsOwner.id, { isSuspended: true });
				expect((await api('articles/stats', params)).body).toEqual(empty);
				await db.getRepository(MiUser).update(statsOwner.id, { isSuspended: false, isDeleted: true });
				expect((await api('articles/stats', params)).body).toEqual(empty);
			} finally {
				await db.getRepository(MiUser).update(statsOwner.id, { isSuspended: false, isDeleted: false });
				await api('mute/delete', { userId: statsOwner.id }, commenter);
				await api('blocking/delete', { userId: commenter.id }, statsOwner);
			}
		});

		test('counts article readers once during concurrent views and excludes owners and listing', async () => {
			const article = await createArticle('reader-count');
			expect(article.articleViews).toBe(0);
			expect((await api('pages/show', { pageId: article.id }, commenter)).body.articleViews).toBe(0);
			expect((await api('articles/list', { userId: owner.id }, commenter)).body.find(item => item.id === article.id)?.articleViews).toBe(0);
			expect((await api('articles/show', { articleId: article.id }, owner)).body.article.articleViews).toBe(0);
			const views = await Promise.all([
				api('articles/show', { articleId: article.id }, commenter),
				api('articles/show', { articleId: article.id }, commenter),
			]);
			expect(views.map(view => view.status)).toEqual([200, 200]);
			expect((await api('pages/show', { pageId: article.id }, commenter)).body.articleViews).toBe(1);
			expect((await api('articles/show', { articleId: article.id }, stranger)).body.article.articleViews).toBe(2);
			expect((await api('articles/show', { articleId: article.id }, owner)).body.article.articleViews).toBe(2);
			expect((await api('articles/show', { articleId: article.id }, commenter)).body.article.articleViews).toBe(2);
			expect((await api('articles/list', { userId: owner.id }, commenter)).body.find(item => item.id === article.id)?.articleViews).toBe(2);
		});

		test('评论图片保存、权限校验和引用清理', async () => {
			const article = await createArticle('comment-images');
			const image = (await uploadFile(commenter, { isManaged: true })).body!;
			const input = { articleId: article.id, text: '', fileIds: [image.id] };
			const created = await api('articles/comments/create', input, commenter);
			expect(created.status).toBe(200);
			expect(created.body.files.map(file => file.id)).toEqual([image.id]);
			expect((await api('articles/comments', { articleId: article.id })).body[0].files.map(file => file.id)).toEqual([image.id]);
			expect(await db.getRepository(MiDriveFileReference).existsBy({ fileId: image.id, sourceType: 'article_comment', sourceId: created.body.id })).toBe(true);
			expect(castAsError((await api('articles/comments/create', input, stranger)).body).error.code).toBe('INVALID_FILES');
			expect((await api('articles/comments/create', { ...input, fileIds: [] }, commenter)).status).toBe(400);
			const uploadedText = await uploadFile(commenter, { name: 'document.txt', blob: new Blob(['document'], { type: 'text/plain' }) });
			expect(uploadedText.status).toBe(200);
			const textFile = uploadedText.body!;
			expect(castAsError((await api('articles/comments/create', { ...input, fileIds: [textFile.id] }, commenter)).body).error.code).toBe('INVALID_FILES');
			await db.getRepository(MiDriveFile).update(textFile.id, { deletingAt: new Date() });
			expect((await api('articles/comments/create', { ...input, fileIds: [textFile.id] }, commenter)).status).toBe(400);
			expect((await api('articles/comments/delete', { commentId: created.body.id }, commenter)).status).toBe(204);
			expect(await db.getRepository(MiDriveFileReference).existsBy({ fileId: image.id, sourceType: 'article_comment' })).toBe(false);
		});

		test('paginates independent comments and replies without publishing notes', async () => {
			const article = await createArticle('comment-pagination');
			const other = await createArticle('comment-other');
			const before = await db.getRepository(MiNote).count();
			const firstComment = await api('articles/comments/create', { articleId: article.id, text: ' First comment ' }, commenter);
			expect(firstComment.status).toBe(200);
			expect(firstComment.body).toMatchObject({ articleId: article.id, text: 'First comment', user: { id: commenter.id }, canDelete: true, replyId: null, repliesCount: 0, replyTo: null });
			const reply = await api('articles/comments/create', { articleId: article.id, text: 'Reply', replyId: firstComment.body.id }, owner);
			expect(reply.status).toBe(200);
			expect(reply.body.replyTo).toMatchObject({ id: firstComment.body.id, user: { id: commenter.id }, text: 'First comment' });
			const newest = await api('articles/comments', { articleId: article.id, limit: 1 });
			expect(newest.body.map(comment => comment.id)).toEqual([reply.body.id]);
			const older = await api('articles/comments', { articleId: article.id, limit: 1, untilId: reply.body.id });
			expect(older.body.map(comment => comment.id)).toEqual([firstComment.body.id]);
			expect((await api('articles/show', { articleId: article.id })).body.commentsCount).toBe(2);
			const secondReply = await api('articles/comments/create', { articleId: article.id, text: 'Second reply', replyId: firstComment.body.id }, owner);
			const nestedReply = await api('articles/comments/create', { articleId: article.id, text: 'Nested reply', replyId: reply.body.id }, commenter);
			const secondParent = await api('articles/comments/create', { articleId: article.id, text: 'Second parent' }, commenter);
			expect([secondReply.status, nestedReply.status, secondParent.status]).toEqual([200, 200, 200]);
			const newestParent = await api('articles/comments', { articleId: article.id, replyId: null, limit: 1 });
			expect(newestParent.body.map(comment => comment.id)).toEqual([secondParent.body.id]);
			const olderParent = await api('articles/comments', { articleId: article.id, replyId: null, limit: 1, untilId: secondParent.body.id });
			expect(olderParent.body).toMatchObject([{ id: firstComment.body.id, replyId: null, repliesCount: 2 }]);
			const newestReply = await api('articles/comments', { articleId: article.id, replyId: firstComment.body.id, limit: 1 });
			expect(newestReply.body).toMatchObject([{ id: secondReply.body.id, replyId: firstComment.body.id, repliesCount: 0 }]);
			const olderReply = await api('articles/comments', { articleId: article.id, replyId: firstComment.body.id, limit: 1, untilId: secondReply.body.id });
			expect(olderReply.body).toMatchObject([{ id: reply.body.id, replyId: firstComment.body.id, repliesCount: 1 }]);
			const nestedReplies = await api('articles/comments', { articleId: article.id, replyId: reply.body.id });
			expect(nestedReplies.body).toMatchObject([{ id: nestedReply.body.id, replyId: reply.body.id, replyTo: { id: reply.body.id } }]);
			expect((await api('articles/comments', { articleId: other.id, replyId: firstComment.body.id })).body).toEqual([]);
			expect(await db.getRepository(MiNote).count()).toBe(before);
			expect((await api('articles/comments/create', { articleId: other.id, text: 'Wrong article', replyId: firstComment.body.id }, commenter)).status).toBe(400);
			expect((await api('articles/comments/create', { articleId: article.id, text: '   ' }, commenter)).status).toBe(400);
		});

		test('allows only the commenter, article owner or moderator to delete and retains replies', async () => {
			const article = await createArticle('comment-delete');
			const created = await api('articles/comments/create', { articleId: article.id, text: 'Parent' }, commenter);
			const reply = await api('articles/comments/create', { articleId: article.id, text: 'Keep reply', replyId: created.body.id }, owner);
			const nestedReply = await api('articles/comments/create', { articleId: article.id, text: 'Keep nested reply', replyId: reply.body.id }, commenter);
			expect((await api('articles/comments/delete', { commentId: created.body.id }, stranger)).status).toBe(400);
			expect((await api('articles/comments/delete', { commentId: created.body.id }, commenter)).status).toBe(204);
			const list = await api('articles/comments', { articleId: article.id, replyId: null });
			expect(list.body).toMatchObject([{ id: reply.body.id, text: 'Keep reply', replyId: null, repliesCount: 1, replyTo: null }]);
			expect((await api('articles/comments', { articleId: article.id, replyId: reply.body.id })).body).toMatchObject([{ id: nestedReply.body.id }]);
			const authorModerated = await api('articles/comments/create', { articleId: article.id, text: 'Owner can delete' }, commenter);
			expect((await api('articles/comments/delete', { commentId: authorModerated.body.id }, owner)).status).toBe(204);
			expect((await api('articles/comments/delete', { commentId: reply.body.id }, admin)).status).toBe(204);
			expect((await api('articles/comments', { articleId: article.id, replyId: null })).body).toMatchObject([{ id: nestedReply.body.id, replyId: null, repliesCount: 0, replyTo: null }]);
			expect((await api('articles/comments/delete', { commentId: nestedReply.body.id }, commenter)).status).toBe(204);
			expect((await api('articles/show', { articleId: article.id })).body.commentsCount).toBe(0);
		});

		test('keeps likes and favorites unique under retries and concurrent requests', async () => {
			const article = await createArticle('article-idempotency');
			const favorites = await Promise.all(Array.from({ length: 3 }, () => api('articles/favorite', { articleId: article.id, favorited: true }, commenter)));
			expect(favorites.every(result => result.status === 200 && result.body.isFavorited)).toBe(true);
			expect(await db.getRepository(MiArticleFavorite).countBy({ articleId: article.id, userId: commenter.id })).toBe(1);
			expect((await api('articles/show', { articleId: article.id }, commenter)).body.isFavorited).toBe(true);
			const likes = await Promise.all(Array.from({ length: 3 }, () => api('articles/like', { articleId: article.id, liked: true }, commenter)));
			expect(likes.every(result => result.status === 200 && result.body.likedCount === 1)).toBe(true);
			expect((await api('pages/like', { pageId: article.id }, commenter)).status).toBe(400);
			expect((await api('articles/like', { articleId: article.id, liked: true }, owner)).body).toMatchObject({ isLiked: true, likedCount: 2 });
			expect((await api('articles/like', { articleId: article.id, liked: true }, owner)).body).toMatchObject({ isLiked: true, likedCount: 2 });
			expect((await api('pages/unlike', { pageId: article.id }, owner)).status).toBe(204);
			expect((await api('pages/like', { pageId: article.id }, owner)).status).toBe(204);
			expect((await api('articles/like', { articleId: article.id, liked: false }, owner)).body).toMatchObject({ isLiked: false, likedCount: 1 });
			expect((await api('articles/favorite', { articleId: article.id, favorited: true }, owner)).body.isFavorited).toBe(true);
			expect((await api('articles/favorite', { articleId: article.id, favorited: false }, owner)).body.isFavorited).toBe(false);
			await Promise.all(Array.from({ length: 2 }, () => api('articles/like', { articleId: article.id, liked: false }, commenter)));
			expect((await api('articles/show', { articleId: article.id }, commenter)).body.article.likedCount).toBe(0);
			await api('articles/favorite', { articleId: article.id, favorited: false }, commenter);
			expect((await api('articles/favorite', { articleId: article.id, favorited: false }, commenter)).body.isFavorited).toBe(false);
			expect(await db.getRepository(MiArticleFavorite).countBy({ articleId: article.id })).toBe(0);
		});

		test('enforces visibility and blocks through both article and legacy Page endpoints', async () => {
			const article = await createArticle('article-visibility');
			await db.getRepository(MiPage).update(article.id, { visibility: 'specified', visibleUserIds: [commenter.id] });
			expect((await api('articles/show', { articleId: article.id })).status).toBe(400);
			expect((await api('articles/show', { articleId: article.id }, commenter)).status).toBe(200);
			expect((await api('pages/show', { pageId: article.id }, stranger)).status).toBe(400);
			expect((await api('articles/comments', { articleId: article.id }, stranger)).status).toBe(400);
			expect((await api('articles/comments', { articleId: article.id, replyId: null }, stranger)).status).toBe(400);
			expect((await api('articles/comments/create', { articleId: article.id, text: 'Hidden' }, stranger)).status).toBe(400);
			expect((await api('articles/favorite', { articleId: article.id, favorited: true }, stranger)).status).toBe(400);
			expect((await api('pages/like', { pageId: article.id }, stranger)).status).toBe(400);
			expect((await api('pages/unlike', { pageId: article.id }, stranger)).status).toBe(400);
			await db.getRepository(MiPage).update(article.id, { visibility: 'followers', visibleUserIds: [] });
			expect((await api('articles/show', { articleId: article.id }, commenter)).status).toBe(400);
			await api('following/create', { userId: owner.id }, commenter);
			expect((await api('pages/show', { pageId: article.id }, commenter)).status).toBe(200);
			await db.getRepository(MiPage).update(article.id, { visibility: 'public' });
			await api('blocking/create', { userId: commenter.id }, owner);
			try {
				expect((await api('articles/show', { articleId: article.id }, commenter)).status).toBe(400);
				expect((await api('pages/show', { pageId: article.id }, commenter)).status).toBe(400);
				expect((await api('users/pages', { userId: owner.id }, commenter)).body).toEqual([]);
			} finally {
				await api('blocking/delete', { userId: commenter.id }, owner);
			}
		});

		test('hides articles while account deletion is waiting for cleanup', async () => {
			const article = await createArticle('article-deleted-author');
			await db.getRepository(MiUser).update(owner.id, { isDeleted: true });
			try {
				expect((await api('articles/list', { userId: owner.id })).body).toEqual([]);
				expect((await api('articles/list', { userId: owner.id }, commenter)).body).toEqual([]);
				expect((await api('articles/show', { articleId: article.id }, commenter)).status).toBe(400);
			} finally {
				await db.getRepository(MiUser).update(owner.id, { isDeleted: false });
			}
		});

		test('applies article visibility and blocks to pinned articles in user profiles', async () => {
			const article = await createArticle('article-pinned-visibility');
			expect((await api('i/update', { pinnedPageId: article.id }, owner)).status).toBe(200);
			try {
				expect((await api('users/show', { userId: owner.id }, commenter)).body.pinnedPage?.id).toBe(article.id);
				await db.getRepository(MiPage).update(article.id, { visibility: 'specified', visibleUserIds: [commenter.id] });
				const visitor = await api('users/show', { userId: owner.id });
				expect(visitor.status).toBe(200);
				expect(visitor.body.pinnedPage).toBeNull();
				expect((await api('users/show', { userId: owner.id }, stranger)).body.pinnedPage).toBeNull();
				expect((await api('users/show', { userId: owner.id }, commenter)).body.pinnedPage?.id).toBe(article.id);
				await db.getRepository(MiPage).update(article.id, { visibility: 'public' });
				expect((await api('blocking/create', { userId: commenter.id }, owner)).status).toBe(200);
				const blocked = await api('users/show', { userId: owner.id }, commenter);
				expect(blocked.status).toBe(200);
				expect(blocked.body.pinnedPage).toBeNull();
				expect((await api('users/show', { userId: owner.id }, owner)).body.pinnedPage?.id).toBe(article.id);
			} finally {
				await api('blocking/delete', { userId: commenter.id }, owner);
				await api('i/update', { pinnedPageId: null }, owner);
			}
		});

		test('rejects ordinary Pages and removes article interactions with the article', async () => {
			const ordinary = await page(owner, { name: 'non-article-interactions', title: 'Page' });
			expect((await api('articles/show', { articleId: ordinary.id })).status).toBe(400);
			expect((await api('articles/comments/create', { articleId: ordinary.id, text: 'Not an article' }, commenter)).status).toBe(400);
			expect((await api('pages/show', { pageId: ordinary.id })).status).toBe(200);
			const article = await createArticle('article-cascade-delete');
			await api('articles/comments/create', { articleId: article.id, text: 'Remove with article' }, commenter);
			await api('articles/favorite', { articleId: article.id, favorited: true }, commenter);
			expect((await api('pages/delete', { pageId: article.id }, owner)).status).toBe(204);
			expect(await db.getRepository(MiArticleComment).countBy({ articleId: article.id })).toBe(0);
			expect(await db.getRepository(MiArticleFavorite).countBy({ articleId: article.id })).toBe(0);
		});
	});
});
