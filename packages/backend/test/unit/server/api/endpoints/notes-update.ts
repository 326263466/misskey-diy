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
		reactionAcceptance: null,
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
	const contentValidator = { checkProhibitedWordsContain: vi.fn(() => false), updateMediaTimelines: vi.fn().mockResolvedValue(undefined) };
	const packer = { pack: vi.fn(async (value: MiNote) => value) };
	const events = { publishNoteStream: vi.fn() };
	const search = { indexNote: vi.fn().mockResolvedValue(undefined), unindexNote: vi.fn().mockResolvedValue(undefined) };
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
	const filesRepository = { findBy: vi.fn().mockResolvedValue([]) };
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
		filesRepository as never,
	);
	const exec = (params: Record<string, unknown> = {}) => endpoint.exec({ noteId: note.id, text: 'New text #NewTag :newemoji:', ...params }, me, null);
	return { exec, note, query, repository, pollRepository, usersRepository, getter, contentValidator, packer, events, search, hashtags, render, delivery, deliveryService, relays, logger, utility, filesRepository };
}

describe('notes/update endpoint', () => {
	test.each([
		['a reply', { replyId: 'parent' }],
		['a top-level note', { replyId: null, renoteId: null }],
		['a quote', { replyId: null, renoteId: 'quote' }],
	] as const)('updates %s in place while preserving attached data, counters and relationships', async (_label, overrides) => {
		const { exec, note, query, events, search } = createEndpoint({ hasPoll: true, ...overrides });
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
		expect(events.publishNoteStream).toHaveBeenCalledWith(result, 'updated', {
			text: result.text, cw: result.cw, tags: result.tags, emojis: result.emojis,
			fileIds: result.fileIds, files: undefined, reactionAcceptance: result.reactionAcceptance,
		});
	});

	test.each<[string, Partial<MiNote>]>([
		['another author', { userId: 'other' }],
		['a remote note', { userHost: 'remote.test' }],
		['a pure renote', { replyId: null, text: null, cw: null, fileIds: [], hasPoll: false }],
	])('rejects editing %s', async (_label, overrides) => {
		const { exec, repository, events } = createEndpoint(overrides);
		await expect(exec()).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
		expect(repository.createQueryBuilder).not.toHaveBeenCalled();
		expect(events.publishNoteStream).not.toHaveBeenCalled();
	});

	test.each<[string, Partial<MiNote>]>([
		['an attachment', { fileIds: ['attachment'], hasPoll: false }],
		['a poll', { fileIds: [], hasPoll: true }],
	])('can add text to a post with %s without recreating its contents', async (_label, overrides) => {
		const { exec, note } = createEndpoint({ text: null, cw: null, replyId: null, ...overrides });
		const updated = await exec();
		expect(updated).toMatchObject({ id: note.id, fileIds: note.fileIds, hasPoll: note.hasPoll, text: 'New text #NewTag :newemoji:' });
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

	test('removes stale search content when an edit leaves only attachments', async () => {
		const { exec, search } = createEndpoint();
		const updated = await exec({ text: null, cw: null });
		expect(search.indexNote).not.toHaveBeenCalled();
		expect(search.unindexNote).toHaveBeenCalledExactlyOnceWith(updated);
	});

	test('keeps indexing the warning when only the body is removed', async () => {
		const { exec, search } = createEndpoint();
		const updated = await exec({ text: null });
		expect(search.indexNote).toHaveBeenCalledExactlyOnceWith(updated);
		expect(search.unindexNote).not.toHaveBeenCalled();
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
		expect(query.where).toHaveBeenCalledWith('"id" = :id AND "userId" = :userId AND "userHost" IS NULL', { id: note.id, userId: me.id });
		expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('"threadId" IS NOT DISTINCT FROM :previousThreadId'), {
			previousText: note.text, previousCw: note.cw, previousThreadId: note.threadId,
			previousFileIds: note.fileIds, previousReactionAcceptance: note.reactionAcceptance,
		});
		expect(events.publishNoteStream).not.toHaveBeenCalled();
		expect(search.indexNote).not.toHaveBeenCalled();
	});

	test('returns counters from the database update without overwriting a concurrent reaction', async () => {
		const { exec, note, query } = createEndpoint();
		query.execute.mockImplementation(async () => ({ affected: 1, raw: [{ ...note, ...query.set.mock.calls[0][0], reactions: { like: 6 } }] }));
		expect((await exec()).reactions).toEqual({ like: 6 });
	});

	test('updates attachment order and MIME metadata without changing related data', async () => {
		const { exec, note, filesRepository, query, events } = createEndpoint();
		filesRepository.findBy.mockResolvedValue([
			{ id: 'first', userId: me.id, type: 'image/jpeg' },
			{ id: 'second', userId: me.id, type: 'video/mp4' },
		]);
		const result = await exec({ text: null, cw: null, fileIds: ['second', 'first'] });
		expect(result).toMatchObject({ id: note.id, text: null, cw: null, fileIds: ['second', 'first'], attachedFileTypes: ['video/mp4', 'image/jpeg'], reactions: note.reactions, repliesCount: note.repliesCount });
		expect(query.set.mock.calls[0][0]).not.toHaveProperty('poll');
		expect(query.set.mock.calls[0][0]).not.toHaveProperty('visibility');
		expect(events.publishNoteStream).toHaveBeenCalledWith(result, 'updated', expect.objectContaining({ fileIds: ['second', 'first'], text: null }));
	});

	test('explicitly removes all attachments while preserving them in omitted-field edits', async () => {
		const removed = createEndpoint();
		expect(await removed.exec({ fileIds: [] })).toMatchObject({ fileIds: [], attachedFileTypes: [] });
		expect(removed.filesRepository.findBy).not.toHaveBeenCalled();
		const unchanged = createEndpoint();
		expect((await unchanged.exec()).fileIds).toEqual(['attachment']);
		expect(unchanged.query.set.mock.calls[0][0]).not.toHaveProperty('fileIds');
	});

	test('rejects an update that contains no editable fields', async () => {
		const { exec, getter } = createEndpoint();
		await expect(exec({ text: undefined })).rejects.toMatchObject({ code: 'EMPTY_UPDATE' });
		expect(getter.getNote).not.toHaveBeenCalled();
	});

	test.each(['missing', 'foreign'])('rejects a new %s attachment before saving', async kind => {
		const { exec, filesRepository, repository, events } = createEndpoint();
		filesRepository.findBy.mockResolvedValue(kind === 'foreign' ? [{ id: 'foreign', userId: 'other', type: 'image/png' }] : []);
		await expect(exec({ fileIds: [kind] })).rejects.toMatchObject({ code: 'NO_SUCH_FILE' });
		expect(repository.createQueryBuilder).not.toHaveBeenCalled();
		expect(events.publishNoteStream).not.toHaveBeenCalled();
	});

	test('retains a previously published attachment without requiring its ownership to change', async () => {
		const { exec, filesRepository } = createEndpoint();
		filesRepository.findBy.mockResolvedValue([{ id: 'attachment', userId: null, type: 'image/png' }]);
		expect((await exec({ fileIds: ['attachment'] })).fileIds).toEqual(['attachment']);
	});

	test.each([['one', 'one'], Array.from({ length: 17 }, (_, index) => `file${index}`)])('rejects invalid attachment lists', async fileIds => {
		const { exec, getter } = createEndpoint();
		await expect(exec({ fileIds })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(getter.getNote).not.toHaveBeenCalled();
	});

	test('rejects an empty result and does not silently turn a quote into a pure renote', async () => {
		const { exec, repository } = createEndpoint({ hasPoll: false });
		await expect(exec({ text: null, cw: null, fileIds: [] })).rejects.toMatchObject({ code: 'EMPTY_NOTE' });
		expect(repository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('allows a poll-only edit without replacing its poll', async () => {
		const { exec, query } = createEndpoint({ text: 'before', hasPoll: true });
		const result = await exec({ text: null, cw: null, fileIds: [] });
		expect(result).toMatchObject({ text: null, hasPoll: true, fileIds: [] });
		expect(query.set.mock.calls[0][0]).not.toHaveProperty('hasPoll');
	});

	test.each([false, true])('updates media timeline membership only when attachment presence changes: %s', async hadFiles => {
		const { exec, contentValidator, filesRepository } = createEndpoint({ fileIds: hadFiles ? ['attachment'] : [] });
		filesRepository.findBy.mockResolvedValue([{ id: 'attachment', userId: me.id, type: 'image/png' }]);
		const updated = await exec({ fileIds: hadFiles ? [] : ['attachment'] });
		expect(contentValidator.updateMediaTimelines).toHaveBeenCalledExactlyOnceWith(updated);
	});

	test.each(['text', 'cw', 'fileIds', 'reactionAcceptance'] as const)('rejects a stale editor snapshot for %s', async field => {
		const { exec, note, repository } = createEndpoint();
		const expected = { text: note.text, cw: note.cw, fileIds: note.fileIds, reactionAcceptance: note.reactionAcceptance };
		const changed = { text: 'older text', cw: 'older cw', fileIds: [], reactionAcceptance: 'likeOnly' };
		await expect(exec({ expected: { ...expected, [field]: changed[field] } })).rejects.toMatchObject({ code: 'EDIT_CONFLICT' });
		expect(repository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('accepts matching editor content even when reaction counts changed', async () => {
		const { exec, note } = createEndpoint({ reactions: { like: 99 } });
		const expected = { text: note.text, cw: note.cw, fileIds: note.fileIds, reactionAcceptance: note.reactionAcceptance };
		expect(await exec({ expected, reactionAcceptance: 'nonSensitiveOnly' })).toMatchObject({ reactions: { like: 99 }, reactionAcceptance: 'nonSensitiveOnly' });
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
