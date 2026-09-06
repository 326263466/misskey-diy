/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { MiNote } from '@/models/Note.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import NotesUpdateEndpoint, { meta } from '@/server/api/endpoints/notes/update.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';

const me = { id: 'author', host: null, uri: null } as MiLocalUser;

function createEndpoint(overrides: Partial<MiNote> = {}) {
	const note = new MiNote({
		id: 'comment',
		userId: me.id,
		userHost: null,
		replyId: 'parent',
		replyUserId: 'parentauthor',
		renoteId: 'quote',
		renoteUserId: 'quoteauthor',
		threadId: 'thread',
		text: 'Old text #oldtag :oldemoji:',
		cw: 'Old warning',
		tags: ['oldtag'],
		emojis: ['oldemoji'],
		reactions: { like: 5 },
		repliesCount: 3,
		renoteCount: 2,
		fileIds: ['attachment'],
		visibility: 'public',
		visibleUserIds: ['recipient'],
		mentions: ['mentionuser'],
		mentionedRemoteUsers: '[]',
		localOnly: true,
		channelId: null,
		hasPoll: false,
		...overrides,
	});
	const set = vi.fn().mockReturnThis();
	const query = {
		update: vi.fn().mockReturnThis(),
		set,
		where: vi.fn().mockReturnThis(),
		andWhere: vi.fn().mockReturnThis(),
		returning: vi.fn().mockReturnThis(),
		execute: vi.fn(async () => ({ affected: 1, raw: [{ ...note, ...set.mock.calls[0][0] }] })),
	};
	const repository = {
		createQueryBuilder: vi.fn(() => query),
		create: vi.fn((value: Partial<MiNote>) => new MiNote(value)),
	};
	const pollRepository = { findOneByOrFail: vi.fn().mockResolvedValue({ choices: ['#polltag :pollemoji:', 'Other choice'] }) };
	const usersRepository = { findBy: vi.fn().mockResolvedValue([]) };
	const getter = { getNote: vi.fn().mockResolvedValue(note) };
	const contentValidator = { checkProhibitedWordsContain: vi.fn(() => false) };
	const packer = { pack: vi.fn(async (value: MiNote) => value) };
	const events = { publishNoteStream: vi.fn() };
	const search = { indexNote: vi.fn().mockResolvedValue(undefined) };
	const hashtags = { updateHashtags: vi.fn().mockResolvedValue(undefined) };
	const render = {
		renderNote: vi.fn().mockResolvedValue({ id: 'https://example.test/notes/comment', type: 'Note', to: ['original-audience'], cc: ['original-copy'] }),
		renderUpdate: vi.fn((object: unknown) => ({ type: 'Update', object, to: ['public'] })),
		addContext: vi.fn((value: unknown) => value),
	};
	const delivery = {
		addDirectRecipe: vi.fn(),
		addFollowersRecipe: vi.fn(),
		execute: vi.fn().mockResolvedValue(undefined),
	};
	const deliveryService = { createDeliverManager: vi.fn(() => delivery) };
	const userEntityService = { isRemoteUser: vi.fn((user: MiUser) => user.host !== null) };
	const relays = { deliverToRelays: vi.fn().mockResolvedValue(undefined) };
	const logger = { logger: { error: vi.fn() } };
	const utility = { isKeyWordIncluded: vi.fn(() => false) };
	const endpoint = new NotesUpdateEndpoint(
		repository as never,
		pollRepository as never,
		usersRepository as never,
		{ sensitiveWords: [] } as never,
		getter as never,
		contentValidator as never,
		packer as never,
		events as never,
		search as never,
		hashtags as never,
		render as never,
		deliveryService as never,
		userEntityService as never,
		relays as never,
		logger as never,
		utility as never,
	);
	const exec = (params: Record<string, unknown> = {}) => endpoint.exec({ noteId: note.id, text: 'New text #NewTag :newemoji:', ...params }, me, null);
	return { exec, note, query, repository, pollRepository, usersRepository, getter, contentValidator, packer, events, search, hashtags, render, delivery, deliveryService, relays, logger, utility };
}

describe('notes/update endpoint', () => {
	test('updates content in place while preserving attached data, counters and relationships', async () => {
		const { exec, note, query, events, search } = createEndpoint({ hasPoll: true });
		const result = await exec({ cw: 'New warning' });
		expect(result).toEqual({
			...note,
			text: 'New text #NewTag :newemoji:',
			cw: 'New warning',
			tags: ['newtag', 'polltag'],
			emojis: ['newemoji', 'pollemoji'],
		});
		expect(Object.keys(query.set.mock.calls[0][0]).sort()).toEqual(['cw', 'emojis', 'tags', 'text']);
		expect(search.indexNote).toHaveBeenCalledWith(result);
		expect(events.publishNoteStream).toHaveBeenCalledWith(result, 'updated', { text: result.text, cw: result.cw });
	});

	test.each([
		['another author', { userId: 'other' }],
		['a remote note', { userHost: 'remote.test' }],
		['a top-level note', { replyId: null }],
	] as const)('rejects editing %s', async (_label, overrides) => {
		const { exec, repository, events } = createEndpoint(overrides);
		await expect(exec()).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
		expect(repository.createQueryBuilder).not.toHaveBeenCalled();
		expect(events.publishNoteStream).not.toHaveBeenCalled();
	});

	test('reports a missing reply', async () => {
		const { exec, getter } = createEndpoint();
		getter.getNote.mockRejectedValue(new IdentifiableError('9725d0ce-ba28-4dde-95a7-2cbb2c15de24', 'No such note.'));
		await expect(exec()).rejects.toMatchObject({ code: 'NO_SUCH_NOTE' });
	});

	test.each(['', ' \n ', 'a'.repeat(3001)])('rejects invalid text before fetching the reply', async (text) => {
		const { exec, getter } = createEndpoint();
		await expect(exec({ text })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(getter.getNote).not.toHaveBeenCalled();
	});

	test('rejects prohibited content before writing or publishing', async () => {
		const { exec, contentValidator, repository, events } = createEndpoint();
		contentValidator.checkProhibitedWordsContain.mockReturnValue(true);
		await expect(exec()).rejects.toMatchObject({ code: 'CONTAINS_PROHIBITED_WORDS' });
		expect(repository.createQueryBuilder).not.toHaveBeenCalled();
		expect(events.publishNoteStream).not.toHaveBeenCalled();
	});

	test('preserves an omitted content warning and allows explicit removal', async () => {
		const preserved = createEndpoint();
		expect((await preserved.exec()).cw).toBe('Old warning');
		expect(preserved.query.set.mock.calls[0][0]).not.toHaveProperty('cw');
		const cleared = createEndpoint();
		expect((await cleared.exec({ cw: null })).cw).toBeNull();
	});

	test('rejects sensitive text when preserving the original public visibility would bypass filtering', async () => {
		const { exec, utility, repository } = createEndpoint({ cw: null });
		utility.isKeyWordIncluded.mockReturnValue(true);
		await expect(exec()).rejects.toMatchObject({ code: 'CONTAINS_SENSITIVE_WORDS' });
		expect(repository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('detects a concurrent change or deletion without publishing an update', async () => {
		const { exec, note, query, events, search } = createEndpoint();
		query.execute.mockResolvedValue({ affected: 0, raw: [] });
		await expect(exec()).rejects.toMatchObject({ code: 'EDIT_CONFLICT' });
		expect(query.where).toHaveBeenCalledWith(expect.stringContaining('"replyId" IS NOT NULL'), { id: note.id, userId: me.id });
		expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('IS NOT DISTINCT FROM'), { previousText: note.text, previousCw: note.cw });
		expect(events.publishNoteStream).not.toHaveBeenCalled();
		expect(search.indexNote).not.toHaveBeenCalled();
	});

	test('returns counters from the database update without overwriting a concurrent reaction', async () => {
		const { exec, note, query } = createEndpoint();
		query.execute.mockImplementation(async () => ({ affected: 1, raw: [{ ...note, ...query.set.mock.calls[0][0], reactions: { like: 6 } }] }));
		expect((await exec()).reactions).toEqual({ like: 6 });
	});

	test('logs index failure without reporting a saved edit as failed', async () => {
		const { exec, search, logger } = createEndpoint();
		search.indexNote.mockRejectedValue(new Error('search unavailable'));
		await expect(exec()).resolves.toMatchObject({ id: 'comment', text: 'New text #NewTag :newemoji:' });
		expect(logger.logger.error).toHaveBeenCalled();
	});

	test('sends an ActivityPub Update with the existing object and audience', async () => {
		const { exec, render, delivery, deliveryService, relays, usersRepository } = createEndpoint({ localOnly: false });
		const remote = { id: 'mentionuser', host: 'remote.test' };
		usersRepository.findBy.mockResolvedValue([remote]);
		await exec();
		expect(render.renderUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'https://example.test/notes/comment' }), me);
		expect(deliveryService.createDeliverManager).toHaveBeenCalledWith(me, expect.objectContaining({ type: 'Update', to: ['original-audience'], cc: ['original-copy'] }));
		expect(delivery.addDirectRecipe).toHaveBeenCalledWith(remote);
		expect(delivery.addFollowersRecipe).toHaveBeenCalledOnce();
		expect(delivery.execute).toHaveBeenCalledOnce();
		expect(relays.deliverToRelays).toHaveBeenCalledOnce();
	});

	test('keeps direct reply updates away from followers and relays', async () => {
		const { exec, delivery, relays } = createEndpoint({ localOnly: false, visibility: 'specified' });
		await exec();
		expect(delivery.addFollowersRecipe).not.toHaveBeenCalled();
		expect(relays.deliverToRelays).not.toHaveBeenCalled();
	});

	test('does not federate a local-only reply', async () => {
		const { exec, render } = createEndpoint();
		await exec();
		expect(render.renderNote).not.toHaveBeenCalled();
		expect(meta).toMatchObject({ requireCredential: true, kind: 'write:notes', prohibitMoved: true });
	});
});
