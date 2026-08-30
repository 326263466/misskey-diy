/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';

function createService() {
	const execute = vi.fn().mockResolvedValue(undefined);
	const where = vi.fn().mockReturnValue({ execute });
	const set = vi.fn().mockReturnValue({ where });
	const update = vi.fn().mockReturnValue({ set });
	const createQueryBuilder = vi.fn().mockReturnValue({ update });
	const deleteNote = vi.fn().mockResolvedValue(undefined);
	const notesRepository = {
		createQueryBuilder,
		delete: deleteNote,
	};
	const searchService = {
		unindexNote: vi.fn(),
	};
	const service = new NoteDeleteService(
		null as never,
		null as never,
		null as never,
		notesRepository as never,
		null as never,
		null as never,
		null as never,
		null as never,
		null as never,
		null as never,
		null as never,
		searchService as never,
		null as never,
		null as never,
		null as never,
		null as never,
	);

	return {
		service,
		createQueryBuilder,
		set,
		where,
		deleteNote,
	};
}

const user = {
	id: 'renoter',
	uri: null,
	host: null,
	isBot: false,
} as MiUser;

const renote = {
	id: 'renote',
	userId: user.id,
	renoteId: 'target',
	renoteUserId: 'author',
	replyId: null,
} as MiNote;

describe('NoteDeleteService', () => {
	test('decrements the target renote count when another user renote is deleted', async () => {
		const { service, createQueryBuilder, set, where, deleteNote } = createService();

		await service.delete(user, renote, true);

		expect(createQueryBuilder).toHaveBeenCalledTimes(1);
		expect(set).toHaveBeenCalledTimes(1);
		const renoteCount = set.mock.calls[0][0].renoteCount;
		expect(renoteCount()).toBe('GREATEST("renoteCount" - 1, 0)');
		expect(where).toHaveBeenCalledWith('id = :id', { id: renote.renoteId });
		expect(deleteNote).toHaveBeenCalledWith({ id: renote.id, userId: user.id });
	});

	test.each([
		['a self-renote', { ...renote, renoteUserId: user.id }, user],
		['a bot renote', renote, { ...user, isBot: true }],
	] as const)('does not decrement the target count for %s', async (_label, note, deletingUser) => {
		const { service, createQueryBuilder } = createService();

		await service.delete(deletingUser, note, true);

		expect(createQueryBuilder).not.toHaveBeenCalled();
	});
});
