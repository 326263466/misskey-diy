/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { Redis } from 'ioredis';
import type { Repository } from 'typeorm';
import type * as Misskey from 'misskey-js';
import { MiNote } from '@/models/Note.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { MiPoll } from '@/models/Poll.js';
import { MiPollVote } from '@/models/PollVote.js';
import { MiNoteLike } from '@/models/NoteLike.js';
import { loadConfig } from '@/config.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { IdService } from '@/core/IdService.js';
import { api, initTestDb, post, signup, uploadFile } from '../utils.js';

function snapshot(note: Misskey.entities.Note) {
	return { text: note.text, cw: note.cw ?? null, fileIds: note.fileIds ?? [], reactionAcceptance: note.reactionAcceptance ?? null };
}

describe('full note editor', () => {
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;
	let first: Misskey.entities.DriveFile;
	let second: Misskey.entities.DriveFile;
	let foreign: Misskey.entities.DriveFile;
	let notes: Repository<MiNote>;
	let files: Repository<MiDriveFile>;
	let redis: Redis;

	beforeAll(async () => {
		const db = await initTestDb(true);
		redis = new Redis(loadConfig().redisForTimelines);
		notes = db.getRepository(MiNote);
		files = db.getRepository(MiDriveFile);
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		const one = await uploadFile(alice);
		const two = await uploadFile(alice, { path: '192.png' });
		const other = await uploadFile(bob);
		expect([one.status, two.status, other.status]).toEqual([200, 200, 200]);
		first = one.body!;
		second = two.body!;
		foreign = other.body!;
	});

	afterAll(async () => {
		await redis?.quit();
	});

	test('edits body, warning, attachments and acceptance while preserving likes, replies and poll votes', async () => {
		const original = await post(alice, { text: 'Original #before', fileIds: [first.id], poll: { choices: ['one', 'two'] } });
		const reply = await post(bob, { text: 'Existing reply', replyId: original.id });
		await api('notes/likes/create', { noteId: original.id }, bob);
		await api('notes/reactions/create', { noteId: original.id, reaction: '\u2764\ufe0f' }, bob);
		await api('notes/polls/vote', { noteId: original.id, choice: 1 }, bob);
		const before = await notes.findOneByOrFail({ id: original.id });
		const beforePoll = await notes.manager.findOneByOrFail(MiPoll, { noteId: original.id });
		const result = await api('notes/update', {
			noteId: original.id, text: 'Updated #after', cw: 'Warning', fileIds: [second.id, first.id], reactionAcceptance: 'likeOnly', expected: snapshot(original),
		}, alice);
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ id: original.id, text: 'Updated #after', cw: 'Warning', fileIds: [second.id, first.id], reactionAcceptance: 'likeOnly', likeCount: 1, repliesCount: 1, tags: ['after'] });
		expect(result.body.files?.map(file => file.id)).toEqual([second.id, first.id]);
		const after = await notes.findOneByOrFail({ id: original.id });
		expect(after.attachedFileTypes).toEqual([second.type, first.type]);
		expect(after.reactions).toEqual(before.reactions);
		expect(after.renoteCount).toBe(before.renoteCount);
		expect(await notes.manager.findOneByOrFail(MiPoll, { noteId: original.id })).toEqual(beforePoll);
		expect(await notes.manager.count(MiPollVote, { where: { noteId: original.id } })).toBe(1);
		expect(await notes.manager.count(MiNoteLike, { where: { noteId: original.id } })).toBe(1);
		expect((await notes.findOneByOrFail({ id: reply.id })).replyId).toBe(original.id);
	});

	test('supports media-only notes and removes attachments without deleting drive files', async () => {
		const original = await post(alice, { fileIds: [first.id] });
		const mediaOnly = await api('notes/update', { noteId: original.id, text: null, fileIds: [second.id, first.id], expected: snapshot(original) }, alice);
		expect(mediaOnly.status).toBe(200);
		expect(mediaOnly.body.text).toBeNull();
		expect(mediaOnly.body.files?.map(file => file.id)).toEqual([second.id, first.id]);
		const textOnly = await api('notes/update', { noteId: original.id, text: 'Now text only', fileIds: [], expected: snapshot(mediaOnly.body) }, alice);
		expect(textOnly.status).toBe(200);
		expect(textOnly.body.files).toEqual([]);
		expect((await notes.findOneByOrFail({ id: original.id })).attachedFileTypes).toEqual([]);
		expect(await files.existsBy({ id: first.id })).toBe(true);
		expect(await files.existsBy({ id: second.id })).toBe(true);
	});

	test('synchronizes added and removed attachments across media timelines without republishing', async () => {
		await api('admin/update-meta', { enableFanoutTimeline: true }, alice);
		await api('following/create', { userId: alice.id }, bob);
		const list = (await api('users/lists/create', { name: 'Edited media' }, bob)).body;
		await api('users/lists/push', { listId: list.id, userId: alice.id }, bob);
		const older = await post(alice, { text: 'Older media', fileIds: [first.id] });
		const edited = await post(alice, { text: 'Add media later' });
		const newer = await post(alice, { text: 'Newer media', fileIds: [second.id] });
		const caches = ['localTimelineWithFiles', `userTimelineWithFiles:${alice.id}`, `homeTimelineWithFiles:${bob.id}`, `userListTimelineWithFiles:${list.id}`];
		await vi.waitFor(async () => {
			for (const cache of caches) expect(await redis.lrange('list:' + cache, 0, -1)).toContain(newer.id);
		});
		const mainTimeline = await redis.lrange('list:localTimeline', 0, -1);
		const added = await api('notes/update', { noteId: edited.id, fileIds: [first.id], expected: snapshot(edited) }, alice);
		expect(added.status).toBe(200);
		for (const cache of caches) {
			const ids = await redis.lrange('list:' + cache, 0, -1);
			expect(ids.filter(id => [newer.id, edited.id, older.id].includes(id))).toEqual([newer.id, edited.id, older.id]);
		}
		const userMedia = await api('users/notes', { userId: alice.id, withFiles: true, withChannelNotes: false }, bob);
		expect(userMedia.body.map(note => note.id)).toContain(edited.id);
		const removed = await api('notes/update', { noteId: edited.id, fileIds: [], expected: snapshot(added.body) }, alice);
		expect(removed.status).toBe(200);
		for (const cache of caches) expect(await redis.lrange('list:' + cache, 0, -1)).not.toContain(edited.id);
		for (const endpoint of ['notes/local-timeline', 'notes/timeline', 'notes/hybrid-timeline'] as const) {
			const result = await api(endpoint, { withFiles: true }, bob);
			expect(result.body.map(note => note.id)).not.toContain(edited.id);
		}
		expect(await redis.lrange('list:localTimeline', 0, -1)).toEqual(mainTimeline);
	});

	test('keeps media caches sorted and deduplicated without bridging older uncached notes', async () => {
		const timeline = `userTimelineWithFiles:edit-cache-test` as const;
		const key = 'list:' + timeline;
		const idService = new IdService({ id: 'aidx' } as never);
		const fanout = new FanoutTimelineService(redis, idService);
		const old = idService.gen(new Date(Date.now() - 600_000).getTime());
		const middle = idService.gen(new Date(Date.now() - 500_000).getTime());
		const newest = idService.gen(new Date(Date.now() - 400_000).getTime());
		await redis.rpush(key, newest, old, newest);
		const add = redis.pipeline();
		fanout.updateFiles(timeline, middle, true, 2, add);
		expect((await add.exec())?.[0][0]).toBeNull();
		expect(await redis.lrange(key, 0, -1)).toEqual([newest, middle]);
		const tooOld = redis.pipeline();
		fanout.updateFiles(timeline, old, true, 2, tooOld);
		await tooOld.exec();
		expect(await redis.lrange(key, 0, -1)).toEqual([newest, middle]);
		const remove = redis.pipeline();
		fanout.updateFiles(timeline, middle, false, 2, remove);
		await remove.exec();
		expect(await redis.lrange(key, 0, -1)).toEqual([newest]);
		await redis.del(key);
	});

	test('rejects foreign attachments and keeps the saved note unchanged', async () => {
		const original = await post(alice, { text: 'Original', fileIds: [first.id] });
		const result = await api('notes/update', { noteId: original.id, text: 'Forbidden', fileIds: [foreign.id] }, alice);
		expect(result.status).toBe(400);
		expect((result.body as unknown as { error: { code: string } }).error.code).toBe('NO_SUCH_FILE');
		expect(await notes.findOneByOrFail({ id: original.id })).toMatchObject({ text: 'Original', fileIds: [first.id] });
	});

	test('rejects stale editor snapshots for both text and attachment changes', async () => {
		const original = await post(alice, { text: 'Original', fileIds: [first.id] });
		await api('notes/update', { noteId: original.id, fileIds: [second.id], expected: snapshot(original) }, alice);
		const conflict = await api('notes/update', { noteId: original.id, text: 'Old editor value', fileIds: [first.id], expected: snapshot(original) }, alice);
		expect(conflict.status).toBe(400);
		expect((conflict.body as unknown as { error: { code: string } }).error.code).toBe('EDIT_CONFLICT');
		expect(await notes.findOneByOrFail({ id: original.id })).toMatchObject({ text: 'Original', fileIds: [second.id] });
	});

	test('does not allow an empty save or changing published audience and poll data', async () => {
		const original = await post(alice, { text: 'Original', fileIds: [first.id] });
		expect((await api('notes/update', { noteId: original.id, text: null, cw: null, fileIds: [] }, alice)).status).toBe(400);
		const unchanged = await api('notes/update', { noteId: original.id, text: 'Updated', visibility: 'specified', replyId: 'arbitrary', poll: { choices: ['changed', 'choices'] } } as never, alice);
		expect(unchanged.status).toBe(200);
		expect(await notes.findOneByOrFail({ id: original.id })).toMatchObject({ visibility: 'public', replyId: null, hasPoll: false, fileIds: [first.id] });
	});
});
