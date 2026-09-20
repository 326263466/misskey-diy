/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, describe, expect, test } from 'vitest';
import type { Repository } from 'typeorm';
import type * as Misskey from 'misskey-js';
import { MiNote } from '@/models/Note.js';
import { MiNoteLike } from '@/models/NoteLike.js';
import { MiNoteReaction } from '@/models/NoteReaction.js';
import { api, initTestDb, post, signup } from '../utils.js';

describe('note likes', () => {
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;
	let others: Misskey.entities.SignupResponse[];
	let notes: Repository<MiNote>;
	let likes: Repository<MiNoteLike>;
	let reactions: Repository<MiNoteReaction>;

	beforeAll(async () => {
		const connection = await initTestDb(true);
		notes = connection.getRepository(MiNote);
		likes = connection.getRepository(MiNoteLike);
		reactions = connection.getRepository(MiNoteReaction);
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		others = [await signup({ username: 'carol' }), await signup({ username: 'dave' }), await signup({ username: 'erin' })];
	});

	test('likes and reactions coexist and can be removed independently', async () => {
		const note = await post(alice, { text: 'separate data' });
		expect((await api('notes/reactions/create', { noteId: note.id, reaction: '\u2764\ufe0f' }, bob)).status).toBe(204);
		const liked = await api('notes/likes/create', { noteId: note.id }, bob);
		expect(liked.status).toBe(200);
		expect(liked.body).toMatchObject({ likeCount: 1, isLiked: true, likeUsers: [{ id: bob.id }] });
		expect(await reactions.countBy({ noteId: note.id })).toBe(1);
		expect(await likes.countBy({ noteId: note.id })).toBe(1);

		const unliked = await api('notes/likes/delete', { noteId: note.id }, bob);
		expect(unliked.body).toEqual({ likeCount: 0, isLiked: false, likeUsers: [] });
		expect(await reactions.countBy({ noteId: note.id })).toBe(1);
		await api('notes/likes/create', { noteId: note.id }, bob);
		await api('notes/reactions/delete', { noteId: note.id }, bob);
		expect(await likes.countBy({ noteId: note.id })).toBe(1);
		expect(await reactions.countBy({ noteId: note.id })).toBe(0);
	});

	test('is idempotent under repeated and concurrent requests', async () => {
		const note = await post(alice, { text: 'idempotent' });
		const results = await Promise.all(Array.from({ length: 4 }, () => api('notes/likes/create', { noteId: note.id }, bob)));
		expect(results.map(result => result.status)).toEqual([200, 200, 200, 200]);
		expect(await likes.countBy({ noteId: note.id })).toBe(1);
		await Promise.all([api('notes/likes/delete', { noteId: note.id }, bob), api('notes/likes/delete', { noteId: note.id }, bob)]);
		expect(await likes.countBy({ noteId: note.id })).toBe(0);
	});

	test('returns an accurate count, three preview users and a paginated complete list', async () => {
		const note = await post(alice, { text: 'preview users' });
		for (const user of [bob, ...others]) {
			expect((await api('notes/likes/create', { noteId: note.id }, user)).status).toBe(200);
		}
		const shown = await api('notes/show', { noteId: note.id }, bob);
		expect(shown.body.likeCount).toBe(4);
		expect(shown.body.isLiked).toBe(true);
		expect(shown.body.likeUsers).toHaveLength(3);
		expect(shown.body.likeUsers?.map(user => user.id)).toEqual(others.toReversed().map(user => user.id));
		const partial = await api('notes/show-partial-bulk', { noteIds: [note.id] }, bob);
		expect(partial.body[0]).toMatchObject({ likeCount: 4, isLiked: true });
		expect(partial.body[0].likeUsers).toHaveLength(3);
		const first = await api('notes/likes', { noteId: note.id, limit: 2 }, alice);
		const second = await api('notes/likes', { noteId: note.id, limit: 2, untilId: first.body.at(-1)!.id }, alice);
		expect([...first.body, ...second.body].map(like => like.user.id)).toEqual([...others.toReversed().map(user => user.id), bob.id]);
		expect((await api('users/notes', { userId: alice.id }, alice)).body.find(item => item.id === note.id)).toMatchObject({ likeCount: 4, isLiked: false });
	});

	test('exposes the follow state needed to offer a follow button in the list', async () => {
		const note = await post(alice, { text: 'follow state' });
		await api('notes/likes/create', { noteId: note.id }, bob);
		const listed = (await api('notes/likes', { noteId: note.id }, alice)).body;
		expect(listed).toHaveLength(1);
		expect(listed[0].user).toMatchObject({ id: bob.id, isFollowing: false, isLocked: false });
	});

	test('does not expose private note likes to unauthorised readers', async () => {
		const note = await post(alice, { text: 'private', visibility: 'specified', visibleUserIds: [bob.id] });
		expect((await api('notes/likes/create', { noteId: note.id }, bob)).status).toBe(200);
		for (const viewer of [undefined, others[0]]) {
			expect((await api('notes/likes', { noteId: note.id }, viewer)).status).toBe(400);
			const state = (await api('notes/show-partial-bulk', { noteIds: [note.id] }, viewer)).body[0];
			expect(state).toMatchObject({ likeCount: 0, isLiked: false, likeUsers: [] });
		}
		expect((await api('notes/likes/create', { noteId: note.id }, others[0])).status).toBe(400);
	});

	test('preserves likes for a comment placeholder and removes them when the root post is deleted', async () => {
		const parent = await post(alice, { text: 'parent' });
		const comment = await post(bob, { text: 'comment', replyId: parent.id });
		await api('notes/likes/create', { noteId: parent.id }, bob);
		await api('notes/likes/create', { noteId: comment.id }, alice);
		expect((await api('notes/delete', { noteId: comment.id }, bob)).status).toBe(204);
		expect(await likes.countBy({ noteId: comment.id })).toBe(1);
		expect((await api('notes/likes/create', { noteId: comment.id }, alice)).status).toBe(400);
		expect((await api('notes/delete', { noteId: parent.id }, alice)).status).toBe(204);
		expect(await likes.countBy({ noteId: parent.id })).toBe(0);
		expect(await likes.countBy({ noteId: comment.id })).toBe(0);
	});

	test('editing a liked note preserves its likes and other related data', async () => {
		const note = await post(alice, { text: 'before #oldtopic' });
		await api('notes/likes/create', { noteId: note.id }, bob);
		const changed = await api('notes/update', { noteId: note.id, text: 'after #newtopic' }, alice);
		expect(changed.status).toBe(200);
		expect(changed.body.id).toBe(note.id);
		expect(changed.body.likeCount).toBe(1);
		expect(changed.body.tags).toEqual(['newtopic']);
		expect((await notes.findOneByOrFail({ id: note.id })).reactions).toEqual({});
	});

	test('preserves original likes inside a renote of a published reply', async () => {
		const original = await post(alice, { text: 'original' });
		const reply = await post(others[0], { text: 'published reply', replyId: original.id, publishReply: true });
		const renote = await post(bob, { renoteId: reply.id });
		await api('notes/likes/create', { noteId: original.id }, bob);
		const timeline = await api('users/notes', { userId: bob.id, withRenotes: true, withReplies: true }, bob);
		const nestedOriginal = timeline.body.find(note => note.id === renote.id)?.renote?.reply;
		expect(nestedOriginal).toMatchObject({ id: original.id, likeCount: 1, isLiked: true, likeUsers: [{ id: bob.id }] });
	});

	test('uses server-owned like IDs and user IDs even if extra request fields are supplied', async () => {
		const note = await post(alice, { text: 'request fields' });
		const result = await api('notes/likes/create', { noteId: note.id, id: 'clientChosen', userId: alice.id } as never, bob);
		expect(result.status).toBe(200);
		const stored = await likes.findOneByOrFail({ noteId: note.id });
		expect(stored.userId).toBe(bob.id);
		expect(stored.id).not.toBe('clientChosen');
	});
});
