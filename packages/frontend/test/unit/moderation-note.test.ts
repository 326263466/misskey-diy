/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkModerationNote from '@/components/MkModerationNote.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ form: vi.fn(), save: vi.fn() }));
vi.mock('@/os.js', () => ({ form: mocks.form }));
vi.mock('@/components/MkButton.vue', () => ({ default: {
	props: ['wait'],
	template: '<button :disabled="wait"><slot/></button>',
} }));

function renderNote(note = 'Saved note') {
	return render(MkModerationNote, { props: { modelValue: note, save: mocks.save } });
}

describe('moderation note dialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.form.mockResolvedValue({ canceled: true });
		mocks.save.mockResolvedValue(undefined);
	});
	afterEach(cleanup);

	test('opens a multiline dialog once without expanding an inline editor', async () => {
		let cancel: () => void = () => {};
		mocks.form.mockImplementation(() => new Promise(resolve => { cancel = () => resolve({ canceled: true }); }));
		const view = renderNote();
		const button = view.getByRole('button', { name: i18n.ts.moderationNote });
		await fireEvent.click(button);
		await fireEvent.click(button);
		expect(mocks.form).toHaveBeenCalledExactlyOnceWith(i18n.ts.moderationNote, {
			text: {
				type: 'string', multiline: true, label: i18n.ts.moderationNote,
				description: i18n.ts.moderationNoteDescription, default: 'Saved note',
			},
		});
		expect(view.queryByRole('textbox')).toBeNull();
		expect(button).toHaveProperty('disabled', true);
		expect(mocks.save).not.toHaveBeenCalled();
		cancel();
		await waitFor(() => expect(button).toHaveProperty('disabled', false));
		expect(view.emitted('update:modelValue')).toBeUndefined();
	});

	test.each([true, false])('does not save a canceled=%s or unchanged note', async canceled => {
		mocks.form.mockResolvedValue(canceled ? { canceled: true } : { result: { text: 'Saved note' } });
		const view = renderNote();
		const button = view.getByRole('button');
		await fireEvent.click(button);
		await waitFor(() => expect(button).toHaveProperty('disabled', false));
		expect(mocks.save).not.toHaveBeenCalled();
		expect(view.emitted('update:modelValue')).toBeUndefined();
	});

	test('updates the displayed note only after its save succeeds', async () => {
		let complete: () => void = () => {};
		mocks.form.mockResolvedValue({ result: { text: 'New note\nSecond line' } });
		mocks.save.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
		const view = renderNote();
		const button = view.getByRole('button');
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.save).toHaveBeenCalledExactlyOnceWith('New note\nSecond line'));
		expect(view.emitted('update:modelValue')).toBeUndefined();
		expect(button).toHaveProperty('disabled', true);
		complete();
		await waitFor(() => expect(view.emitted('update:modelValue')).toEqual([['New note\nSecond line']]));
		expect(button).toHaveProperty('disabled', false);
	});

	test('keeps the saved value and restores the draft after a failed save', async () => {
		mocks.form.mockResolvedValue({ result: { text: 'Unsaved draft' } });
		mocks.save.mockRejectedValueOnce(new Error('network unavailable'));
		const view = renderNote();
		const button = view.getByRole('button');
		await fireEvent.click(button);
		await waitFor(() => expect(button).toHaveProperty('disabled', false));
		expect(view.emitted('update:modelValue')).toBeUndefined();
		await fireEvent.click(button);
		expect(mocks.form.mock.lastCall?.[1].text.default).toBe('Unsaved draft');
		await waitFor(() => expect(view.emitted('update:modelValue')).toEqual([['Unsaved draft']]));
		expect(mocks.save).toHaveBeenCalledTimes(2);
	});

	test.each(['cancel', 'restore saved note'])('clears a failed draft after %s before opening again', async action => {
		mocks.form.mockResolvedValueOnce({ result: { text: 'Unsaved draft' } });
		mocks.save.mockRejectedValueOnce(new Error('network unavailable'));
		const view = renderNote();
		const button = view.getByRole('button');
		await fireEvent.click(button);
		await waitFor(() => expect(button).toHaveProperty('disabled', false));
		expect(mocks.save).toHaveBeenCalledExactlyOnceWith('Unsaved draft');

		mocks.form.mockResolvedValueOnce(action === 'cancel' ? { canceled: true } : { result: { text: 'Saved note' } });
		await fireEvent.click(button);
		expect(mocks.form.mock.lastCall?.[1].text.default).toBe('Unsaved draft');
		await waitFor(() => expect(button).toHaveProperty('disabled', false));
		expect(mocks.save).toHaveBeenCalledOnce();
		expect(view.emitted('update:modelValue')).toBeUndefined();

		await fireEvent.click(button);
		expect(mocks.form.mock.lastCall?.[1].text.default).toBe('Saved note');
		await waitFor(() => expect(button).toHaveProperty('disabled', false));
	});

	test('allows saving an empty note to clear its contents', async () => {
		mocks.form.mockResolvedValue({ result: { text: '' } });
		const view = renderNote();
		await fireEvent.click(view.getByRole('button'));
		await waitFor(() => expect(view.emitted('update:modelValue')).toEqual([['']]));
		expect(mocks.save).toHaveBeenCalledExactlyOnceWith('');
	});
});
