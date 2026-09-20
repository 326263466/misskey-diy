/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import * as mfm from 'mfm-js';
import type * as Misskey from 'misskey-js';
import MkPostForm from '@/components/MkPostForm.vue';
import MkPostFormDialog from '@/components/MkPostFormDialog.vue';
import { globalEvents } from '@/events.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	confirm: vi.fn(), apiWithDialog: vi.fn(), misskeyApi: vi.fn(), popupMenu: vi.fn(), select: vi.fn(),
	closeModal: vi.fn(), finishClose: null as null | (() => void), chooseDriveFile: vi.fn(),
	incNotesCount: vi.fn(), claimAchievement: vi.fn(), getPluginHandlers: vi.fn(() => []),
	globalHashtags: '#default', globalWithHashtags: true,
}));
vi.mock('@/os.js', () => mocks);
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.misskeyApi }));
vi.mock('@/i.js', () => ({
	ensureSignin: () => ({ id: 'self', username: 'self', host: null, isSilenced: false, policies: { scheduledNoteLimit: 10 } }),
	$i: { id: 'self' }, notesCount: 0, incNotesCount: mocks.incNotesCount,
}));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: {
		s: { showPreview: false, reactionAcceptance: null },
		r: { tips: ref({ postForm: true }) },
		model: (key: string) => ref(key === 'postFormHashtags' ? mocks.globalHashtags : mocks.globalWithHashtags),
		set: vi.fn(),
	} };
});
vi.mock('@/preferences.js', () => ({ prefer: {
	s: { keepCw: true, defaultNoteVisibility: 'public', defaultNoteLocalOnly: false },
	commit: vi.fn(),
} }));
vi.mock('@/instance.js', () => ({ instance: { maxNoteTextLength: 3000 } }));
vi.mock('@/accounts.js', () => ({ getAccounts: vi.fn(), getAccountMenu: vi.fn() }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: mocks.getPluginHandlers }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: mocks.claimAchievement }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: mocks.chooseDriveFile }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: vi.fn() }));
vi.mock('@/utility/mfm-function-picker.js', () => ({ mfmFunctionPicker: vi.fn() }));
vi.mock('@/utility/tour.js', () => ({ startTour: vi.fn() }));
vi.mock('@/tips.js', () => ({ closeTip: vi.fn() }));
vi.mock('@/components/MkNoteSimple.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkNotePreview.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkPostFormAttaches.vue', () => ({ default: {
	props: ['modelValue', 'editing', 'disabled'],
	emits: ['detach', 'update:modelValue'],
	template: `<div data-testid="attachments" :data-editing="editing" :data-disabled="disabled">
		<button v-for="file in modelValue" :key="file.id" :disabled="disabled" @click="$emit('detach', file.id)">{{ file.name }}</button>
		<button :disabled="disabled" @click="$emit('update:modelValue', [...modelValue].reverse())">Reverse attachment order</button>
	</div>`,
} }));
vi.mock('@/components/MkUploaderItems.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkPollEditor.vue', () => ({ default: { template: '<div data-testid="poll-editor"/>' } }));
vi.mock('@/components/MkPoll.vue', () => ({ default: {
	props: { choices: Array, readOnly: Boolean },
	template: '<div data-testid="published-poll" :data-readonly="readOnly"><span v-for="choice in choices" :key="choice.text">{{ choice.text }}: {{ choice.votes }}</span></div>',
} }));
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

function makeNote(overrides: Partial<Misskey.entities.Note> = {}): Misskey.entities.Note {
	return {
		id: 'edited-note', userId: 'self', user: { id: 'self', username: 'self', host: null },
		text: 'Original #topic', cw: 'Original warning', visibility: 'followers', localOnly: true,
		files: [{ id: 'file-a', name: 'First attachment', properties: {} }, { id: 'file-b', name: 'Second attachment', properties: {} }],
		fileIds: ['file-a', 'file-b'], reactionAcceptance: 'nonSensitiveOnly', emojis: {},
		replyId: null, renoteId: null, repliesCount: 3, reactions: { ':wave:': 4 }, likeCount: 5,
		...overrides,
	} as Misskey.entities.Note;
}

const globalOptions = {
	stubs: { MkTip: true, MkEllipsis: true, MkAcct: true, MkTime: true, I18n: true },
	directives: { tooltip: () => {}, 'click-anime': () => {} },
};

async function renderEdit(note = makeNote()) {
	const form = ref<InstanceType<typeof MkPostForm>>();
	const view = render(defineComponent({
		setup: () => () => h(MkPostForm, { editingNote: note, ref: form, autofocus: false }),
	}), { global: globalOptions });
	await nextTick();
	await nextTick();
	return { ...view, form: form.value!, textarea: view.getByTestId('post-form-text') as HTMLTextAreaElement };
}

describe('post composer editing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		mocks.confirm.mockResolvedValue({ canceled: false });
		mocks.misskeyApi.mockResolvedValue([]);
		mocks.apiWithDialog.mockImplementation(async (_endpoint, data) => ({ ...makeNote(), ...data, tags: ['changed'], files: [] }));
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('loads text, warning, attachments and settings without making an untouched edit dirty', async () => {
		const note = makeNote();
		const view = await renderEdit(note);
		expect(view.textarea.value).toBe('Original');
		expect((view.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#topic');
		expect((view.getByPlaceholderText(i18n.ts.annotation) as HTMLInputElement).value).toBe('Original warning');
		expect(view.getByText('First attachment')).toBeTruthy();
		expect(view.getByText('Second attachment')).toBeTruthy();
		expect(view.getByTestId('attachments').getAttribute('data-editing')).toBe('true');
		expect(view.getByTestId('post-form-submit').textContent).toContain(i18n.ts.save);
		expect(await view.form.canClose()).toBe(true);
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		expect(note.files).toHaveLength(2);
	});

	test('separates parsed topics from editable text while preserving literal hashes', async () => {
		const body = '`#literal`\n[Reference](https://example.com/#fragment)\n<plain>#plain</plain>';
		const note = makeNote({ text: `#First\n${body}\n<b>#Second</b> #first`, tags: ['first', 'second'] });
		const view = await renderEdit(note);
		expect(mfm.parse(view.textarea.value)).toEqual(mfm.parse(body));
		expect((view.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#First #Second');
		expect(await view.form.canClose()).toBe(true);
		expect(mocks.confirm).not.toHaveBeenCalled();
	});

	test('preserves the original raw text when only attachments change', async () => {
		const note = makeNote({ text: '#First\n<b>Original</b>\n\n#Second #first  ' });
		const view = await renderEdit(note);
		await fireEvent.click(view.getByText('Reverse attachment order'));
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].text).toBe(note.text);
		expect(mocks.apiWithDialog.mock.calls[0][1].expected.text).toBe(note.text);
	});

	test('keeps new inline topics and edited topic fields when saving', async () => {
		const view = await renderEdit();
		await fireEvent.update(view.textarea, 'Changed #inline');
		await fireEvent.update(view.getByRole('combobox', { name: i18n.ts.hashtags }), '#replacement #Second');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].text).toBe('Changed #inline #replacement #Second');
	});

	test.each(['change', 'disable'])('retains topics from the original warning when its content is changed: %s', async action => {
		const view = await renderEdit(makeNote({ text: 'Body', cw: 'Warning #Topic', tags: ['topic'] }));
		expect((view.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#topic');
		if (action === 'change') {
			await fireEvent.update(view.getByPlaceholderText(i18n.ts.annotation), 'Changed warning');
		} else {
			await fireEvent.click(view.container.querySelector('.ti-eye-off')!.parentElement!);
		}
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].text).toBe('Body #topic');
		expect(mocks.apiWithDialog.mock.calls[0][1].cw).toBe(action === 'change' ? 'Changed warning' : null);
	});

	test('can save a topic-only post after moving its topics out of the body', async () => {
		const view = await renderEdit(makeNote({ text: '#Only', cw: null, files: [], fileIds: [] }));
		expect(view.textarea.value).toBe('');
		expect((view.getByTestId('post-form-submit') as HTMLButtonElement).disabled).toBe(false);
		await fireEvent.update(view.getByRole('combobox', { name: i18n.ts.hashtags }), '#Updated');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].text).toBe('#Updated');
	});

	test('retains server topics for a media post when adding a caption', async () => {
		const view = await renderEdit(makeNote({ text: null, tags: ['Photo'] }));
		expect(view.textarea.value).toBe('');
		expect((view.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#Photo');
		await fireEvent.update(view.textarea, 'Caption');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].text).toBe('Caption #Photo');
	});

	test('counts topic fields toward the edited note length limit', async () => {
		const view = await renderEdit();
		await fireEvent.update(view.getByRole('combobox', { name: i18n.ts.hashtags }), `#${'a'.repeat(3000)}`);
		expect((view.getByTestId('post-form-submit') as HTMLButtonElement).disabled).toBe(true);
	});

	test('restores original topics alongside the body when resetting an edit', async () => {
		const view = await renderEdit();
		await fireEvent.update(view.textarea, 'Changed');
		await fireEvent.update(view.getByRole('combobox', { name: i18n.ts.hashtags }), '#Changed');
		await fireEvent.click(view.container.querySelector('.ti-dots')!.parentElement!);
		const menu = mocks.popupMenu.mock.calls[0][0];
		await menu.find((item: { text?: string }) => item.text === i18n.ts.reset).action();
		await nextTick();
		expect(view.textarea.value).toBe('Original');
		expect((view.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#topic');
		expect(await view.form.canClose()).toBe(true);
		expect(mocks.confirm).toHaveBeenCalledOnce();
	});

	test('updates the original ID, preserves publication and counters, and does not append default hashtags', async () => {
		const note = makeNote();
		const emit = vi.spyOn(globalEvents, 'emit');
		const view = await renderEdit(note);
		await fireEvent.update(view.textarea, 'Changed #changed');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('notes/update', {
			noteId: note.id, text: 'Changed #changed #topic', cw: note.cw, fileIds: ['file-a', 'file-b'], reactionAcceptance: 'nonSensitiveOnly',
			expected: { text: note.text, cw: note.cw, fileIds: note.fileIds, reactionAcceptance: note.reactionAcceptance },
		});
		expect(emit).toHaveBeenCalledExactlyOnceWith('noteEdited', note.id, {
			text: 'Changed #changed #topic', cw: note.cw, tags: ['changed'], emojis: {},
			files: [], fileIds: ['file-a', 'file-b'], reactionAcceptance: 'nonSensitiveOnly',
		});
		expect(mocks.misskeyApi).not.toHaveBeenCalled();
		expect(mocks.getPluginHandlers).not.toHaveBeenCalledWith('note_post_interruptor');
		expect(mocks.incNotesCount).not.toHaveBeenCalled();
		expect(mocks.claimAchievement).not.toHaveBeenCalled();
		expect(note.text).toBe('Original #topic');
		expect(note.repliesCount).toBe(3);
		expect(note.likeCount).toBe(5);
		expect(note.reactions).toEqual({ ':wave:': 4 });
		expect(JSON.parse(localStorage.getItem('drafts') ?? '{}')[`edit:${note.id}`]).toBeUndefined();
	});

	test('reorders and detaches associations while leaving the original attachment array untouched', async () => {
		const note = makeNote();
		const view = await renderEdit(note);
		await fireEvent.click(view.getByText('Reverse attachment order'));
		await fireEvent.click(view.getByText('First attachment'));
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].fileIds).toEqual(['file-b']);
		expect(note.fileIds).toEqual(['file-a', 'file-b']);
		expect(note.files?.map(file => file.id)).toEqual(['file-a', 'file-b']);
	});

	test('sends an empty attachment array when all attachments are detached', async () => {
		const view = await renderEdit();
		await fireEvent.click(view.getByText('First attachment'));
		await fireEvent.click(view.getByText('Second attachment'));
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].fileIds).toEqual([]);
	});

	test('can attach an existing drive file and save its new association', async () => {
		const view = await renderEdit();
		mocks.chooseDriveFile.mockResolvedValue([{ id: 'file-c', name: 'Third attachment' }]);
		await fireEvent.click(view.container.querySelector('.ti-cloud-download')!.parentElement!);
		await waitFor(() => expect(view.getByText('Third attachment')).toBeTruthy());
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].fileIds).toEqual(['file-a', 'file-b', 'file-c']);
	});

	test.each(['', ' \n '])('allows removing the body while keeping attachments: %j', async text => {
		const view = await renderEdit();
		await fireEvent.update(view.textarea, text);
		await fireEvent.update(view.getByRole('combobox', { name: i18n.ts.hashtags }), '');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].text).toBeNull();
		expect(mocks.apiWithDialog.mock.calls[0][1].fileIds).toEqual(['file-a', 'file-b']);
	});

	test('fixes audience, account, publishing and poll controls while allowing reaction setting edits', async () => {
		const reply = makeNote({ id: 'parent', userId: 'other' });
		const view = await renderEdit(makeNote({ replyId: reply.id, reply, isPublishedReply: false }));
		expect((view.getByTestId('post-form-publish-reply') as HTMLInputElement).disabled).toBe(true);
		for (const icon of ['.ti-lock', '.ti-rocket-off', '.ti-chart-arrows']) {
			expect((view.container.querySelector(icon)!.closest('button') as HTMLButtonElement).disabled).toBe(true);
		}
		expect((view.container.querySelector('img')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(view.container.querySelector('.ti-dots')!.parentElement!);
		const menu = mocks.popupMenu.mock.calls[0][0];
		expect(menu.some((item: { text?: string }) => item.text === i18n.ts._drafts.saveToDraft)).toBe(false);
		expect(menu.some((item: { icon?: string }) => item.icon === 'ti ti-calendar-time')).toBe(false);
		mocks.select.mockResolvedValue({ canceled: false, result: 'likeOnly' });
		await menu.find((item: { text?: string }) => item.text === i18n.ts.reactionAcceptance).action();
		await nextTick();
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].reactionAcceptance).toBe('likeOnly');
	});

	test('shows published poll results read-only and leaves poll data out of updates', async () => {
		const poll = { multiple: true, expiresAt: null, choices: [{ text: 'A', votes: 7, isVoted: false }, { text: 'B', votes: 2, isVoted: false }] };
		const view = await renderEdit(makeNote({ poll }));
		expect(view.getByTestId('published-poll').getAttribute('data-readonly')).toBe('true');
		expect(view.getByText('A: 7')).toBeTruthy();
		expect(view.queryByTestId('poll-editor')).toBeNull();
		await fireEvent.update(view.textarea, 'Changed');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1]).not.toHaveProperty('poll');
		expect(poll.choices[0].votes).toBe(7);
	});

	test('confirms unsaved changes and retains text and attachments after failure', async () => {
		const view = await renderEdit();
		await fireEvent.update(view.textarea, 'Unsaved edit');
		await fireEvent.click(view.getByText('First attachment'));
		mocks.confirm.mockResolvedValueOnce({ canceled: true });
		expect(await view.form.canClose()).toBe(false);
		mocks.apiWithDialog.mockRejectedValueOnce(new Error('Offline'));
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect((view.getByTestId('post-form-submit') as HTMLButtonElement).disabled).toBe(false));
		expect(view.textarea.value).toBe('Unsaved edit');
		expect(view.getByText('Second attachment')).toBeTruthy();
		expect(view.queryByText('First attachment')).toBeNull();
		expect(JSON.parse(localStorage.getItem('drafts')!)['edit:edited-note']).toBeDefined();
	});

	test('keeps edit drafts separate and restores them only for the same source version', async () => {
		const note = makeNote();
		localStorage.setItem('drafts', JSON.stringify({ 'note:self': { data: { text: 'Ordinary draft' } } }));
		const first = await renderEdit(note);
		await fireEvent.update(first.textarea, 'Unfinished edit');
		await fireEvent.update(first.getByRole('combobox', { name: i18n.ts.hashtags }), '#DraftTopic');
		first.unmount();
		const restored = await renderEdit(note);
		expect(restored.textarea.value).toBe('Unfinished edit');
		expect((restored.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#DraftTopic');
		restored.unmount();
		const latest = await renderEdit({ ...note, text: 'Newer server content' });
		expect(latest.textarea.value).toBe('Newer server content');
		expect(JSON.parse(localStorage.getItem('drafts')!)['note:self'].data.text).toBe('Ordinary draft');
	});

	test('prevents duplicate saves and closing while the original note is being updated', async () => {
		let finish!: (note: Misskey.entities.Note) => void;
		mocks.apiWithDialog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const view = await renderEdit();
		await fireEvent.update(view.textarea, 'Changed');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		expect(await view.form.canClose()).toBe(false);
		expect(view.getByTestId('attachments').getAttribute('data-disabled')).toBe('true');
		await fireEvent.keyDown(view.textarea, { key: 'Enter', ctrlKey: true });
		expect(mocks.apiWithDialog).toHaveBeenCalledOnce();
		finish(makeNote({ text: 'Changed' }));
		await waitFor(() => expect(view.form.canClose()).resolves.toBe(true));
	});

	test('does not clear the saved edit draft when the dialog closes', async () => {
		const view = render(MkPostFormDialog, { props: { editingNote: makeNote() }, global: globalOptions });
		await nextTick();
		await nextTick();
		const textarea = view.getByTestId('post-form-text') as HTMLTextAreaElement;
		await fireEvent.update(textarea, 'Resume later');
		await fireEvent.keyDown(textarea, { key: 'Escape' });
		await waitFor(() => expect(mocks.closeModal).toHaveBeenCalledOnce());
		mocks.finishClose!();
		await nextTick();
		expect(JSON.parse(localStorage.getItem('drafts')!)['edit:edited-note'].data.text).toBe('Resume later');
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
	});
});
