/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkPostForm from '@/components/MkPostForm.vue';
import MkPostFormDialog from '@/components/MkPostFormDialog.vue';
import { i18n } from '@/i18n.js';
import type { PostFormProps } from '@/types/post-form.js';

const mocks = vi.hoisted(() => ({
	confirm: vi.fn(), apiWithDialog: vi.fn(), closeModal: vi.fn(), finishClose: null as null | (() => void),
}));
vi.mock('@/os.js', () => mocks);
vi.mock('@/i.js', () => ({
	ensureSignin: () => ({ id: 'self', username: 'self', host: null, isSilenced: false }),
	$i: { id: 'self' }, notesCount: 0, incNotesCount: vi.fn(),
}));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: {
		s: { showPreview: false, reactionAcceptance: null },
		r: { tips: ref({ postForm: true }) },
		model: (key: string) => ref(key === 'postFormHashtags' ? '' : false),
		set: vi.fn(),
	} };
});
vi.mock('@/preferences.js', () => ({ prefer: {
	s: { keepCw: true, defaultNoteVisibility: 'public', defaultNoteLocalOnly: false },
	commit: vi.fn(),
} }));
vi.mock('@/instance.js', () => ({ instance: { maxNoteTextLength: 3000 } }));
vi.mock('@/accounts.js', () => ({ getAccounts: vi.fn(), getAccountMenu: vi.fn() }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: vi.fn() }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: vi.fn() }));
vi.mock('@/utility/mfm-function-picker.js', () => ({ mfmFunctionPicker: vi.fn() }));
vi.mock('@/utility/tour.js', () => ({ startTour: vi.fn() }));
vi.mock('@/tips.js', () => ({ closeTip: vi.fn() }));
vi.mock('@/components/MkNoteSimple.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkNotePreview.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkPostFormAttaches.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkUploaderItems.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkPollEditor.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		setup(_props, { slots, expose, emit }) {
			expose({ close: mocks.closeModal });
			mocks.finishClose = () => emit('closed');
			return () => h('div', slots.default?.());
		},
	}) };
});
vi.mock('@/composables/use-uploader.js', async () => {
	const { ref } = await import('vue');
	return { useUploader: () => ({
		items: ref([]), uploading: ref(false), readyForUpload: ref(true), allItemsUploaded: ref(true),
		events: { on: vi.fn() }, dispose: vi.fn(), abortAll: vi.fn(), reset: vi.fn(),
	}) };
});

function makeReply(overrides: Partial<Misskey.entities.Note> = {}): Misskey.entities.Note {
	return {
		id: 'parent', userId: 'other',
		user: { id: 'other', username: 'other', name: 'Other User', host: null },
		text: 'A post mentioning @third', cw: null, visibility: 'public', files: [],
		...overrides,
	} as Misskey.entities.Note;
}

async function renderForm(props: PostFormProps = {}) {
	const form = ref<InstanceType<typeof MkPostForm>>();
	const view = render(defineComponent({
		setup: () => () => h(MkPostForm, { ...props, ref: form, mock: true, autofocus: false }),
	}), {
		global: {
			stubs: { MkTip: true, MkEllipsis: true },
			directives: { tooltip: () => {}, 'click-anime': () => {} },
		},
	});
	await nextTick();
	return { ...view, form: form.value!, textarea: view.getByTestId('post-form-text') as HTMLTextAreaElement };
}

describe('post form closing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		mocks.confirm.mockResolvedValue({ canceled: false });
	});
	afterEach(cleanup);

	test('opens an empty reply with its recipient in the placeholder instead of inserting mentions', async () => {
		const view = await renderForm({ reply: makeReply() });
		expect(view.textarea.value).toBe('');
		expect(view.textarea.placeholder).toBe(i18n.tsx._drafts.replyTo({ user: 'Other User' }));
		expect(await view.form.canClose()).toBe(true);
		expect(mocks.confirm).not.toHaveBeenCalled();
	});

	test('falls back to the account name when the reply recipient has no display name', async () => {
		const reply = makeReply();
		reply.user.name = null;
		const view = await renderForm({ reply });
		expect(view.textarea.placeholder).toBe(i18n.tsx._drafts.replyTo({ user: 'other' }));
	});

	test('allows an untouched reply with an inherited content warning to close', async () => {
		const view = await renderForm({ reply: makeReply({ cw: 'Inherited warning' }) });
		expect(await view.form.canClose()).toBe(true);
		expect(mocks.confirm).not.toHaveBeenCalled();
	});

	test('confirms actual text, preserves it on cancellation, and closes directly once it is cleared', async () => {
		const view = await renderForm({ reply: makeReply() });
		await fireEvent.update(view.textarea, 'My reply');
		mocks.confirm.mockResolvedValueOnce({ canceled: true });
		expect(await view.form.canClose()).toBe(false);
		expect(view.textarea.value).toBe('My reply');
		expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ text: i18n.ts.leaveConfirm }));
		await fireEvent.update(view.textarea, '');
		expect(await view.form.canClose()).toBe(true);
		expect(mocks.confirm).toHaveBeenCalledTimes(1);
	});

	test('confirms a content warning edited by the user', async () => {
		const view = await renderForm({ reply: makeReply({ cw: 'Inherited warning' }) });
		await fireEvent.update(view.getByPlaceholderText(i18n.ts.annotation), 'Edited warning');
		expect(await view.form.canClose()).toBe(true);
		expect(mocks.confirm).toHaveBeenCalledOnce();
	});

	test('protects initial content and resets only the local form', async () => {
		const view = await renderForm({ initialText: 'Restored text' });
		expect(await view.form.canClose()).toBe(true);
		expect(mocks.confirm).toHaveBeenCalledOnce();
		view.form.clear();
		await nextTick();
		expect(view.textarea.value).toBe('');
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
	});

	test('keeps the content during the close transition and resets after the modal is closed', async () => {
		const view = render(MkPostFormDialog, {
			props: { initialText: 'Unsaved reply', instant: true },
			global: {
				stubs: { MkTip: true, MkEllipsis: true },
				directives: { tooltip: () => {}, 'click-anime': () => {} },
			},
		});
		const textarea = view.getByTestId('post-form-text') as HTMLTextAreaElement;
		await fireEvent.keyDown(textarea, { key: 'Escape' });
		await waitFor(() => expect(mocks.closeModal).toHaveBeenCalledOnce());
		expect(textarea.value).toBe('Unsaved reply');
		mocks.finishClose!();
		await nextTick();
		expect(textarea.value).toBe('');
		expect(view.emitted('closed')).toHaveLength(1);
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
	});
});
