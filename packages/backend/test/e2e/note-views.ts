/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { In } from 'typeorm';
import type { Repository } from 'typeorm';
import type * as Misskey from 'misskey-js';
import { MiNote } from '@/models/Note.js';
import { loadConfig } from '@/config.js';
import { IdService } from '@/core/IdService.js';
import ViewsEndpoint from '@/server/api/endpoints/notes/views.js';
import type { MiLocalUser } from '@/models/User.js';
import { api, castAsError, createAppToken, initTestDb, port, post, signup } from '../utils.js';

describe('note views', () => {
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;
	let carol: Misskey.entities.SignupResponse;
	let notes: Repository<MiNote>;
	let redis: Redis;
	let ids: IdService;

	beforeAll(async () => {
		const db = await initTestDb(true);
		const config = loadConfig();
		notes = db.getRepository(MiNote);
		redis = new Redis(config.redis);
		ids = new IdService(config);
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });
	});

	afterAll(async () => {
		await redis?.quit();
	});

	test('starts at zero and keeps ordinary API reads from recording a view', async () => {
		const note = await post(alice, { text: 'explicit exposure only' });
		expect(note.viewsCount).toBe(0);
		await api('notes/show', { noteId: note.id }, alice);
		await api('notes/show', { noteId: note.id }, bob);
		await api('users/notes', { userId: alice.id }, bob);
		await api('notes/show-partial-bulk', { noteIds: [note.id] }, bob);
		expect((await notes.findOneByOrFail({ id: note.id })).viewsCount).toBe(0);
	});

	test('counts the author and other signed-in viewers independently', async () => {
		const note = await post(alice, { text: 'all signed-in viewers' });
		const results = await Promise.all([alice, bob, carol].map(viewer => api('notes/views', { noteIds: [note.id] }, viewer)));
		expect(results.map(result => result.status)).toEqual([204, 204, 204]);
		expect((await notes.findOneByOrFail({ id: note.id })).viewsCount).toBe(3);
		const shown = (await api('notes/show', { noteId: note.id })).body;
		const partial = (await api('notes/show-partial-bulk', { noteIds: [note.id] }, bob)).body;
		expect(shown.viewsCount).toBe(3);
		expect(partial[0].viewsCount).toBe(3);
	});

	test('counts concurrent and repeated reports from one account only once per 24-hour window', async () => {
		const note = await post(alice, { text: 'repeated views' });
		const reports = await Promise.all(Array.from({ length: 8 }, () => api('notes/views', { noteIds: [note.id] }, bob)));
		expect(reports.every(result => result.status === 204)).toBe(true);
		expect((await api('notes/views', { noteIds: [note.id] }, bob)).status).toBe(204);
		expect((await notes.findOneByOrFail({ id: note.id })).viewsCount).toBe(1);
		const remaining = await redis.pttl(`noteView:${bob.id}:${note.id}`);
		expect(remaining).toBeGreaterThan(86_390_000);
		expect(remaining).toBeLessThanOrEqual(86_400_000);
		const budgetKey = `noteViewBudget:${bob.id}`;
		const budget = await redis.zcard(budgetKey);
		await api('notes/views', { noteIds: [note.id] }, bob);
		expect(await redis.zcard(budgetKey)).toBe(budget);
		expect(await redis.pttl(`noteView:${bob.id}:${note.id}`)).toBeLessThanOrEqual(remaining);
	});

	test('allows a later exposure after the 24-hour deduplication reservation expires', async () => {
		const note = await post(alice, { text: 'later exposure' });
		await api('notes/views', { noteIds: [note.id] }, bob);
		const key = `noteView:${bob.id}:${note.id}`;
		expect(await redis.pexpire(key, 1)).toBe(1);
		await vi.waitFor(async () => expect(await redis.exists(key)).toBe(0));
		expect((await api('notes/views', { noteIds: [note.id] }, bob)).status).toBe(204);
		expect((await notes.findOneByOrFail({ id: note.id })).viewsCount).toBe(2);
	});

	test('enforces 120 new views per rolling minute across concurrent batches, without charging duplicates', async () => {
		const viewer = await signup({ username: 'budget_viewer' });
		expect(viewer.id).toBeDefined();
		const seed = await post(alice, { text: 'view budget' });
		const template = await notes.findOneByOrFail({ id: seed.id });
		const targets = Array.from({ length: 200 }, () => new MiNote({ ...template, id: ids.gen() }));
		await notes.insert(targets);
		const batches = Array.from({ length: 4 }, (_, index) => targets.slice(index * 50, index * 50 + 50).map(note => note.id));
		const results = await Promise.all(batches.map(noteIds => api('notes/views', { noteIds }, viewer)));
		expect(results.every(result => result.status === 204)).toBe(true);
		const stored = await notes.findBy({ id: In(targets.map(note => note.id)) });
		expect(stored.reduce((sum, note) => sum + note.viewsCount, 0)).toBe(120);
		const counted = stored.filter(note => note.viewsCount === 1);
		const uncounted = stored.filter(note => note.viewsCount === 0);
		expect(counted).toHaveLength(120);
		expect(uncounted).toHaveLength(80);
		const budgetKey = `noteViewBudget:${viewer.id}`;
		expect(await redis.zcard(budgetKey)).toBe(120);
		await Promise.all([
			api('notes/views', { noteIds: counted.slice(0, 50).map(note => note.id) }, viewer),
			api('notes/views', { noteIds: uncounted.slice(0, 50).map(note => note.id) }, viewer),
		]);
		expect(await redis.zcard(budgetKey)).toBe(120);
		expect((await notes.findBy({ id: In(uncounted.map(note => note.id)) })).every(note => note.viewsCount === 0)).toBe(true);
		expect(await redis.exists(`noteView:${viewer.id}:${uncounted[0].id}`)).toBe(0);

		const tokens = await redis.zrange(budgetKey, 0, -1);
		const [seconds, microseconds] = await redis.time();
		const expiredAt = Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000) - 60_001;
		await redis.zadd(budgetKey, ...tokens.flatMap(token => [expiredAt, token]));
		expect((await api('notes/views', { noteIds: [counted[0].id, uncounted[0].id] }, viewer)).status).toBe(204);
		expect(await redis.zcard(budgetKey)).toBe(1);
		expect((await notes.findOneByOrFail({ id: counted[0].id })).viewsCount).toBe(1);
		expect((await notes.findOneByOrFail({ id: uncounted[0].id })).viewsCount).toBe(1);
	});

	test('releases both reservations after a failed or skipped database write so the next exposure can retry', async () => {
		const note = await post(alice, { text: 'retry view' });
		const key = `noteView:${carol.id}:${note.id}`;
		const budgetKey = `noteViewBudget:${carol.id}`;
		const budgetBefore = await redis.zcard(budgetKey);
		const query = {
			update: vi.fn().mockReturnThis(),
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			execute: vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce({ affected: 0 }),
		};
		const repository = {
			findBy: () => notes.findBy({ id: note.id }),
			createQueryBuilder: () => query,
		};
		const events = { publishNoteStream: vi.fn() };
		const endpoint = new ViewsEndpoint(repository as never, redis, { isContentVisible: async () => true } as never, events as never);
		const viewer = { id: carol.id } as MiLocalUser;
		await expect(endpoint.exec({ noteIds: [note.id] }, viewer, null)).rejects.toThrow('database unavailable');
		expect(await redis.exists(key)).toBe(0);
		expect(await redis.zcard(budgetKey)).toBe(budgetBefore);
		await endpoint.exec({ noteIds: [note.id] }, viewer, null);
		expect(await redis.exists(key)).toBe(0);
		expect(await redis.zcard(budgetKey)).toBe(budgetBefore);
		expect(events.publishNoteStream).not.toHaveBeenCalled();
		expect((await api('notes/views', { noteIds: [note.id] }, carol)).status).toBe(204);
		expect((await notes.findOneByOrFail({ id: note.id })).viewsCount).toBe(1);
	});

	test('requires authentication and a permitted app token', async () => {
		const note = await post(alice, { text: 'authenticated views' });
		const anonymous = await api('notes/views', { noteIds: [note.id] });
		expect(anonymous.status).toBe(401);
		expect(castAsError(anonymous.body as never).error.code).toBe('CREDENTIAL_REQUIRED');
		const token = await createAppToken(bob, ['write:notes']);
		const forbidden = await api('notes/views', { noteIds: [note.id] }, { token });
		expect(forbidden.status).toBe(403);
		expect(castAsError(forbidden.body as never).error.code).toBe('PERMISSION_DENIED');
		expect((await notes.findOneByOrFail({ id: note.id })).viewsCount).toBe(0);
	});

	test('counts visible notes within a mixed batch and skips private or missing targets', async () => {
		const visible = await post(alice, { text: 'public' });
		const privateNote = await post(alice, { text: 'specific recipient', visibility: 'specified', visibleUserIds: [bob.id] });
		const followerNote = await post(alice, { text: 'followers', visibility: 'followers' });
		expect((await api('notes/views', { noteIds: [visible.id, privateNote.id, followerNote.id, ids.gen()] }, carol)).status).toBe(204);
		expect((await notes.findOneByOrFail({ id: visible.id })).viewsCount).toBe(1);
		expect((await notes.findOneByOrFail({ id: privateNote.id })).viewsCount).toBe(0);
		expect((await notes.findOneByOrFail({ id: followerNote.id })).viewsCount).toBe(0);
		expect(await redis.exists(`noteView:${carol.id}:${privateNote.id}`)).toBe(0);
		expect((await api('notes/views', { noteIds: [privateNote.id] }, bob)).status).toBe(204);
		expect((await notes.findOneByOrFail({ id: privateNote.id })).viewsCount).toBe(1);
	});

	test('skips deleted comment placeholders while retaining their previous recorded views', async () => {
		const parent = await post(alice, { text: 'parent' });
		const comment = await post(bob, { text: 'comment', replyId: parent.id });
		await api('notes/views', { noteIds: [comment.id] }, alice);
		expect((await api('notes/delete', { noteId: comment.id }, bob)).status).toBe(204);
		expect((await api('notes/views', { noteIds: [comment.id, parent.id] }, carol)).status).toBe(204);
		expect((await notes.findOneByOrFail({ id: comment.id })).viewsCount).toBe(1);
		expect((await notes.findOneByOrFail({ id: parent.id })).viewsCount).toBe(1);
		expect(await redis.exists(`noteView:${carol.id}:${comment.id}`)).toBe(0);
	});

	test('records up to 50 distinct notes per request without accepting duplicate, oversized or malformed batches', async () => {
		const seed = await post(alice, { text: 'batch views' });
		const template = await notes.findOneByOrFail({ id: seed.id });
		const targets = Array.from({ length: 50 }, () => new MiNote({ ...template, id: ids.gen() }));
		await notes.insert(targets);
		const noteIds = targets.map(note => note.id);
		expect((await api('notes/views', { noteIds }, bob)).status).toBe(204);
		expect((await notes.findBy({ id: In(noteIds) })).every(note => note.viewsCount === 1)).toBe(true);

		for (const invalid of [[], [seed.id, seed.id], [...noteIds, seed.id], ['invalid/id']]) {
			const result = await api('notes/views', { noteIds: invalid }, bob);
			expect(result.status).toBe(400);
			expect(castAsError(result.body as never).error.code).toBe('INVALID_PARAM');
		}
		expect((await notes.findOneByOrFail({ id: seed.id })).viewsCount).toBe(0);
	});

	test('notifies another connected viewer when views or favorites change', async () => {
		const note = await post(alice, { text: 'live statistics' });
		const socket = new WebSocket(`ws://127.0.0.1:${port}/streaming?i=${alice.token}`);
		try {
			await new Promise<void>((resolve, reject) => {
				socket.once('open', () => resolve());
				socket.once('error', reject);
			});
			const updates: unknown[] = [];
			socket.on('message', data => {
				const message = JSON.parse(data.toString());
				if (message.type === 'noteUpdated' && message.body.id === note.id && message.body.type === 'statsUpdated') {
					updates.push(message.body);
				}
			});
			socket.send(JSON.stringify({ type: 'sr', body: { id: note.id } }));
			await new Promise(resolve => setTimeout(resolve, 50));
			expect((await api('notes/views', { noteIds: [note.id] }, bob)).status).toBe(204);
			await vi.waitFor(() => expect(updates).toHaveLength(1));
			expect((await api('notes/show-partial-bulk', { noteIds: [note.id] }, alice)).body[0].viewsCount).toBe(1);
			expect((await api('notes/favorites/create', { noteId: note.id }, bob)).status).toBe(204);
			await vi.waitFor(() => expect(updates).toHaveLength(2));
			expect((await api('notes/show-partial-bulk', { noteIds: [note.id] }, alice)).body[0]).toMatchObject({ favoritesCount: 1, isFavorited: false });
			expect((await api('notes/favorites/delete', { noteId: note.id }, bob)).status).toBe(204);
			await vi.waitFor(() => expect(updates).toHaveLength(3));
			expect((await api('notes/show-partial-bulk', { noteIds: [note.id] }, alice)).body[0].favoritesCount).toBe(0);
		} finally {
			socket.close();
		}
	});
});
