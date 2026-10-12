/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, afterAll, test, vi } from 'vitest';
import { MiPage } from '@/models/Page.js';
import { MiUser } from '@/models/User.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { MiDriveFileReference } from '@/models/DriveFileReference.js';
import { MiNote } from '@/models/Note.js';
import { DriveFileLifecycleService } from '@/core/DriveFileLifecycleService.js';
import { DriveService } from '@/core/DriveService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { loadConfig } from '@/config.js';
import { DriveFileLifecycle1791215330183 } from '../../migration/1791215330183-DriveFileLifecycle.js';
import { api, castAsError, createAppToken, initTestDb, makeStreamCatcher, post, signup, uploadFile } from '../utils.js';
import type { DataSource } from 'typeorm';
import type * as misskey from 'misskey-js';

describe('Drive', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let db: DataSource;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		db = await initTestDb(true);
		const runner = db.createQueryRunner();
		try { await new DriveFileLifecycle1791215330183().installTracking(runner); } finally { await runner.release(); }
	}, 1000 * 60 * 2);
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('兼容旧托管字段，普通网盘文件保持保留状态', async () => {
		const file = (await uploadFile(alice, { isManaged: true })).body!;
		assert.strictEqual(file.isManaged, true);
		assert.strictEqual(file.isPinned, false);
		assert.ok(new Date(file.cleanupAt!).getTime() > Date.now() + 6 * 86400000);
		const pinned = await api('drive/files/update', { fileId: file.id, isPinned: true }, alice);
		assert.strictEqual(pinned.status, 200);
		assert.strictEqual(pinned.body.cleanupAt, null);
		assert.strictEqual((await api('drive/files/update', { fileId: file.id, isPinned: false }, alice)).body.isPinned, false);
		const legacy = (await uploadFile(alice)).body!;
		const retained = await api('drive/files/update', { fileId: legacy.id, isPinned: false }, alice);
		assert.strictEqual(retained.body.isManaged, false);
		assert.strictEqual(retained.body.isPinned, true);
		assert.strictEqual(retained.body.cleanupAt, null);
	});

	test('旧清理请求保留被引用附件，所有者仍可手动删除', async () => {
		const file = (await uploadFile(alice, { isManaged: true })).body!;
		const note = await post(alice, { text: '共用附件', fileIds: [file.id] });
		const article = await api('pages/create', {
			title: '共用附件文章', name: `managed-${file.id}`,
			content: [{ type: 'markdown', text: `![图片](${file.url}?preview=1)` }], variables: [], script: '',
		}, alice);
		assert.strictEqual(article.status, 200);
		const files = db.getRepository(MiDriveFile);
		assert.strictEqual(await db.getRepository(MiDriveFileReference).countBy({ fileId: file.id }), 2);
		assert.strictEqual((await api('notes/delete', { noteId: note.id }, alice)).status, 204);
		assert.strictEqual((await files.findOneByOrFail({ id: file.id })).cleanupAt, null);
		assert.strictEqual((await api('pages/delete', { pageId: article.body.id }, alice)).status, 204);
		assert.ok((await files.findOneByOrFail({ id: file.id })).cleanupAt);
		await post(alice, { text: `图片${file.url}` });
		assert.strictEqual((await files.findOneByOrFail({ id: file.id })).cleanupAt, null);
		const preserved = await api('drive/files/delete', { fileId: file.id, ifUnusedForRedPacket: true }, alice);
		assert.strictEqual(preserved.status, 204);
		assert.strictEqual(await files.existsBy({ id: file.id }), true);
		const denied = await api('drive/files/delete', { fileId: file.id }, bob);
		assert.strictEqual(castAsError(denied.body).error.code, 'ACCESS_DENIED');
		assert.strictEqual((await api('drive/files/delete', { fileId: file.id }, alice)).status, 204);
		assert.strictEqual(await files.existsBy({ id: file.id }), false);

		const unused = (await uploadFile(alice)).body!;
		assert.strictEqual((await api('drive/files/delete', { fileId: unused.id, ifUnusedForRedPacket: true }, alice)).status, 204);
		assert.strictEqual(await files.existsBy({ id: unused.id }), false);
	});

	test('草稿引用持久保留，按用户隔离且无权附件不会覆盖已有保护', async () => {
		const file = (await uploadFile(alice, { isManaged: true })).body!;
		const draftId = `draft-${file.id}`;
		assert.strictEqual((await api('drive/files/draft', { draftId, fileIds: [file.id] }, alice)).status, 204);
		assert.strictEqual((await api('drive/files/draft', { draftId, delete: true }, bob)).status, 204);
		assert.strictEqual((await db.getRepository(MiDriveFile).findOneByOrFail({ id: file.id })).cleanupAt, null);
		const otherFile = (await uploadFile(bob)).body!;
		const denied = await api('drive/files/draft', { draftId, fileIds: [otherFile.id] }, alice);
		assert.strictEqual(castAsError(denied.body).error.code, 'NO_SUCH_FILE');
		const usage = await api('drive/files/usage', { fileId: file.id }, alice);
		assert.strictEqual(usage.body.registeredReferenceCount, 1);
		assert.strictEqual(usage.body.references[0].type, 'draft');
		assert.strictEqual(usage.body.lifecycle.cleanupAt, null);
		assert.strictEqual((await api('drive/files/draft', { draftId, delete: true }, alice)).status, 204);
		assert.ok((await db.getRepository(MiDriveFile).findOneByOrFail({ id: file.id })).cleanupAt);
	});

	test('正文中带点路径的绝对和相对附件 URL 仍登记引用', async () => {
		const file = (await uploadFile(alice, { isManaged: true })).body!;
		const path = new URL(file.url).pathname;
		const addresses = [
			file.url.replace('/files/', '/files/./'),
			file.url.replace('/files/', '/files/../files/'),
			path.replace('/files/', '/files/./'),
			path.replace('/files/', '/other/../files/'),
			path.replace('/files/', '/../../files/'),
		];
		for (const [index, address] of addresses.entries()) {
			const article = await api('pages/create', {
				title: '路径附件', name: `path-${file.id}-${index}`,
				content: [{ type: 'markdown', text: `![图片](${address})` }], variables: [], script: '',
			}, alice);
			assert.strictEqual(article.status, 200);
			assert.strictEqual(await db.getRepository(MiDriveFileReference).countBy({ fileId: file.id }), 1, address);
			assert.strictEqual((await db.getRepository(MiDriveFile).findOneByOrFail({ id: file.id })).cleanupAt, null);
			const usage = await api('drive/files/usage', { fileId: file.id }, alice);
			assert.strictEqual(usage.status, 200);
			assert.strictEqual(usage.body.hiddenCount, 0, address);
			assert.deepStrictEqual(usage.body.references.map(reference => reference.sourceId), [article.body.id], address);
			assert.strictEqual((await api('pages/delete', { pageId: article.body.id }, alice)).status, 204);
			assert.ok((await db.getRepository(MiDriveFile).findOneByOrFail({ id: file.id })).cleanupAt);
		}
	});

	test('上传响应前预留草稿引用，旧快照不会释放新上传，正文确认后合并预留', async () => {
		const draftId = 'upload-reservation';
		const file = (await uploadFile(alice, { isManaged: true, draftId })).body!;
		const files = db.getRepository(MiDriveFile);
		const references = db.getRepository(MiDriveFileReference);
		assert.strictEqual(file.cleanupAt, null);
		assert.strictEqual(await references.countBy({ fileId: file.id }), 1);
		await api('drive/files/draft', { draftId, text: '较早的纯文字快照' }, alice);
		assert.strictEqual((await files.findOneByOrFail({ id: file.id })).cleanupAt, null);
		assert.strictEqual(await references.countBy({ fileId: file.id }), 1);
		await api('drive/files/draft', { draftId, text: `![图片](${file.url})` }, alice);
		assert.deepStrictEqual((await references.findBy({ fileId: file.id })).map(ref => ref.sourceId), [`${alice.id}:${draftId}`]);
		const unconfirmed = (await uploadFile(alice, { isManaged: true, draftId })).body!;
		await api('drive/files/draft', { draftId, delete: true }, alice);
		for (const item of [file, unconfirmed]) {
			assert.strictEqual(await references.countBy({ fileId: item.id }), 0);
			assert.ok((await files.findOneByOrFail({ id: item.id })).cleanupAt);
		}
		await api('drive/files/draft', { draftId, fileIds: [file.id] }, alice);
		assert.strictEqual(await references.countBy({ fileId: file.id }), 0);
		const late = await uploadFile(alice, { isManaged: true, draftId });
		assert.strictEqual(late.status, 400);
		assert.strictEqual(castAsError(late.body).error.code, 'DRAFT_CLOSED');
	});

	test('头像及文章评论的引用保护文件，文章级联删除同时解除评论引用', async () => {
		const file = (await uploadFile(alice, { isManaged: true })).body!;
		assert.strictEqual((await api('i/update', { avatarId: file.id }, alice)).status, 200);
		const article = await api('pages/create', {
			title: '评论附件', name: `comment-${file.id}`, content: [{ type: 'markdown', text: '正文' }], variables: [], script: '',
		}, alice);
		const comment = await api('articles/comments/create', { articleId: article.body.id, text: file.url }, alice);
		assert.strictEqual(comment.status, 200);
		assert.strictEqual(await db.getRepository(MiDriveFileReference).countBy({ fileId: file.id }), 2);
		const usage = await api('drive/files/usage', { fileId: file.id }, alice);
		assert.ok(usage.body.references.some(ref => ref.type === 'profile'));
		assert.ok(usage.body.references.some(ref => ref.sourceId === comment.body.id));
		await api('pages/delete', { pageId: article.body.id }, alice);
		assert.strictEqual((await db.getRepository(MiDriveFile).findOneByOrFail({ id: file.id })).cleanupAt, null);
		const restored = await api('i/update', { avatarId: null }, alice);
		assert.strictEqual(restored.status, 200);
		assert.strictEqual(restored.body.avatarId, null);
		assert.strictEqual(await db.getRepository(MiDriveFileReference).countBy({ fileId: file.id }), 0);
		assert.ok((await db.getRepository(MiDriveFile).findOneByOrFail({ id: file.id })).cleanupAt);
	});

	test('旧安全清理等待引用写入后保留附件', async () => {
		const file = (await uploadFile(alice, { isManaged: true })).body!;
		const note = await post(alice, { text: '并发引用' });
		await db.getRepository(MiDriveFile).update(file.id, { cleanupAt: new Date(0) });
		const writer = db.createQueryRunner();
		await writer.startTransaction();
		try {
			await writer.manager.update(MiNote, note.id, { fileIds: [file.id] });
			const cleanup = new DriveFileLifecycleService(db).beginDelete(file.id).then(() => null, error => error);
			await writer.commitTransaction();
			assert.ok((await cleanup) instanceof DriveFileLifecycleService.FileInUseError);
			assert.strictEqual(await db.getRepository(MiDriveFile).existsBy({ id: file.id }), true);
			assert.strictEqual((await db.getRepository(MiDriveFile).findOneByOrFail({ id: file.id })).cleanupAt, null);
		} finally {
			if (writer.isTransactionActive) await writer.rollbackTransaction();
			await writer.release();
		}
	});

	test('删除先取得文件锁时并发新引用等待后失败，不产生悬空附件', async () => {
		const file = (await uploadFile(alice, { isManaged: true })).body!;
		const note = await post(alice, { text: '回收并发' });
		const cleaner = db.createQueryRunner();
		const writer = db.createQueryRunner();
		await cleaner.startTransaction();
		try {
			await cleaner.manager.update(MiDriveFile, file.id, { deletingAt: new Date() });
			const [{ pid }] = await writer.query('SELECT pg_backend_pid() AS pid');
			const pending = writer.manager.update(MiNote, note.id, { fileIds: [file.id] }).then(() => null, error => error);
			await vi.waitFor(async () => {
				const [state] = await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [pid]);
				assert.strictEqual(state.wait_event_type, 'Lock');
			});
			await cleaner.commitTransaction();
			const error = await pending;
			assert.strictEqual(error?.constraint, 'CHK_drive_file_reference_available');
			assert.deepStrictEqual((await db.getRepository(MiNote).findOneByOrFail({ id: note.id })).fileIds, []);
			assert.strictEqual(await db.getRepository(MiDriveFileReference).countBy({ fileId: file.id }), 0);
			assert.strictEqual((await api('drive/files/delete', { fileId: file.id, ifUnusedForRedPacket: true }, alice)).status, 204);
			assert.strictEqual(await db.getRepository(MiDriveFile).existsBy({ id: file.id }), true);
		} finally {
			if (cleaner.isTransactionActive) await cleaner.rollbackTransaction();
			await cleaner.release();
			await writer.release();
		}
	});

	test('手动删除失败保留记录，重试删除实际文件且重复执行不重复统计', async () => {
		const uploaded = (await uploadFile(alice, { isManaged: true })).body!;
		const files = db.getRepository(MiDriveFile);
		const file = await files.findOneByOrFail({ id: uploaded.id });
		const lifecycle = new DriveFileLifecycleService(db);
		const storage = new InternalStorageService(loadConfig());
		const unlink = vi.spyOn(storage, 'delAsync').mockRejectedValueOnce(new Error('temporary storage failure'));
		const statistics = vi.fn();
		const service = Object.create(DriveService.prototype) as DriveService;
		Object.defineProperties(service, {
			driveFileLifecycleService: { value: lifecycle },
			internalStorageService: { value: storage },
			driveFilesRepository: { value: files },
			driveChart: { value: { update: statistics } },
			perUserDriveChart: { value: { update: vi.fn() } },
			globalEventService: { value: { publishDriveStream: vi.fn() } },
		});
		await assert.rejects(service.deleteFile(file), /temporary storage failure/);
		assert.ok((await files.findOneByOrFail({ id: file.id })).deletingAt);
		assert.strictEqual(statistics.mock.calls.length, 0);
		await service.deleteFile(file);
		assert.strictEqual(await files.existsBy({ id: file.id }), false);
		assert.ok(unlink.mock.calls.some(([key]) => key === file.accessKey));
		if (file.thumbnailUrl) assert.ok(unlink.mock.calls.some(([key]) => key === file.thumbnailAccessKey));
		await service.deleteFileSync(file);
		assert.strictEqual(statistics.mock.calls.length, 1);
		const avatar = (await uploadFile(alice)).body!;
		await api('i/update', { avatarId: avatar.id }, alice);
		await service.deleteFileSync(await files.findOneByOrFail({ id: avatar.id }));
		assert.strictEqual(await files.existsBy({ id: avatar.id }), false);
		assert.strictEqual((await db.getRepository(MiUser).findOneByOrFail({ id: alice.id })).avatarId, null);
	});

	test('ファイルURLからアップロードできる', async () => {
		// utils.js uploadUrl の処理だがAPIレスポンスも見るためここで同様の処理を書いている

		const marker = Math.random().toString();

		const url = 'https://raw.githubusercontent.com/misskey-dev/misskey/develop/packages/backend/test/resources/192.jpg';

		const catcher = makeStreamCatcher(
			alice,
			'main',
			(msg) => msg.type === 'urlUploadFinished' && msg.body.marker === marker,
			(msg) => msg.body.file,
			10 * 1000);

		const res = await api('drive/files/upload-from-url', {
			url,
			marker,
			force: true,
		}, alice);

		const file = await catcher;

		assert.strictEqual(res.status, 204);
		assert.strictEqual(file.name, '192.jpg');
		assert.strictEqual(file.type, 'image/jpeg');
	});

	test('ローカルからアップロードできる', async () => {
		// APIレスポンスを直接使用するので utils.js uploadFile が通過することで成功とする

		const res = await uploadFile(alice, { path: '192.jpg', name: 'テスト画像' });

		assert.strictEqual(res.body?.name, 'テスト画像.jpg');
		assert.strictEqual(res.body.type, 'image/jpeg');
	});

	test('添付ノート一覧を取得できる', async () => {
		const ids = (await Promise.all([uploadFile(alice), uploadFile(alice), uploadFile(alice)])).map(elm => elm.body!.id);

		const note0 = await post(alice, { fileIds: [ids[0]] });
		const note1 = await post(alice, { fileIds: [ids[0], ids[1]] });

		const attached0 = await api('drive/files/attached-notes', { fileId: ids[0] }, alice);
		assert.strictEqual(attached0.body.length, 2);
		assert.strictEqual(attached0.body[0].id, note1.id);
		assert.strictEqual(attached0.body[1].id, note0.id);

		const attached1 = await api('drive/files/attached-notes', { fileId: ids[1] }, alice);
		assert.strictEqual(attached1.body.length, 1);
		assert.strictEqual(attached1.body[0].id, note1.id);

		const attached2 = await api('drive/files/attached-notes', { fileId: ids[2] }, alice);
		assert.strictEqual(attached2.body.length, 0);
	});

	test('添付ノート一覧は他の人から見えない', async () => {
		const file = await uploadFile(alice);

		await post(alice, { fileIds: [file.body!.id] });

		const res = await api('drive/files/attached-notes', { fileId: file.body!.id }, bob);
		assert.strictEqual(res.status, 400);
		assert.strictEqual('error' in res.body, true);
	});

	test('文件用途合并附件和正文引用，并只对可见来源分页', async () => {
		const file = (await uploadFile(alice)).body!;
		const note = await post(alice, { text: '附件用途', fileIds: [file.id] });
		const adjacentNote = await post(alice, { text: `图片${file.url}` });
		const historicalNote = await post(alice, { text: `历史用途 ${file.url}` });
		await db.getRepository(MiDriveFileReference).delete({ fileId: file.id, sourceType: 'note', sourceId: historicalNote.id });
		const article = await api('pages/create', {
			title: '文章用途', name: `usage-${file.id}`, content: [{ type: 'markdown', text: `![图片](${file.url}?preview=1)` }],
			variables: [], script: '',
		}, alice);
		assert.strictEqual(article.status, 200);
		const draft = await api('notes/drafts/create', { text: '自己的草稿', fileIds: [file.id] }, alice);
		assert.strictEqual(draft.status, 200);
		await post(bob, { text: `${file.url}-different-file` });
		await post(bob, { text: `https://external.test/?example=${encodeURIComponent(`"${file.url}"`)}` });
		await post(bob, { text: `ftp://external.test${new URL(file.url).pathname} other-prefix${new URL(file.url).pathname}` });

		const first = await api('drive/files/usage', { fileId: file.id, limit: 1 }, alice);
		assert.strictEqual(first.status, 200);
		assert.strictEqual(first.body.used, true);
		assert.strictEqual(first.body.referenceCoverage, 'partial');
		assert.strictEqual(first.body.hiddenCount, 0);
		assert.strictEqual(first.body.totalCount, 5);
		assert.strictEqual(first.body.references.length, 1);
		assert.strictEqual(first.body.hasMore, true);
		const rest = await api('drive/files/usage', { fileId: file.id, offset: 1 }, alice);
		assert.strictEqual(rest.status, 200);
		assert.strictEqual(rest.body.hasMore, false);
		const references = [...first.body.references, ...rest.body.references];
		assert.deepStrictEqual(new Set(references.map(reference => `${reference.type}:${reference.sourceId}`)), new Set([
			`note:${note.id}`, `note:${adjacentNote.id}`, `note:${historicalNote.id}`, `article:${article.body.id}`, `draft:${draft.body.createdDraft.id}`,
		]));
		assert.strictEqual(references.find(reference => reference.type === 'article')?.url, `/articles/${article.body.id}`);
		assert.strictEqual(references.find(reference => reference.type === 'draft')?.url, null);
	});

	test('文件用途拒绝其他用户、匿名与第三方凭证，且不泄露文件是否存在', async () => {
		const file = (await uploadFile(alice)).body!;
		const forbidden = await api('drive/files/usage', { fileId: file.id }, bob);
		const absent = await api('drive/files/usage', { fileId: '0000000000000000' }, bob);
		assert.strictEqual(forbidden.status, 400);
		assert.strictEqual(absent.status, 400);
		assert.strictEqual(castAsError(forbidden.body).error.code, 'NO_SUCH_FILE');
		assert.strictEqual(castAsError(absent.body).error.id, castAsError(forbidden.body).error.id);
		const anonymous = await api('drive/files/usage', { fileId: file.id });
		assert.strictEqual(castAsError(anonymous.body).error.code, 'ACCESS_DENIED');
		const token = await createAppToken(alice, ['read:drive', 'read:chat', 'read:account']);
		const app = await api('drive/files/usage', { fileId: file.id }, { token });
		assert.strictEqual(castAsError(app.body).error.code, 'ACCESS_DENIED');
	});

	test('他人的私密内容和受限资料用途只返回汇总', async () => {
		const owner = await signup({ username: 'usageowner' });
		const file = (await uploadFile(owner)).body!;
		const charlie = await signup({ username: 'usagecharlie' });
		assert.strictEqual((await api('i/update', { chatScope: 'everyone', description: `受限资料 ${file.url}` }, charlie)).status, 200);
		assert.strictEqual((await api('i/update', { followedMessage: `私密关注消息${file.url}` }, bob)).status, 200);
		const visible = await post(owner, { text: '可见用途', fileIds: [file.id] });
		const hiddenNote = await post(bob, { text: `私密帖子 ${file.url}`, visibility: 'specified', visibleUserIds: [] });
		const article = await api('pages/create', {
			title: '私密文章标题', name: `private-usage-${file.id}`, content: [{ type: 'markdown', text: `![图片](${file.url})` }],
			variables: [], script: '',
		}, bob);
		assert.strictEqual(article.status, 200);
		await db.getRepository(MiPage).update(article.body.id, { visibility: 'specified', visibleUserIds: [] });
		const draft = await api('notes/drafts/create', { text: `私密草稿 ${file.url}`, visibility: 'public' }, bob);
		assert.strictEqual(draft.status, 200);
		const message = await api('chat/messages/create-to-user', { toUserId: charlie.id, text: `私密聊天 ${file.url}` }, bob);
		assert.strictEqual(message.status, 200);
		await db.getRepository(MiUser).update(charlie.id, { isSuspended: true });

		const result = await api('drive/files/usage', { fileId: file.id, limit: 1 }, owner);
		assert.strictEqual(result.status, 200);
		assert.strictEqual(result.body.hiddenCount, 6);
		assert.strictEqual(result.body.totalCount, 7);
		assert.strictEqual(result.body.hasMore, false);
		assert.deepStrictEqual(result.body.references.map(reference => reference.sourceId), [visible.id]);
		const serialized = JSON.stringify(result.body);
		for (const value of [hiddenNote.id, article.body.id, draft.body.createdDraft.id, message.body.id, charlie.id, bob.id, '私密帖子', '私密文章标题', '私密草稿', '私密聊天', '受限资料', '私密关注消息']) {
			assert.strictEqual(serialized.includes(value), false);
		}
		const end = await api('drive/files/usage', { fileId: file.id, offset: 1 }, owner);
		assert.deepStrictEqual(end.body.references, []);
		assert.strictEqual(end.body.hiddenCount, 6);
		assert.strictEqual(end.body.hasMore, false);
	});
});
