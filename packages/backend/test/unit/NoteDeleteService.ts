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
	const deleteNote = vi.fn().mockResolvedValue({ affected: 1 });
	const findOneBy = vi.fn();
	const transactionManager = {
		createQueryBuilder,
		delete: deleteNote,
		findOneBy,
	};
	const transaction = vi.fn(async (callback: (manager: typeof transactionManager) => unknown) => callback(transactionManager));
	const db = { transaction };
	const notesRepository = {};
	const globalEventService = {
		publishNoteStream: vi.fn(),
	};
	const userEntityService = {
		isLocalUser: vi.fn().mockReturnValue(false),
		isRemoteUser: vi.fn().mockReturnValue(false),
	};
	const notesChart = { update: vi.fn() };
	const perUserNotesChart = { update: vi.fn() };
	const meta = {
		enableChartsForRemoteUser: false,
		enableStatsForFederatedInstances: false,
	};
	const searchService = {
		unindexNote: vi.fn(),
	};
	const service = new NoteDeleteService(
		db as never,
		null as never,
		meta as never,
		null as never,
		notesRepository as never,
		null as never,
		userEntityService as never,
		globalEventService as never,
		null as never,
		null as never,
		null as never,
		null as never,
		searchService as never,
		null as never,
		notesChart as never,
		perUserNotesChart as never,
		null as never,
	);

	return {
		service,
		db,
		transaction,
		transactionManager,
		findOneBy,
		globalEventService,
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
		expect(deleteNote).toHaveBeenCalledWith(expect.anything(), { id: renote.id, userId: user.id });
	});

		test.each([
		['a self-renote', { ...renote, renoteUserId: user.id }, user],
		['a bot renote', renote, { ...user, isBot: true }],
	] as const)('does not decrement the target count for %s', async (_label, note, deletingUser) => {
		const { service, createQueryBuilder } = createService();

		await service.delete(deletingUser, note, true);

		expect(createQueryBuilder).not.toHaveBeenCalled();
	});

	test('decrements a parent replies count when a reply is deleted', async () => {
		const { service, createQueryBuilder, set, where, deleteNote } = createService();
		const reply = {
			id: 'reply',
			userId: user.id,
			replyId: 'parent',
			renoteId: null,
		} as MiNote;

		await service.delete(user, reply, true);

		expect(deleteNote).toHaveBeenCalledWith(expect.anything(), { id: reply.id, userId: user.id });
		expect(createQueryBuilder).toHaveBeenCalledTimes(1);
		expect(set).toHaveBeenCalledWith({
			repliesCount: expect.any(Function),
		});
		expect(set.mock.calls[0][0].repliesCount()).toBe('GREATEST("repliesCount" - 1, 0)');
		expect(where).toHaveBeenCalledWith('id = :id', { id: reply.replyId });
	});

	test('does not update counters or publish events when the note was already deleted', async () => {
		const { service, createQueryBuilder, deleteNote } = createService();
		deleteNote.mockResolvedValueOnce({ affected: 0 });

		await service.delete(user, renote, true);

		expect(createQueryBuilder).not.toHaveBeenCalled();
	});

	test('publishes unreplied and deleted events only after the transaction commits', async () => {
		const { service, transaction, findOneBy, globalEventService } = createService();
		const reply = {
			id: 'reply',
			userId: user.id,
			replyId: 'parent',
			renoteId: null,
		} as MiNote;
		findOneBy.mockResolvedValue({ id: reply.replyId, userId: 'author' } as MiNote);

		await service.delete(user, reply);

		expect(globalEventService.publishNoteStream).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: reply.replyId }), 'unreplied', { noteId: reply.id });
		expect(globalEventService.publishNoteStream).toHaveBeenNthCalledWith(2, reply, 'deleted', { deletedAt: expect.any(Date) });
		expect(transaction.invocationCallOrder[0]).toBeLessThan(globalEventService.publishNoteStream.mock.invocationCallOrder[0]);
	});

	test('rolls back observable side effects when a counter update fails', async () => {
		const { service, createQueryBuilder, deleteNote } = createService();
		createQueryBuilder.mockReturnValueOnce({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						execute: vi.fn().mockRejectedValue(new Error('counter update failed')),
					}),
				}),
			}),
		});

		await expect(service.delete(user, renote, true)).rejects.toThrow('counter update failed');
		expect(deleteNote).toHaveBeenCalledTimes(1);
	});
});
