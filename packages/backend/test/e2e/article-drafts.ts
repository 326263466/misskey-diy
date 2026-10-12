/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { MiArticleDraft } from '@/models/ArticleDraft.js';
import { MiDriveFileReference } from '@/models/DriveFileReference.js';
import { DriveFileLifecycleService } from '@/core/DriveFileLifecycleService.js';
import { ArticleDrafts1791353790645 } from '../../migration/1791353790645-ArticleDrafts.js';
import { DriveFileLifecycle1791215330183 } from '../../migration/1791215330183-DriveFileLifecycle.js';
import { api, castAsError, initTestDb, page, signup, uploadFile } from '../utils.js';
import type { DataSource } from 'typeorm';
import type { entities } from 'misskey-js';

describe('Private article drafts', () => {
	let owner: entities.SignupResponse;
	let other: entities.SignupResponse;
	let db: DataSource;
	const content = { title: 'Draft title', summary: '', text: '# Private body', name: 'draft-name', articleCategoryId: null, articleTags: [' TypeScript '], articleId: null, coverId: null };
	const request = () => ({ draftId: randomUUID(), expectedRevision: 0, ...content });
	const errorCode = (body: unknown) => castAsError(body as Record<string, unknown>).error.code;

	beforeAll(async () => {
		owner = await signup({ username: 'articledraftowner' });
		other = await signup({ username: 'articledraftother' });
		db = await initTestDb(true);
		const runner = db.createQueryRunner();
		try {
			await new DriveFileLifecycle1791215330183().installTracking(runner);
			await new ArticleDrafts1791353790645().installTracking(runner);
		} finally { await runner.release(); }
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('stores drafts only for their owner and never exposes them as published pages or articles', async () => {
		const input = request();
		expect((await api('articles/drafts/save', input)).status).not.toBe(200);
		const saved = await api('articles/drafts/save', input, owner);
		expect(saved.status).toBe(200);
		expect(saved.body).toMatchObject({ id: input.draftId, revision: 1, text: input.text, articleTags: ['typescript'], cover: null });
		expect((await api('articles/drafts/list', {}, owner)).body.map(item => item.id)).toContain(input.draftId);
		expect((await api('articles/drafts/list', {}, other)).body).toEqual([]);
		expect((await api('articles/drafts/show', { draftId: input.draftId }, other)).status).toBe(400);
		expect((await api('articles/drafts/save', { ...input, expectedRevision: 1, text: 'Hijack' }, other)).status).toBe(400);
		expect((await api('articles/drafts/delete', { draftId: input.draftId, expectedRevision: 1 }, other)).status).toBe(204);
		expect((await api('articles/drafts/show', { draftId: input.draftId }, owner)).body.text).toBe(input.text);
		expect((await api('articles/list', { userId: owner.id })).body).toEqual([]);
		expect((await api('users/pages', { userId: owner.id })).body).toEqual([]);
		expect((await api('pages/show', { username: owner.username, name: input.name })).status).toBe(400);
	});

	test('deduplicates repeated creates and rejects stale concurrent updates or deletes', async () => {
		const input = request();
		const created = await Promise.all([api('articles/drafts/save', input, owner), api('articles/drafts/save', input, owner)]);
		expect(created.map(result => result.status)).toEqual([200, 200]);
		expect(created.map(result => result.body.revision)).toEqual([1, 1]);
		expect(await db.getRepository(MiArticleDraft).countBy({ userId: owner.id, draftId: input.draftId })).toBe(1);
		const [first, second] = await Promise.all([
			api('articles/drafts/save', { ...input, expectedRevision: 1, text: 'First change' }, owner),
			api('articles/drafts/save', { ...input, expectedRevision: 1, text: 'Second change' }, owner),
		]);
		expect([first.status, second.status].sort()).toEqual([200, 400]);
		const successful = first.status === 200 ? first : second;
		const failed = first.status === 400 ? first : second;
		expect(errorCode(failed.body)).toBe('DRAFT_CONFLICT');
		expect(successful.body.revision).toBe(2);
		const retried = await api('articles/drafts/save', { ...input, expectedRevision: 1, text: successful.body.text }, owner);
		expect(retried.status).toBe(200);
		expect(retried.body.revision).toBe(2);
		expect(errorCode((await api('articles/drafts/delete', { draftId: input.draftId, expectedRevision: 1 }, owner)).body)).toBe('DRAFT_CONFLICT');
		expect((await api('articles/drafts/show', { draftId: input.draftId }, owner)).body.text).toBe(successful.body.text);
	});

	test('keeps a deletion tombstone so delayed saves cannot resurrect a discarded draft', async () => {
		const input = request();
		expect((await api('articles/drafts/save', input, owner)).status).toBe(200);
		const remove = { draftId: input.draftId, expectedRevision: 1 };
		expect((await api('articles/drafts/delete', remove, owner)).status).toBe(204);
		expect((await api('articles/drafts/delete', remove, owner)).status).toBe(204);
		expect(errorCode((await api('articles/drafts/save', input, owner)).body)).toBe('DRAFT_CONFLICT');
		expect(errorCode((await api('articles/drafts/save', { ...input, expectedRevision: 2 }, owner)).body)).toBe('DRAFT_CONFLICT');
		expect((await api('articles/drafts/show', { draftId: input.draftId }, owner)).status).toBe(400);
		expect((await api('articles/drafts/list', {}, owner)).body.some(item => item.id === input.draftId)).toBe(false);
		expect((await db.getRepository(MiArticleDraft).findOneByOrFail({ userId: owner.id, draftId: input.draftId })).data).toBeNull();
	});

	test('rejects empty content and invalid tags and checks ownership when editing a published article', async () => {
		expect(errorCode((await api('articles/drafts/save', { ...request(), title: ' ', text: '\n\u200B' }, owner)).body)).toBe('INVALID_CONTENT');
		expect(errorCode((await api('articles/drafts/save', { ...request(), text: '\u0000' }, owner)).body)).toBe('INVALID_CONTENT');
		expect((await api('articles/drafts/save', { ...request(), articleTags: ['one', 'two', 'three', 'four'] }, owner)).status).toBe(400);
		expect(errorCode((await api('articles/drafts/save', { ...request(), articleTags: ['Tag', 'tag'] }, owner)).body)).toBe('INVALID_ARTICLE_TAGS');
		expect(errorCode((await api('articles/drafts/save', { ...request(), articleTags: ['unlisted-draft-tag'] }, owner)).body)).toBe('INVALID_ARTICLE_TAGS');
		const published = await page(owner, { title: 'Published', name: 'stable-article-url', content: [{ id: 'body', type: 'markdown', text: '# Published' }] });
		const input = { ...request(), articleId: published.id, name: 'outdated-local-name' };
		expect(errorCode((await api('articles/drafts/save', input, other)).body)).toBe('NO_SUCH_ARTICLE');
		const saved = await api('articles/drafts/save', input, owner);
		expect(saved.status).toBe(200);
		expect(saved.body.name).toBe(published.name);
		expect((await api('articles/drafts/save', input, owner)).body.revision).toBe(1);
		expect((await api('pages/show', { pageId: published.id })).body.content[0].text).toBe('# Published');
	});

	test('protects cloud attachments independently of local drafts and transfers protection on publication', async () => {
		const image = (await uploadFile(owner, { isManaged: true })).body!;
		const foreign = (await uploadFile(other)).body!;
		expect(errorCode((await api('articles/drafts/save', { ...request(), coverId: foreign.id }, owner)).body)).toBe('INVALID_COVER');
		const input = { ...request(), coverId: image.id, text: `![image](${image.url})` };
		expect((await api('articles/drafts/save', input, owner)).status).toBe(200);
		const references = db.getRepository(MiDriveFileReference);
		expect(await references.countBy({ fileId: image.id, sourceType: 'article_draft', sourceId: `${owner.id}:${input.draftId}` })).toBe(1);
		const lifecycle = new DriveFileLifecycleService(db);
		await lifecycle.saveDraft(owner.id, 'composer:cloud-local', [image.id], input.text, false);
		await lifecycle.saveDraft(owner.id, 'composer:cloud-local', [], null, true);
		await expect(lifecycle.beginDelete(image.id)).rejects.toBeInstanceOf(DriveFileLifecycleService.FileInUseError);
		const published = await page(owner, { title: input.title, name: `cloud-${input.draftId}`, eyeCatchingImageId: image.id, content: [{ id: 'body', type: 'markdown', text: input.text }] });
		expect((await api('articles/drafts/delete', { draftId: input.draftId, expectedRevision: 1 }, owner)).status).toBe(204);
		expect(await references.countBy({ fileId: image.id, sourceType: 'article_draft' })).toBe(0);
		expect(await references.countBy({ fileId: image.id, sourceType: 'page', sourceId: published.id })).toBe(1);
		await expect(lifecycle.beginDelete(image.id)).rejects.toBeInstanceOf(DriveFileLifecycleService.FileInUseError);
	});

	test('enforces the per-account draft limit without counting deleted snapshots', async () => {
		const limitedOwner = await signup({ username: 'articledraftlimit' });
		const data = { ...content, articleTags: ['typescript'], fileIds: [] };
		await db.getRepository(MiArticleDraft).insert(Array.from({ length: 100 }, (_, index) => ({ userId: limitedOwner.id, draftId: `limit-${index}`, revision: 1, updatedAt: new Date(), data })));
		expect(errorCode((await api('articles/drafts/save', request(), limitedOwner)).body)).toBe('TOO_MANY_DRAFTS');
		expect((await api('articles/drafts/delete', { draftId: 'limit-0', expectedRevision: 1 }, limitedOwner)).status).toBe(204);
		expect((await api('articles/drafts/save', request(), limitedOwner)).status).toBe(200);
	});
});
