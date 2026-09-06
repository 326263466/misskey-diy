/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';
import { editNote } from '@/utility/edit-note.js';
import { globalEvents } from '@/events.js';

const mocks = vi.hoisted(() => ({ form: vi.fn(), apiWithDialog: vi.fn() }));
vi.mock('@/os.js', () => mocks);
vi.mock('@/i.js', () => ({ $i: { id: 'self' } }));

const note = {
	id: 'comment', userId: 'self', user: { id: 'self', host: null },
	replyId: 'parent', renoteId: null, text: 'Original', cw: null,
	reactions: { '\u2764\ufe0f': 12 }, repliesCount: 3, files: [{ id: 'file' }],
} as unknown as Misskey.entities.Note;

describe('comment editing', () => {
	const onEdited = vi.fn();
	beforeEach(() => {
		vi.resetAllMocks();
		globalEvents.on('noteEdited', onEdited);
	});
	afterEach(() => globalEvents.off('noteEdited', onEdited));

	test('cancellation does not delete or change the comment', async () => {
		mocks.form.mockResolvedValue({ canceled: true });
		await editNote(note);
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		expect(onEdited).not.toHaveBeenCalled();
		expect(note.text).toBe('Original');
	});

	test('updates the existing ID and only publishes a content edit event', async () => {
		mocks.form.mockResolvedValue({ canceled: false, result: { text: 'Changed', cw: '' } });
		mocks.apiWithDialog.mockResolvedValue({ ...note, text: 'Changed', emojis: {} });
		await editNote(note);
		expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith('notes/update', { noteId: 'comment', text: 'Changed', cw: null });
		expect(onEdited).toHaveBeenCalledExactlyOnceWith('comment', { text: 'Changed', cw: null, emojis: {} });
		expect(note.repliesCount).toBe(3);
		expect(note.reactions).toEqual({ '\u2764\ufe0f': 12 });
		expect(note.files).toEqual([{ id: 'file' }]);
	});

	test('preserves the edit draft after a failed save and allows cancellation', async () => {
		mocks.form.mockResolvedValueOnce({ canceled: false, result: { text: 'Unsaved changes', cw: 'Warning' } }).mockResolvedValueOnce({ canceled: true });
		mocks.apiWithDialog.mockRejectedValue(new Error('Offline'));
		await editNote(note);
		expect(mocks.form.mock.calls[1][1].text.default).toBe('Unsaved changes');
		expect(mocks.form.mock.calls[1][1].cw.default).toBe('Warning');
		expect(onEdited).not.toHaveBeenCalled();
		expect(note.text).toBe('Original');
	});

	test('does not offer writes for another author or an ordinary post', async () => {
		await editNote({ ...note, userId: 'other' });
		await editNote({ ...note, replyId: null });
		expect(mocks.form).not.toHaveBeenCalled();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
	});
});
