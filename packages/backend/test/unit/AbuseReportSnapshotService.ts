/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { AbuseReportSnapshotService } from '@/core/AbuseReportSnapshotService.js';
import type { AbuseReportTarget } from '@/core/AbuseReportSnapshotService.js';
import { MiChatMessage, MiChatRoom, MiDriveFile, MiFlash, MiFollowing, MiGalleryPost, MiNote, MiNoteReaction, MiPage, MiPoll, MiUser, MiUserProfile } from '@/models/_.js';
import { DELETED_REPLY_THREAD_PREFIX } from '@/misc/is-reply.js';

function setup() {
	const user = { id: 'author', username: 'author', host: null, name: 'Original author', avatarId: null, bannerId: null } as MiUser;
	const reporter = { id: 'reporter' } as MiUser;
	const note = { id: 'note', userId: user.id, text: 'Original text', cw: 'Original warning', hasPoll: true, fileIds: ['file'], threadId: null as string | null, renoteId: null as string | null };
	const file = { id: 'file', name: 'Original image', type: 'image/png', size: 123, url: 'https://example.com/image.png', comment: 'Original description' };
	const profile = { description: 'Original biography', fields: [{ name: 'Site', value: 'https://example.com' }], email: 'private@example.com' };
	const poll = { choices: ['First option', 'Second option'] };
	const message = { id: 'message', fromUserId: user.id, toUserId: reporter.id, toRoomId: null as string | null, text: 'Private message', fileId: 'file' };
	const page = { id: 'page', userId: user.id, title: 'Page title', name: 'page name', summary: 'Page summary', content: [{ type: 'text', text: 'Page original content' }], variables: [], script: 'Original page script', eyeCatchingImageId: 'file', visibility: 'public', visibleUserIds: [] as string[] };
	const gallery = { id: 'gallery', userId: user.id, title: 'Gallery title', description: 'Gallery description', fileIds: ['file'] };
	const play = { id: 'play', userId: user.id, title: 'Play title', summary: 'Play summary', script: 'Original play script', visibility: 'private' };
	const profiles = { findOneBy: vi.fn().mockResolvedValue(profile) };
	const notes = { findOneBy: vi.fn().mockResolvedValue(note) };
	const reactions = { findOneBy: vi.fn().mockResolvedValue({ userId: user.id, noteId: note.id, reaction: 'text:Original Boost' }) };
	const polls = { findOneBy: vi.fn().mockResolvedValue(poll) };
	const messages = { findOneBy: vi.fn().mockResolvedValue(message) };
	const pages = { findOneBy: vi.fn().mockResolvedValue(page) };
	const galleries = { findOneBy: vi.fn().mockResolvedValue(gallery) };
	const plays = { findOneBy: vi.fn().mockResolvedValue(play) };
	const followings = { existsBy: vi.fn().mockResolvedValue(false) };
	const files = { findBy: vi.fn().mockResolvedValue([file]) };
	const noteEntities = { isContentVisible: vi.fn().mockResolvedValue(true) };
	const fileEntities = { getPublicUrl: vi.fn((value: typeof file) => value.url) };
	const chat = {
		getChatAvailability: vi.fn().mockResolvedValue({ read: true, write: true }),
		hasPermissionToViewRoomTimeline: vi.fn().mockResolvedValue(false),
	};
	const rooms = { findOneBy: vi.fn().mockResolvedValue({ id: 'room' }) };
	const users = { findOneBy: vi.fn().mockResolvedValue(user) };
	const archive = { storage: 'local', key: 'key', sha256: 'digest', size: file.size, encryptionKey: 'secret', iv: 'iv', authTag: 'tag' };
	const evidence = { archive: vi.fn().mockResolvedValue(archive), delete: vi.fn().mockResolvedValue(undefined) };
	const repositories = new Map<unknown, unknown>([
		[MiUserProfile, profiles], [MiNote, notes], [MiNoteReaction, reactions], [MiPoll, polls], [MiChatMessage, messages],
		[MiPage, pages], [MiGalleryPost, galleries], [MiFlash, plays], [MiFollowing, followings], [MiDriveFile, files], [MiChatRoom, rooms], [MiUser, users],
	]);
	const manager = { getRepository: vi.fn((entity: unknown) => repositories.get(entity)) };
	const roles = { isModerator: vi.fn().mockResolvedValue(false) };
	const service = new AbuseReportSnapshotService(
		{ url: 'https://example.com' } as never,
		noteEntities as never, fileEntities as never, chat as never, roles as never, evidence as never,
	);
	const capture = (targetUser: MiUser, reportingUser: MiUser, target: AbuseReportTarget) => service.capture(targetUser, reportingUser, target, manager as never);
	return { manager, rooms, capture, user, reporter, note, file, profile, poll, message, page, gallery, play, profiles, notes, reactions, polls, messages, pages, galleries, plays, followings, files, noteEntities, chat, roles, users, evidence, archive };
}

describe('AbuseReportSnapshotService', () => {
	test('keeps note, author, poll and attachment evidence after sources change or disappear', async () => {
		const { capture, user, reporter, note, file, poll, notes, files, archive } = setup();
		const snapshot = await capture(user, reporter, { type: 'note', id: note.id });
		note.text = 'Edited text';
		note.cw = 'Edited warning';
		note.fileIds.length = 0;
		poll.choices[0] = 'Edited option';
		file.name = 'Edited image';
		file.comment = 'Edited description';
		user.name = 'Edited author';
		notes.findOneBy.mockResolvedValue(null);
		files.findBy.mockResolvedValue([]);
		expect(snapshot).toEqual({
			version: 1,
			capturedAt: expect.any(String),
			type: 'note',
			sourceUrl: 'https://example.com/notes/note',
			user: { id: 'author', username: 'author', host: null, name: 'Original author' },
			content: 'Original warning\n\nOriginal text\n\nFirst option\n\nSecond option',
			files: [{ id: 'file', name: 'Original image', type: 'image/png', size: 123, url: 'https://example.com/image.png', comment: 'Original description', archive }],
		});
		expect(Number.isNaN(Date.parse(snapshot.capturedAt))).toBe(false);
		await expect(capture(user, reporter, { type: 'note', id: note.id })).rejects.toThrow('INVALID_REPORT_TARGET');
	});

	test.each(['missing', 'other author', 'invisible', 'deleted'])('rejects a %s note', async (state) => {
		const { capture, user, reporter, note, notes, noteEntities, files } = setup();
		if (state === 'missing') notes.findOneBy.mockResolvedValue(null);
		if (state === 'other author') note.userId = 'different-user';
		if (state === 'invisible') noteEntities.isContentVisible.mockResolvedValue(false);
		if (state === 'deleted') note.threadId = `${DELETED_REPLY_THREAD_PREFIX}parent`;
		await expect(capture(user, reporter, { type: 'note', id: note.id })).rejects.toThrow('INVALID_REPORT_TARGET');
		expect(files.findBy).not.toHaveBeenCalled();
	});

	test('captures only public profile information as independent text', async () => {
		const { capture, user, reporter, profile } = setup();
		const snapshot = await capture(user, reporter, { type: 'user' });
		profile.description = 'Edited biography';
		profile.fields[0].value = 'Edited field';
		expect(snapshot.content).toBe('Original author\n\nOriginal biography\n\nSite: https://example.com');
		expect(JSON.stringify(snapshot)).not.toContain(profile.email);
		await expect(capture(user, reporter, { type: 'user', id: 'another-user' })).rejects.toThrow('INVALID_REPORT_TARGET');
	});

	test('captures the stored Boost text belonging to the reported user on the visible note', async () => {
		const { capture, user, reporter, note, reactions } = setup();
		note.userId = 'someone-else';
		const snapshot = await capture(user, reporter, { type: 'boost', id: note.id, reaction: 'text:Original Boost' });
		reactions.findOneBy.mockResolvedValue(null);
		expect(snapshot.content).toBe('Original Boost');
		expect(snapshot.sourceUrl).toBe('https://example.com/notes/note');
		expect(snapshot.files).toEqual([]);
		expect(reactions.findOneBy).toHaveBeenCalledWith({ noteId: note.id, userId: user.id });
	});

	test.each([
		[':smile@.:', ':smile:'],
		['❤', '❤️'],
		['text:café', 'text:cafe\u0301'],
	])('recognizes reaction aliases %s and %s', async (stored, requested) => {
		const { capture, user, reporter, reactions } = setup();
		reactions.findOneBy.mockResolvedValue({ reaction: stored });
		const snapshot = await capture(user, reporter, { type: 'boost', id: 'note', reaction: requested });
		expect(snapshot.content).toBe(stored.replace(/^text:/, ''));
	});

	test.each(['missing', 'different reaction', 'invisible note'])('rejects a Boost with %s', async (state) => {
		const { capture, user, reporter, reactions, noteEntities } = setup();
		if (state === 'missing') reactions.findOneBy.mockResolvedValue(null);
		if (state === 'invisible note') noteEntities.isContentVisible.mockResolvedValue(false);
		await expect(capture(user, reporter, { type: 'boost', id: 'note', reaction: 'text:Different Boost' })).rejects.toThrow('INVALID_REPORT_TARGET');
	});

	test('captures exact private message text for its recipient', async () => {
		const { capture, user, reporter, message } = setup();
		message.text = '  Original\nmessage  ';
		const snapshot = await capture(user, reporter, { type: 'chat', id: message.id });
		message.text = '';
		expect(snapshot.content).toBe('  Original\nmessage  ');
		expect(snapshot.files).toHaveLength(1);
	});

	test.each(['unrelated recipient', 'other sender', 'no read access', 'unjoined room', 'deleted room'])('rejects chat evidence for %s', async (state) => {
		const { capture, user, reporter, message, chat, rooms, files } = setup();
		if (state === 'unrelated recipient') message.toUserId = 'another-user';
		if (state === 'other sender') message.fromUserId = 'another-user';
		if (state === 'no read access') chat.getChatAvailability.mockResolvedValue({ read: false, write: false });
		if (state === 'unjoined room' || state === 'deleted room') message.toRoomId = 'room';
		if (state === 'deleted room') rooms.findOneBy.mockResolvedValue(null);
		await expect(capture(user, reporter, { type: 'chat', id: message.id })).rejects.toThrow('INVALID_REPORT_TARGET');
		expect(files.findBy).not.toHaveBeenCalled();
	});

	test('allows room evidence only when the reporter can view its timeline', async () => {
		const { capture, user, reporter, message, chat } = setup();
		message.toRoomId = 'room';
		chat.hasPermissionToViewRoomTimeline.mockResolvedValue(true);
		const snapshot = await capture(user, reporter, { type: 'chat', id: message.id });
		expect(chat.hasPermissionToViewRoomTimeline).toHaveBeenCalledWith(reporter.id, { id: 'room' });
		expect(snapshot.content).toBe('Private message');
	});

	test('retains the complete Page document and script while restricting attachment ownership', async () => {
		const { capture, user, reporter, page, files } = setup();
		const snapshot = await capture(user, reporter, { type: 'page', id: page.id });
		page.content[0].text = 'Edited page content';
		page.script = 'Edited page script';
		expect(snapshot.content).toContain('Page original content');
		expect(snapshot.content).toContain('Original page script');
		expect(snapshot.content).not.toContain('Edited');
		expect(snapshot.sourceUrl).toBe('https://example.com/@author/pages/page%20name');
		expect(files.findBy).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id }));
	});

	test.each(['followers', 'specified'])('rejects a %s Page until the reporter has access', async (visibility) => {
		const { capture, user, reporter, page, followings } = setup();
		page.visibility = visibility;
		await expect(capture(user, reporter, { type: 'page', id: page.id })).rejects.toThrow('INVALID_REPORT_TARGET');
		if (visibility === 'followers') followings.existsBy.mockResolvedValue(true);
		if (visibility === 'specified') page.visibleUserIds = [reporter.id];
		await expect(capture(user, reporter, { type: 'page', id: page.id })).resolves.toMatchObject({ type: 'page' });
	});

	test.each(['page', 'gallery', 'play'] as const)('rejects a %s owned by someone else or already deleted', async (type) => {
		const { capture, user, reporter, page, gallery, play, pages, galleries, plays } = setup();
		const value = { page, gallery, play }[type];
		const repository = { page: pages, gallery: galleries, play: plays }[type];
		value.userId = 'another-user';
		await expect(capture(user, reporter, { type, id: value.id })).rejects.toThrow('INVALID_REPORT_TARGET');
		repository.findOneBy.mockResolvedValue(null);
		await expect(capture(user, reporter, { type, id: value.id })).rejects.toThrow('INVALID_REPORT_TARGET');
	});

	test('retains Gallery text and publicly linkable Play code independently of their current content', async () => {
		const { capture, user, reporter, gallery, play } = setup();
		const gallerySnapshot = await capture(user, reporter, { type: 'gallery', id: gallery.id });
		const playSnapshot = await capture(user, reporter, { type: 'play', id: play.id });
		gallery.description = '';
		play.script = '';
		expect(gallerySnapshot.content).toBe('Gallery title\n\nGallery description');
		expect(gallerySnapshot.files).toHaveLength(1);
		expect(playSnapshot.content).toBe('Play title\n\nPlay summary\n\nOriginal play script');
	});

	test('captures a pure repost original text, author and attachments from the same transaction', async () => {
		const { capture, user, reporter, note, notes, users, evidence } = setup();
		const original = { ...note, id: 'original', userId: 'originalauthor', renoteId: null, hasPoll: false };
		note.text = '';
		note.cw = '';
		note.hasPoll = false;
		note.fileIds = [];
		note.renoteId = original.id;
		notes.findOneBy.mockImplementation(async ({ id }: { id: string }) => id === original.id ? original : note);
		users.findOneBy.mockResolvedValue({ id: original.userId, username: 'originalauthor', host: 'remote.example' });
		const snapshot = await capture(user, reporter, { type: 'note', id: note.id });
		expect(snapshot.content).toBe('https://example.com/notes/original\n@originalauthor@remote.example\nOriginal warning\n\nOriginal text');
		expect(snapshot.files).toHaveLength(1);
		expect(evidence.archive).toHaveBeenCalledOnce();
	});

	test.each(['cycle', 'invisible'])('rejects a repost reference with %s without archiving partial evidence', async state => {
		const { capture, user, reporter, note, notes, noteEntities, evidence } = setup();
		note.renoteId = state === 'cycle' ? note.id : 'hidden';
		if (state === 'invisible') {
			notes.findOneBy.mockResolvedValueOnce(note).mockResolvedValueOnce({ ...note, id: 'hidden' });
			noteEntities.isContentVisible.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		}
		await expect(capture(user, reporter, { type: 'note', id: note.id })).rejects.toThrow('INVALID_REPORT_TARGET');
		expect(evidence.archive).not.toHaveBeenCalled();
	});

	test('removes previously archived files when another attachment fails', async () => {
		const { capture, user, reporter, note, file, files, evidence, archive } = setup();
		note.fileIds = [file.id, 'second'];
		files.findBy.mockResolvedValue([file, { ...file, id: 'second' }]);
		evidence.archive.mockResolvedValueOnce(archive).mockRejectedValueOnce(new Error('REPORT_EVIDENCE_UNAVAILABLE'));
		await expect(capture(user, reporter, { type: 'note', id: note.id })).rejects.toThrow('REPORT_EVIDENCE_UNAVAILABLE');
		expect(evidence.delete).toHaveBeenCalledExactlyOnceWith(archive);
	});
});
