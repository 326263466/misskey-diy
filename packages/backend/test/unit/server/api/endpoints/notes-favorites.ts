/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { MiNote } from '@/models/Note.js';
import CreateFavoriteEndpoint from '@/server/api/endpoints/notes/favorites/create.js';
import DeleteFavoriteEndpoint from '@/server/api/endpoints/notes/favorites/delete.js';
import type { MiLocalUser } from '@/models/User.js';

function createEndpoints() {
	const note = new MiNote({ id: 'note', userId: 'author', userHost: null });
	const me = { id: 'reader' } as MiLocalUser;
	const repository = {
		exists: vi.fn().mockResolvedValue(false),
		findOneBy: vi.fn().mockResolvedValue({ id: 'favorite', noteId: note.id, userId: me.id }),
		insert: vi.fn().mockResolvedValue({ identifiers: [{ id: 'favorite' }] }),
		delete: vi.fn().mockResolvedValue({ affected: 1 }),
	};
	const getter = { getNote: vi.fn().mockResolvedValue(note) };
	const events = { publishNoteStream: vi.fn() };
	const achievements = { create: vi.fn() };
	const create = new CreateFavoriteEndpoint(
		repository as never,
		{ gen: () => 'favorite' } as never,
		getter as never,
		achievements as never,
		events as never,
	);
	const remove = new DeleteFavoriteEndpoint(repository as never, getter as never, events as never);
	return {
		note, repository, events,
		create: () => create.exec({ noteId: note.id }, me, null),
		remove: () => remove.exec({ noteId: note.id }, me, null),
	};
}

describe('favorite statistic notifications', () => {
	test.each(['create', 'remove'] as const)('broadcasts %s only after persistence succeeds', async action => {
		const endpoints = createEndpoints();
		const write = action === 'create' ? endpoints.repository.insert : endpoints.repository.delete;
		let complete: (result: never) => void = () => {};
		write.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
		const pending = endpoints[action]();
		await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
		expect(endpoints.events.publishNoteStream).not.toHaveBeenCalled();
		complete({ affected: 1 } as never);
		await pending;
		expect(endpoints.events.publishNoteStream).toHaveBeenCalledExactlyOnceWith(endpoints.note, 'statsUpdated', null);
	});

	test.each(['create', 'remove'] as const)('does not broadcast failed %s writes', async action => {
		const endpoints = createEndpoints();
		const write = action === 'create' ? endpoints.repository.insert : endpoints.repository.delete;
		write.mockRejectedValueOnce(new Error('database unavailable'));
		await expect(endpoints[action]()).rejects.toThrow('database unavailable');
		expect(endpoints.events.publishNoteStream).not.toHaveBeenCalled();
	});

	test('does not broadcast rejected duplicate additions or absent favorites', async () => {
		const endpoints = createEndpoints();
		endpoints.repository.exists.mockResolvedValueOnce(true);
		await expect(endpoints.create()).rejects.toMatchObject({ code: 'ALREADY_FAVORITED' });
		endpoints.repository.findOneBy.mockResolvedValueOnce(null);
		await expect(endpoints.remove()).rejects.toMatchObject({ code: 'NOT_FAVORITED' });
		expect(endpoints.events.publishNoteStream).not.toHaveBeenCalled();
		expect(endpoints.repository.insert).not.toHaveBeenCalled();
		expect(endpoints.repository.delete).not.toHaveBeenCalled();
	});
});
