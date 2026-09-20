/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { MiNote } from '@/models/Note.js';
import { DELETED_REPLY_THREAD_PREFIX } from '@/misc/is-reply.js';
import ViewsEndpoint from '@/server/api/endpoints/notes/views.js';
import type { MiLocalUser } from '@/models/User.js';

function createEndpoint() {
	const note = new MiNote({ id: 'note', userId: 'author', threadId: null, viewsCount: 0 });
	const redis = {
		eval: vi.fn<(...args: (string | number)[]) => Promise<number>>().mockResolvedValue(1),
	};
	const query = {
		update: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		execute: vi.fn().mockResolvedValue({ affected: 1 }),
	};
	const repository = { findBy: vi.fn().mockResolvedValue([note]), createQueryBuilder: vi.fn(() => query) };
	const entities = { isContentVisible: vi.fn().mockResolvedValue(true) };
	const events = { publishNoteStream: vi.fn() };
	const endpoint = new ViewsEndpoint(repository as never, redis as never, entities as never, events as never);
	const exec = (userId = 'reader', noteIds = [note.id]) => endpoint.exec({ noteIds }, { id: userId } as MiLocalUser, null);
	return { exec, note, repository, query, redis, entities, events };
}

describe('notes/views endpoint', () => {
	test('reserves one day of deduplication and a per-account rolling-minute budget before incrementing', async () => {
		const { exec, note, query, redis, events } = createEndpoint();
		await Promise.all([exec(), exec(note.userId), exec('other')]);
		expect(query.execute).toHaveBeenCalledTimes(3);
		expect(events.publishNoteStream).toHaveBeenCalledTimes(3);
		expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 2, 'noteView:reader:note', 'noteViewBudget:reader', expect.any(String), 86_400_000, 60_000, 120);
		expect(new Set(redis.eval.mock.calls.map(args => args[4])).size).toBe(3);
		expect(query.set.mock.calls[0][0].viewsCount()).toBe('"viewsCount" + 1');
	});

	test.each([0, -1])('does not increment or publish when Redis rejects a duplicate or exhausted budget (%s)', async (result) => {
		const { exec, query, redis, events } = createEndpoint();
		redis.eval.mockResolvedValueOnce(result);
		await exec();
		expect(query.execute).not.toHaveBeenCalled();
		expect(events.publishNoteStream).not.toHaveBeenCalled();
		expect(redis.eval).toHaveBeenCalledOnce();
	});

	test('does not reserve or count invisible or deleted notes', async () => {
		const { exec, note, repository, entities, redis, query, events } = createEndpoint();
		repository.findBy.mockResolvedValue([
			new MiNote({ ...note, id: 'hidden' }),
			new MiNote({ ...note, id: 'deleted', threadId: `${DELETED_REPLY_THREAD_PREFIX}parent` }),
			note,
		]);
		entities.isContentVisible.mockImplementation(async target => target.id !== 'hidden');
		await exec('reader', ['hidden', 'deleted', note.id]);
		expect(redis.eval).toHaveBeenCalledOnce();
		expect(query.execute).toHaveBeenCalledOnce();
		expect(events.publishNoteStream).toHaveBeenCalledExactlyOnceWith(note, 'statsUpdated', null);
	});

	test('allows a retry after a failed database increment without publishing failed statistics', async () => {
		const { exec, query, redis, events } = createEndpoint();
		query.execute.mockRejectedValueOnce(new Error('database unavailable'));
		await expect(exec()).rejects.toThrow('database unavailable');
		expect(redis.eval).toHaveBeenCalledTimes(2);
		const reservation = redis.eval.mock.calls[0][4];
		expect(redis.eval.mock.calls[1]).toEqual([expect.any(String), 2, 'noteView:reader:note', 'noteViewBudget:reader', reservation]);
		expect(events.publishNoteStream).not.toHaveBeenCalled();
		await exec();
		expect(query.execute).toHaveBeenCalledTimes(2);
		expect(events.publishNoteStream).toHaveBeenCalledOnce();
	});

	test('does not notify after a note is deleted between visibility checking and the database update', async () => {
		const { exec, query, redis, events } = createEndpoint();
		query.execute.mockResolvedValueOnce({ affected: 0 });
		await exec();
		expect(query.where).toHaveBeenCalledWith(expect.stringContaining('"threadId" NOT LIKE :deleted'), expect.objectContaining({ deleted: `${DELETED_REPLY_THREAD_PREFIX}%` }));
		expect(events.publishNoteStream).not.toHaveBeenCalled();
		expect(redis.eval.mock.calls[1]).toEqual([expect.any(String), 2, 'noteView:reader:note', 'noteViewBudget:reader', redis.eval.mock.calls[0][4]]);
	});

	test('ignores missing notes', async () => {
		const { exec, repository, redis, events } = createEndpoint();
		repository.findBy.mockResolvedValueOnce([]);
		await exec('reader', ['missing']);
		expect(redis.eval).not.toHaveBeenCalled();
		expect(events.publishNoteStream).not.toHaveBeenCalled();
	});

	test.each([
		{ name: 'empty', noteIds: [] },
		{ name: 'duplicate', noteIds: ['same', 'same'] },
		{ name: 'malformed', noteIds: ['bad/id'] },
		{ name: 'oversized', noteIds: Array.from({ length: 51 }, (_, index) => `note${index}`) },
	])('rejects a $name batch before accessing stored notes', async ({ noteIds }) => {
		const { exec, repository } = createEndpoint();
		await expect(exec('reader', noteIds)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(repository.findBy).not.toHaveBeenCalled();
	});

	test('accepts a full batch of 50 unique notes', async () => {
		const { exec, note, repository, query, events } = createEndpoint();
		const notes = Array.from({ length: 50 }, (_, index) => new MiNote({ ...note, id: `note${index}` }));
		repository.findBy.mockResolvedValueOnce(notes);
		await exec('reader', notes.map(target => target.id));
		expect(query.execute).toHaveBeenCalledTimes(50);
		expect(events.publishNoteStream).toHaveBeenCalledTimes(50);
	});
});
