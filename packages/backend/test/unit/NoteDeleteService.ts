/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';

const user = { id: 'author', uri: null, host: null, isBot: false } as MiUser;
const makeNote = (id: string, overrides: Partial<MiNote> = {}) => new MiNote({
	id, userId: user.id, replyId: null, renoteId: null, text: id, localOnly: true,
	threadId: null, ...overrides,
});
const parent = makeNote('parent');
const reply = makeNote('reply', { replyId: parent.id });

function createService(selected = reply, subtree = [selected], ancestors = [parent]) {
	let exists = true;
	const execute = vi.fn().mockResolvedValue({ affected: 1 });
	const query = {
		set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
		setParameter: vi.fn().mockReturnThis(), execute,
	};
	const repository = {
		query: vi.fn(async () => exists ? [selected, ...ancestors] : []),
		create: (value: Partial<MiNote>) => new MiNote(value),
	};
	const manager = {
		getRepository: () => repository,
		query: vi.fn(async (sql: string) => sql.includes('descendants') ? subtree : sql.includes('FOR UPDATE') ? [selected, ...ancestors] : []),
		findBy: vi.fn(async () => [user]),
		findOneBy: vi.fn(async () => makeNote('renote-target')),
		delete: vi.fn(async (entity: unknown) => { if (entity === MiNote) exists = false; return { affected: 1 }; }),
		update: vi.fn(async (_entity: unknown, _where: unknown, values: Partial<MiNote>) => {
			selected = new MiNote({ ...selected, ...values });
			return { affected: 1 };
		}),
		decrement: vi.fn().mockResolvedValue({ affected: 1 }),
		createQueryBuilder: () => ({ update: () => query }),
	};
	const commit = vi.fn();
	const db = { transaction: vi.fn(async (work: (transaction: typeof manager) => Promise<void>) => { await work(manager); commit(); }) };
	const events = { publishNoteStream: vi.fn() };
	const search = { unindexNote: vi.fn().mockResolvedValue(undefined) };
	const charts = { update: vi.fn() };
	const users = { findOneByOrFail: vi.fn().mockResolvedValue(user) };
	const moderation = { log: vi.fn() };
	const service = new NoteDeleteService(
		db as never, null as never, {} as never, users as never, repository as never, null as never,
		{ isLocalUser: () => false, isRemoteUser: () => false } as never, events as never,
		null as never, null as never, null as never, null as never, search as never, moderation as never,
		charts as never, charts as never, null as never,
	);
	return { service, manager, repository, events, search, charts, commit, db, query, moderation };
}

describe('NoteDeleteService', () => {
	test.each(['author', 'moderator', 'administrator'])('records the deletion source for comments removed by %s', async actorId => {
		const actor = { ...user, id: actorId };
		const fixture = createService();
		const deletedBy = actorId === user.id ? 'author' : 'community';
		await fixture.service.delete(user, reply, false, actor);
		expect(fixture.manager.update).toHaveBeenCalledWith(MiNote, { id: reply.id }, expect.objectContaining({ deletedBy }));
		expect(fixture.events.publishNoteStream).toHaveBeenCalledWith(reply, 'deleted', { deletedAt: expect.any(Date), deletedBy });
		if (actorId !== user.id) {
			expect(fixture.moderation.log).toHaveBeenCalledWith(actor, 'deleteNote', expect.objectContaining({ noteId: reply.id }));
		} else {
			expect(fixture.moderation.log).not.toHaveBeenCalled();
		}
	});

	test('reports self deletion when a community manager deletes their own post', async () => {
		const actor = { ...user, id: 'administrator' };
		const note = makeNote('own-admin-post', { userId: actor.id });
		const fixture = createService(note, [note], []);
		await fixture.service.delete(actor, note, false, actor);
		expect(fixture.events.publishNoteStream).toHaveBeenCalledWith(note, 'deleted', { deletedAt: expect.any(Date), deletedBy: 'author' });
		expect(fixture.moderation.log).not.toHaveBeenCalled();
	});

	test('clears only comment content while preserving related data, descendants and ancestor totals', async () => {
		const child = makeNote('child', { replyId: reply.id });
		const grandparent = makeNote('grandparent');
		const fixture = createService(reply, [reply, child], [parent, grandparent]);
		await fixture.service.delete(user, reply);
		expect(fixture.manager.delete).not.toHaveBeenCalled();
		expect(fixture.manager.decrement).not.toHaveBeenCalled();
		expect(fixture.manager.update).toHaveBeenCalledExactlyOnceWith(MiNote, { id: reply.id }, expect.objectContaining({ text: null, cw: null, fileIds: [] }));
		expect(fixture.manager.update.mock.calls[0][2]).not.toHaveProperty('repliesCount');
		expect(fixture.manager.update.mock.calls[0][2]).not.toHaveProperty('reactions');
		expect(fixture.events.publishNoteStream).toHaveBeenCalledWith(parent, 'unreplied', { noteId: reply.id, deletedBy: 'author' });
		expect(fixture.events.publishNoteStream).toHaveBeenCalledWith(grandparent, 'unreplied', { noteId: reply.id, deletedBy: 'author' });
		expect(fixture.search.unindexNote.mock.calls.map(([note]) => note.id)).toEqual(['reply']);
		expect(fixture.commit.mock.invocationCallOrder[0]).toBeLessThan(fixture.events.publishNoteStream.mock.invocationCallOrder[0]);
	});

	test('does not touch ancestor counters when deleting a root post', async () => {
		const fixture = createService(parent, [parent, reply], []);
		await fixture.service.delete(user, parent, true);
		expect(fixture.manager.delete).toHaveBeenCalledWith(MiNote, { id: expect.objectContaining({ _value: ['parent', 'reply'] }) });
		expect(fixture.manager.decrement).not.toHaveBeenCalled();
		expect(fixture.search.unindexNote).toHaveBeenCalledTimes(2);
	});

	test('does not attribute cascading comment deletions to the root author or overwrite earlier moderation', async () => {
		const otherReply = makeNote('other-reply', { replyId: parent.id, userId: 'other' });
		const moderatedReply = makeNote('moderated-reply', { replyId: parent.id, deletedBy: 'community' });
		const fixture = createService(parent, [parent, otherReply, moderatedReply], []);
		await fixture.service.delete(user, parent, false, user);
		expect(fixture.events.publishNoteStream).toHaveBeenCalledWith(parent, 'deleted', { deletedAt: expect.any(Date), deletedBy: 'author' });
		expect(fixture.events.publishNoteStream).toHaveBeenCalledWith(otherReply, 'deleted', { deletedAt: expect.any(Date), deletedBy: undefined });
		expect(fixture.events.publishNoteStream).toHaveBeenCalledWith(moderatedReply, 'deleted', { deletedAt: expect.any(Date), deletedBy: 'community' });
	});

	test('makes repeated deletion idempotent', async () => {
		const fixture = createService();
		await fixture.service.delete(user, reply);
		await fixture.service.delete(user, reply);
		expect(fixture.manager.update).toHaveBeenCalledOnce();
		expect(fixture.search.unindexNote).toHaveBeenCalledOnce();
	});

	test('does not delete a different author\'s selected note', async () => {
		const fixture = createService(makeNote('foreign', { userId: 'other' }));
		await fixture.service.delete(user, makeNote('foreign', { userId: 'other' }));
		expect(fixture.manager.delete).not.toHaveBeenCalled();
	});

	test.each(['update', 'commit'] as const)('publishes no deletion or search updates if %s fails', async stage => {
		const fixture = createService();
		const error = new Error('transaction failed');
		if (stage === 'update') fixture.manager.update.mockRejectedValueOnce(error);
		if (stage === 'commit') fixture.commit.mockImplementationOnce(() => { throw error; });
		await expect(fixture.service.delete(user, reply)).rejects.toThrow(error);
		expect(fixture.events.publishNoteStream).not.toHaveBeenCalled();
		expect(fixture.search.unindexNote).not.toHaveBeenCalled();
	});

	test.each([false, true])('keeps renote counts scoped to the removed note, self renote: %s', async selfRenote => {
		const note = makeNote('renote', { renoteId: 'renote-target', renoteUserId: selfRenote ? user.id : 'other' });
		const fixture = createService(note, [note], []);
		await fixture.service.delete(user, note, true);
		if (selfRenote) expect(fixture.query.set).not.toHaveBeenCalled();
		else {
			expect(fixture.query.where).toHaveBeenCalledWith('id = :id', { id: 'renote-target' });
			expect(fixture.query.setParameter).toHaveBeenCalledWith('removed', 1);
		}
	});
});
