/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';
import { editNote } from '@/utility/edit-note.js';

const mocks = vi.hoisted(() => ({ post: vi.fn(), apiWithDialog: vi.fn() }));
vi.mock('@/os.js', () => mocks);
vi.mock('@/i.js', () => ({ $i: { id: 'self' } }));

const note = {
	id: 'comment', userId: 'self', user: { id: 'self', host: null },
	replyId: 'parent', renoteId: null, text: 'Original', cw: null,
	reactions: { '\u2764\ufe0f': 12 }, repliesCount: 3, files: [{ id: 'file' }],
} as unknown as Misskey.entities.Note;

describe('note editing', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	test('fetches the latest content before opening the complete composer', async () => {
		const latest = { ...note, text: 'Changed elsewhere', files: [{ id: 'new-file' }] };
		mocks.apiWithDialog.mockResolvedValue(latest);
		await editNote(note);
		expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith('notes/show', { noteId: note.id });
		expect(mocks.post).toHaveBeenCalledExactlyOnceWith({ editingNote: latest });
		expect(note.text).toBe('Original');
	});

	test.each([
		['a reply', { replyId: 'parent' }],
		['an ordinary post', { replyId: null }],
		['a quote', { replyId: null, renoteId: 'quoted' }],
	] as const)('opens %s with its original identity and relationships', async (_label, overrides) => {
		const original = { ...note, ...overrides };
		mocks.apiWithDialog.mockResolvedValue(original);
		await editNote(original);
		expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith('notes/show', { noteId: original.id });
		expect(mocks.post).toHaveBeenCalledExactlyOnceWith({ editingNote: original });
		expect(original.repliesCount).toBe(3);
		expect(original.reactions).toEqual({ '\u2764\ufe0f': 12 });
		expect(original.files).toEqual([{ id: 'file' }]);
	});

	test('does not open a stale editor when loading the note fails', async () => {
		mocks.apiWithDialog.mockRejectedValue(new Error('Offline'));
		await editNote(note);
		expect(mocks.post).not.toHaveBeenCalled();
		expect(note.text).toBe('Original');
	});

	test('does not open the editor for a note deleted after its preview was loaded', async () => {
		mocks.apiWithDialog.mockResolvedValue({ ...note, isDeleted: true });
		await editNote(note);
		expect(mocks.post).not.toHaveBeenCalled();
	});

	test('does not offer writes for another author, a remote note or a pure renote', async () => {
		await editNote({ ...note, userId: 'other' });
		await editNote({ ...note, user: { ...note.user, host: 'remote.test' } });
		await editNote({ ...note, replyId: null, renoteId: 'quoted', text: null, cw: null, fileIds: [], files: [], poll: undefined });
		expect(mocks.post).not.toHaveBeenCalled();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
	});
});
