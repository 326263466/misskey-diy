/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import * as mfm from 'mfm-js';
import type * as Misskey from 'misskey-js';
import MkPostForm from '@/components/MkPostForm.vue';
import MkPostFormDialog from '@/components/MkPostFormDialog.vue';
import { globalEvents } from '@/events.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import type { PostFormProps } from '@/types/post-form.js';

const mocks = vi.hoisted(() => ({
	confirm: vi.fn(), apiWithDialog: vi.fn(), misskeyApi: vi.fn(), popupMenu: vi.fn(), select: vi.fn(),
	closeModal: vi.fn(), finishClose: null as null | (() => void), chooseDriveFile: vi.fn(),
	incNotesCount: vi.fn(), claimAchievement: vi.fn(), getPluginHandlers: vi.fn(() => []),
	emojiPicker: vi.fn(),
	globalHashtags: '#default', globalWithHashtags: true,
	globalPreview: false, popup: vi.fn(), getAccountMenu: vi.fn(), alert: vi.fn(),
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
		s: { get showPreview() { return mocks.globalPreview; }, reactionAcceptance: null },
		r: { tips: ref({ postForm: true }) },
		model: (key: string) => ref(key === 'postFormHashtags' ? mocks.globalHashtags : mocks.globalWithHashtags),
		set: vi.fn(),
	} };
});
vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: {
		s: reactive({ keepCw: true, defaultNoteVisibility: 'public', defaultNoteLocalOnly: false, emojiStyle: 'twemoji' }),
		commit: vi.fn(),
	} };
});
vi.mock('@/instance.js', () => ({ instance: { maxNoteTextLength: 3000 } }));
vi.mock('@/accounts.js', () => ({ getAccounts: vi.fn(), getAccountMenu: mocks.getAccountMenu }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: mocks.getPluginHandlers }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: mocks.claimAchievement }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: mocks.chooseDriveFile }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: mocks.emojiPicker } }));
vi.mock('@/utility/emoji-mute.js', () => ({ checkMuted: () => ({ value: false }) }));
vi.mock('@/utility/mfm-function-picker.js', () => ({ mfmFunctionPicker: vi.fn() }));
vi.mock('@/utility/tour.js', () => ({ startTour: vi.fn() }));
vi.mock('@/tips.js', () => ({ closeTip: vi.fn() }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<a><slot/></a>' } }));
vi.mock('@/components/MkNoteSimple.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkNotePreview.vue', () => ({ default: { props: ['text'], template: '<div data-testid="post-preview">{{ text }}</div>' } }));
// Exercise the composer's stored topic model independently from picker search.
vi.mock('@/components/MkPostFormTopics.vue', async () => {
	const { i18n } = await import('@/i18n.js');
	return { default: {
		props: ['modelValue', 'enabled', 'disabled'],
		emits: ['update:modelValue', 'update:enabled'],
		setup: () => ({ label: i18n.ts.hashtags }),
		template: '<input role="combobox" :aria-label="label" :data-enabled="enabled" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'update:enabled\', !!$event.target.value)">',
	} };
});
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
		prefer.s.emojiStyle = 'twemoji';
		mocks.globalPreview = false;
		mocks.getAccountMenu.mockResolvedValue([]);
		mocks.popup.mockReturnValue({ dispose: vi.fn() });
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
		expect((view.getByPlaceholderText(i18n.ts._postForm.cwSummary) as HTMLInputElement).value).toBe('Original warning');
		expect(view.getByText('First attachment')).toBeTruthy();
		expect(view.getByText('Second attachment')).toBeTruthy();
		expect(view.getByTestId('attachments').getAttribute('data-editing')).toBe('true');
		expect(view.getByTestId('post-form-submit').textContent).toContain(i18n.ts.save);
		expect(await view.form.canClose()).toBe(true);
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		expect(note.files).toHaveLength(2);
	});

	test('focuses the summary when enabling hiding and preserves both fields when disabling it', async () => {
		const view = await renderEdit(makeNote({ text: '正文', cw: null }));
		const toggle = view.getByRole('button', { name: i18n.ts.useCw });
		await fireEvent.click(toggle);
		const summary = view.getByRole('textbox', { name: i18n.ts._postForm.cwSummary });
		expect(document.activeElement).toBe(summary);
		expect(summary.getAttribute('aria-required')).toBe('true');
		expect((view.getByTestId('post-form-submit') as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.update(summary, '可见摘要');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._postForm.cwRemove }));
		expect(document.activeElement).toBe(view.textarea);
		expect(view.textarea.value).toBe('正文');
		expect(toggle.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(toggle);
		expect((summary as HTMLInputElement).value).toBe('可见摘要');
		expect((view.getByTestId('post-form-submit') as HTMLButtonElement).disabled).toBe(false);
	});

	test('uses the selected emoji style inside both editing fields without changing their original content', async () => {
		const note = makeNote({ text: '管理员测试deepseek帖子🎉', cw: '内容警告🎉' });
		const view = await renderEdit(note);
		const warning = view.getByPlaceholderText(i18n.ts._postForm.cwSummary) as HTMLInputElement;
		for (const [style, src] of [
			['twemoji', '/twemoji/1f389.svg'],
			['fluentEmoji', '/fluent-emoji/1f389.png'],
			['native', null],
			['twemoji', '/twemoji/1f389.svg'],
		] as const) {
			prefer.s.emojiStyle = style;
			await nextTick();
			for (const input of [view.textarea, warning]) {
				const emoji = input.parentElement!.querySelector('img[alt="🎉"]');
				if (src) {
					expect(emoji?.getAttribute('src')).toBe(src);
					expect(emoji?.closest('[aria-hidden="true"]')).toBeTruthy();
				} else {
					expect(emoji).toBeNull();
				}
			}
			expect(view.textarea.value).toBe(note.text);
			expect(warning.value).toBe(note.cw);
			expect(await view.form.canClose()).toBe(true);
			expect(mocks.confirm).not.toHaveBeenCalled();
		}

		await fireEvent.click(view.getByText('Reverse attachment order'));
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1]).toEqual(expect.objectContaining({
			text: note.text,
			cw: note.cw,
			expected: expect.objectContaining({ text: note.text, cw: note.cw }),
		}));
	});

	test('updates the emoji inside both input fields and saves the edited Unicode text', async () => {
		const view = await renderEdit(makeNote({ text: 'Original', cw: 'Warning' }));
		const warning = view.getByPlaceholderText(i18n.ts._postForm.cwSummary) as HTMLInputElement;
		await fireEvent.update(view.textarea, '正文🎉\n后续文字');
		await fireEvent.update(warning, '警告😀');
		prefer.s.emojiStyle = 'fluentEmoji';
		await nextTick();
		expect(view.textarea.parentElement!.querySelector('img[alt="🎉"]')?.getAttribute('src')).toBe('/fluent-emoji/1f389.png');
		expect(warning.parentElement!.querySelector('img[alt="😀"]')?.getAttribute('src')).toBe('/fluent-emoji/1f600.png');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1]).toEqual(expect.objectContaining({
			text: '正文🎉\n后续文字', cw: '警告😀',
		}));
	});

	test('replaces a selection once and keeps following text when choosing multiple emoji', async () => {
		const view = await renderEdit(makeNote({ text: '前段replace后段' }));
		view.textarea.focus();
		view.textarea.setSelectionRange(2, 9);
		await fireEvent.click(view.container.querySelector('.ti-mood-happy')!.parentElement!);
		expect(view.textarea.readOnly).toBe(true);
		const [, choose, close] = mocks.emojiPicker.mock.calls[0];
		choose('🎉');
		await nextTick();
		expect(view.textarea.value).toBe('前段🎉后段');
		choose('😀');
		await nextTick();
		expect(view.textarea.value).toBe('前段🎉😀后段');
		close();
		await nextTick();
		expect(view.textarea.readOnly).toBe(false);
		expect(document.activeElement).toBe(view.textarea);
		expect(view.textarea.selectionStart).toBe(6);
		expect(view.textarea.selectionEnd).toBe(6);
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].text).toBe('前段🎉😀后段');
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
		const note = makeNote({ text: '#First\n<b>Original</b>\n\n#first  ' });
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
		await fireEvent.update(view.getByRole('combobox', { name: i18n.ts.hashtags }), '#replacement');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][1].text).toBe('Changed #inline #replacement');
	});

	test.each(['change', 'disable'])('retains topics from the original warning when its content is changed: %s', async action => {
		const view = await renderEdit(makeNote({ text: 'Body', cw: 'Warning #Topic', tags: ['topic'] }));
		expect((view.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#topic');
		if (action === 'change') {
			await fireEvent.update(view.getByPlaceholderText(i18n.ts._postForm.cwSummary), 'Changed warning');
		} else {
			await fireEvent.click(view.getByRole('button', { name: i18n.ts.useCw }));
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

	async function renderNew(props: PostFormProps & { fixed?: boolean } = {}) {
		const form = ref<InstanceType<typeof MkPostForm>>();
		const view = render(defineComponent({
			setup: () => () => h(MkPostForm, { ...props, ref: form, autofocus: false }),
		}), { global: globalOptions });
		await nextTick();
		await nextTick();
		const scoped = within(view.container);
		return { ...view, ...scoped, form: form.value!, textarea: scoped.getByTestId('post-form-text') as HTMLTextAreaElement };
	}

	test('lets each composer configure its initial rows without limiting or sharing the draft text', async () => {
		const ordinary = await renderNew();
		const compact = await renderNew({ initialRows: 3, initialText: 'First line' });
		const taller = await renderNew({ initialRows: 6 });
		expect(ordinary.textarea.hasAttribute('rows')).toBe(false);
		expect(compact.textarea.getAttribute('rows')).toBe('3');
		expect(taller.textarea.getAttribute('rows')).toBe('6');
		const longText = Array.from({ length: 8 }, (_, i) => `Line ${i}`).join('\n');
		await fireEvent.update(compact.textarea, longText);
		expect(compact.textarea.value).toBe(longText);
		expect(taller.textarea.value).toBe('');
		compact.form.clear();
		await nextTick();
		expect(compact.textarea.getAttribute('rows')).toBe('3');
	});

	test.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('keeps the default size for invalid initial rows (%s)', async initialRows => {
		const view = await renderNew({ initialRows });
		expect(view.textarea.hasAttribute('rows')).toBe(false);
	});

	test('saves a new post to server drafts only when the menu action is selected', async () => {
		const view = await renderNew();
		await fireEvent.update(view.textarea, 'Save this manually');
		await fireEvent.update(view.getByRole('combobox', { name: i18n.ts.hashtags }), '#Topic');
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		expect(localStorage.getItem('drafts')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.other }));
		await mocks.popupMenu.mock.calls.at(-1)![0].find((item: { text?: string }) => item.text === i18n.ts._drafts.saveToDraft).action();
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('notes/drafts/create', expect.objectContaining({ text: 'Save this manually', hashtag: '#Topic' }));
		expect(localStorage.getItem('drafts')).toBeNull();
	});

	test('starts new composers with defaults despite old global topics, preview and automatic local drafts', async () => {
		mocks.globalPreview = true;
		const storedDrafts = JSON.stringify({
			'note:self': { data: {
				text: 'Old unfinished post', useCw: true, cw: 'Old summary', hashtags: '#old', withHashtags: true,
				visibility: 'followers', localOnly: true, files: [{ id: 'old-file', name: 'Old attachment' }],
				poll: { choices: ['A', 'B'], multiple: false }, quoteId: 'old-quote',
				reactionAcceptance: 'likeOnly', scheduledAt: Date.now() + 100_000,
			} },
		});
		localStorage.setItem('drafts', storedDrafts);
		const view = await renderNew();
		const topics = view.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement;
		expect(view.textarea.value).toBe('');
		expect(topics.value).toBe('');
		expect(topics.getAttribute('data-enabled')).toBe('false');
		expect(view.getByRole('button', { name: i18n.ts.useCw }).getAttribute('aria-pressed')).toBe('false');
		expect(view.queryByTestId('post-preview')).toBeNull();
		expect(view.queryByText('Old attachment')).toBeNull();
		expect(view.queryByTestId('poll-editor')).toBeNull();
		expect(view.getByTestId('post-form-submit').textContent).toContain(i18n.ts._postForm.post);
		expect(view.getByRole('button', { name: `${i18n.ts.visibility}: ${i18n.ts._visibility.public}` })).toBeTruthy();
		await fireEvent.update(view.textarea, 'New text');
		await fireEvent.update(topics, '#new');
		await nextTick();
		const saved = JSON.parse(localStorage.getItem('drafts')!);
		expect(saved['note:self']).toEqual(JSON.parse(storedDrafts)['note:self']);
		expect(saved).toEqual(JSON.parse(storedDrafts));
		view.unmount();
		const reopened = await renderNew();
		expect(reopened.textarea.value).toBe('');
		expect((reopened.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('');
		expect(reopened.queryByRole('button', { name: i18n.ts._postForm.restoreDraft })).toBeNull();
		expect(localStorage.getItem('drafts')).toBe(storedDrafts);
	});

	test('isolates open composers and resets text, warning, topics and preview for a fresh instance', async () => {
		const first = await renderNew();
		await fireEvent.update(first.textarea, 'First composer');
		await fireEvent.update(first.getByRole('combobox', { name: i18n.ts.hashtags }), '#first');
		await fireEvent.click(first.getByRole('button', { name: i18n.ts.useCw }));
		await fireEvent.update(first.getByRole('textbox', { name: i18n.ts._postForm.cwSummary }), 'First summary');
		await fireEvent.click(first.getByRole('button', { name: i18n.ts.other }));
		const menu = mocks.popupMenu.mock.calls.at(-1)![0];
		menu.find((item: { text?: string }) => item.text === i18n.ts.preview).ref.value = true;
		await nextTick();
		expect(first.getByTestId('post-preview')).toBeTruthy();
		const second = await renderNew();
		expect(second.textarea.value).toBe('');
		expect((second.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('');
		expect(second.getByRole('button', { name: i18n.ts.useCw }).getAttribute('aria-pressed')).toBe('false');
		expect(second.queryByTestId('post-preview')).toBeNull();
		await fireEvent.update(second.getByRole('combobox', { name: i18n.ts.hashtags }), '#second');
		expect((first.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#first');
		second.unmount();
		first.form.clear();
		await nextTick();
		expect(first.textarea.value).toBe('');
		expect((first.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('');
		expect(first.getByRole('button', { name: i18n.ts.useCw }).getAttribute('aria-pressed')).toBe('false');
		expect(first.queryByTestId('post-preview')).toBeNull();
		first.unmount();
		const reopened = await renderNew();
		expect(reopened.textarea.value).toBe('');
		expect(reopened.queryByTestId('post-preview')).toBeNull();
	});

	test('retains explicit initial content and reply warning context while ignoring automatic drafts', async () => {
		const reply = makeNote({ id: 'parent', userId: 'other' });
		localStorage.setItem('drafts', JSON.stringify({ 'reply:parent': { data: { text: 'Stale reply', useCw: true, cw: 'Stale warning' } } }));
		const view = await renderNew({ reply, initialText: 'Explicit reply' });
		expect(view.textarea.value).toBe('Explicit reply');
		expect((view.getByRole('textbox', { name: i18n.ts._postForm.cwSummary }) as HTMLInputElement).value).toBe(reply.cw);
		view.unmount();
		const initial = await renderNew({ initialText: 'Shared text', initialCw: 'Shared warning', initialHashtags: ['Vue', 'ＶＵＥ'], initialFiles: [{ id: 'shared-file', name: 'Shared attachment' } as Misskey.entities.DriveFile], initialVisibility: 'home', initialLocalOnly: true });
		expect(initial.textarea.value).toBe('Shared text');
		expect((initial.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#Vue');
		expect(initial.getByRole('combobox', { name: i18n.ts.hashtags }).getAttribute('data-enabled')).toBe('true');
		expect((initial.getByRole('textbox', { name: i18n.ts._postForm.cwSummary }) as HTMLInputElement).value).toBe('Shared warning');
		expect(initial.getByText('Shared attachment')).toBeTruthy();
		expect(initial.getByRole('button', { name: `${i18n.ts.visibility}: ${i18n.ts._visibility.home}` })).toBeTruthy();
		expect(initial.getByRole('button', { name: i18n.ts._visibility.disableFederation }).getAttribute('aria-pressed')).toBe('true');
	});

	test('preserves multiple initial topics but blocks publishing until only one remains', async () => {
		const view = await renderNew({ initialText: 'Hello', initialHashtags: ['Vue', 'Misskey'] });
		const submit = view.getByTestId('post-form-submit') as HTMLButtonElement;
		const topics = view.getByRole('combobox', { name: i18n.ts.hashtags });
		expect((topics as HTMLInputElement).value).toBe('#Vue #Misskey');
		expect(submit.disabled).toBe(true);
		await fireEvent.keyDown(view.textarea, { key: 'Enter', ctrlKey: true });
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		await fireEvent.update(topics, '#Vue');
		expect(submit.disabled).toBe(false);
	});

	test('allows topic-only new posts and counts selected topics toward the complete post limit', async () => {
		const view = await renderNew();
		const submit = view.getByTestId('post-form-submit') as HTMLButtonElement;
		const topics = view.getByRole('combobox', { name: i18n.ts.hashtags });
		expect(submit.disabled).toBe(true);
		await fireEvent.update(topics, '#Only');
		expect(view.textarea.value).toBe('');
		expect(submit.disabled).toBe(false);
		await fireEvent.update(view.textarea, 'a'.repeat(2995));
		await fireEvent.update(topics, '#tag');
		expect(submit.disabled).toBe(false);
		await fireEvent.update(topics, '#tags');
		expect(submit.disabled).toBe(true);
		await fireEvent.update(topics, '');
		expect(submit.disabled).toBe(false);
	});

	test.each([
		'```\ndasdasdasdsad\n```',
		'```js\r\nconst value = "#literal";\r\n```',
		'```\ndasdasdasdsad\n```\n',
	])('preserves fenced code when adding a topic in both preview and submission: %j', async text => {
		mocks.misskeyApi.mockResolvedValue({ createdNote: makeNote() });
		const view = await renderNew({ initialText: text });
		await fireEvent.update(view.getByRole('combobox', { name: i18n.ts.hashtags }), '#Topic');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.other }));
		const menu = mocks.popupMenu.mock.calls.at(-1)![0];
		menu.find((item: { text?: string }) => item.text === i18n.ts.preview).ref.value = true;
		await nextTick();
		const previewText = view.getByTestId('post-preview').textContent!;
		expect(mfm.parse(previewText)).toEqual([...mfm.parse(text), { type: 'hashtag', props: { hashtag: 'Topic' } }]);
		expect(previewText).toBe(`${text}${text.endsWith('\n') ? '' : '\n'}#Topic`);
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.misskeyApi).toHaveBeenCalledWith('notes/create', expect.objectContaining({ text: previewText }), undefined));
	});

	test('explicit server drafts restore their topics and warning, and an empty topic draft disables the control', async () => {
		const view = await renderNew();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.account }));
		const accountMenu = mocks.popupMenu.mock.calls.at(-1)![0];
		accountMenu.find((item: { text?: string }) => item.text === i18n.ts._drafts.listDrafts).action();
		const restore = mocks.popup.mock.calls.at(-1)![2].restore;
		await restore({ id: 'server-draft', text: 'Saved draft', cw: 'Saved warning', hashtag: '#saved', visibility: 'public', localOnly: false, reactionAcceptance: null });
		await nextTick();
		const topics = view.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement;
		expect(view.textarea.value).toBe('Saved draft');
		expect(topics.value).toBe('#saved');
		expect(topics.getAttribute('data-enabled')).toBe('true');
		expect((view.getByRole('textbox', { name: i18n.ts._postForm.cwSummary }) as HTMLInputElement).value).toBe('Saved warning');
		await restore({ id: 'plain-draft', text: 'Plain saved draft', cw: null, hashtag: '', visibility: 'public', localOnly: false, reactionAcceptance: null });
		await nextTick();
		expect(view.textarea.value).toBe('Plain saved draft');
		expect(topics.value).toBe('');
		expect(topics.getAttribute('data-enabled')).toBe('false');
		expect(view.getByRole('button', { name: i18n.ts.useCw }).getAttribute('aria-pressed')).toBe('false');
	});

	const channel = { id: 'channel-a', name: 'Community channel', color: '#86b300', isSensitive: false, allowRenoteToExternal: true, userId: 'owner', isArchived: false } as Misskey.entities.Channel;

	async function selectChannel(view: Awaited<ReturnType<typeof renderNew>>, selected: Misskey.entities.Channel | null = channel) {
		await fireEvent.click(view.getByTestId('post-form-channel'));
		const callbacks = mocks.popup.mock.calls.at(-1)![2];
		callbacks.choose(selected);
		await nextTick();
	}

	test('keeps the ordinary input layout and only updates its channel pill when choosing a channel', async () => {
		const view = await renderNew({ fixed: true, initialText: 'Keep this text' });
		const placeholder = view.textarea.placeholder;
		const visibilityName = `${i18n.ts.visibility}: ${i18n.ts._visibility.public}`;
		const pill = view.getByTestId('post-form-channel');
		const arrow = pill.querySelector('.ti-chevron-right')!;
		const closedArrowClasses = arrow.className;
		expect(view.getByRole('button', { name: visibilityName })).toBeTruthy();
		await fireEvent.click(pill);
		expect(pill.getAttribute('aria-expanded')).toBe('true');
		expect(arrow.className).not.toBe(closedArrowClasses);
		mocks.popup.mock.calls.at(-1)![2].choose(channel);
		await nextTick();
		expect(pill.getAttribute('aria-expanded')).toBe('false');
		expect(arrow.className).toBe(closedArrowClasses);
		expect(view.textarea.placeholder).toBe(placeholder);
		expect(view.textarea.value).toBe('Keep this text');
		expect(view.textarea.parentElement!.querySelector('[style*="background"]')).toBeNull();
		expect(view.getAllByText(channel.name)).toHaveLength(1);
		expect(view.queryByRole('button', { name: i18n.ts._channelPicker.noChannel })).toBeNull();
		expect((view.getByRole('button', { name: visibilityName }) as HTMLButtonElement).disabled).toBe(true);
		await selectChannel(view, null);
		expect(pill.textContent).toContain(i18n.ts.selectChannel);
		expect(view.textarea.placeholder).toBe(placeholder);
		expect((view.getByRole('button', { name: visibilityName }) as HTMLButtonElement).disabled).toBe(false);
	});

	test('publishes to the selected channel without losing text, attachments, warning or topics and clears the temporary channel', async () => {
		mocks.misskeyApi.mockResolvedValue({ createdNote: makeNote() });
		const view = await renderNew({ initialText: 'Hello', initialCw: 'Summary', initialHashtags: ['Community'], initialFiles: [{ id: 'photo', name: 'Photo' } as Misskey.entities.DriveFile], initialVisibility: 'followers', initialLocalOnly: false });
		await selectChannel(view);
		expect(view.getByTestId('post-form-channel').textContent).toContain(channel.name);
		expect(view.textarea.value).toBe('Hello');
		expect(view.getByText('Photo')).toBeTruthy();
		expect((view.getByRole('textbox', { name: i18n.ts._postForm.cwSummary }) as HTMLInputElement).value).toBe('Summary');
		expect((view.getByRole('combobox', { name: i18n.ts.hashtags }) as HTMLInputElement).value).toBe('#Community');
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.misskeyApi).toHaveBeenCalledWith('notes/create', expect.objectContaining({ channelId: channel.id, visibility: 'public', localOnly: true, text: 'Hello #Community', cw: 'Summary', fileIds: ['photo'], visibleUserIds: undefined }), undefined));
		await waitFor(() => expect(view.getByTestId('post-form-channel').textContent).toContain(i18n.ts.selectChannel));
		expect(view.textarea.value).toBe('');
		expect(view.getByRole('button', { name: i18n.ts._visibility.disableFederation }).getAttribute('aria-pressed')).toBe('false');
	});

	test('restores a private audience and recipients after switching channels then removing the association', async () => {
		const recipient = { id: 'recipient', username: 'recipient', host: null } as Misskey.entities.UserDetailed;
		const view = await renderNew({ initialText: 'Private message', initialVisibility: 'specified', initialLocalOnly: false, initialVisibleUsers: [recipient] });
		await selectChannel(view);
		await selectChannel(view, { ...channel, id: 'channel-b', name: 'Another channel' });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.other }));
		await mocks.popupMenu.mock.calls.at(-1)![0].find((item: { text?: string }) => item.text === i18n.ts._drafts.saveToDraft).action();
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('notes/drafts/create', expect.objectContaining({ channelId: 'channel-b', visibility: 'public', localOnly: true, visibleUserIds: [] }));
		await selectChannel(view, null);
		expect(view.getByRole('button', { name: `${i18n.ts.visibility}: ${i18n.ts._visibility.specified}` })).toBeTruthy();
		expect(view.textarea.value).toBe('Private message');
		mocks.misskeyApi.mockResolvedValue({ createdNote: makeNote() });
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.misskeyApi).toHaveBeenCalledWith('notes/create', expect.objectContaining({ channelId: undefined, visibility: 'specified', localOnly: false, visibleUserIds: ['recipient'] }), undefined));
	});

	test('locks channel assignment for replies, quotes, edits and fixed channel composers', async () => {
		const note = makeNote({ channel, visibility: 'public' });
		for (const props of [{ reply: note }, { renote: note }, { editingNote: note }, { channel }]) {
			const view = await renderNew(props);
			expect(view.queryByTestId('post-form-channel')).toBeNull();
			if ('editingNote' in props) {
				expect(view.container.querySelector<HTMLElement>('[class*="colorBar"]')?.style.getPropertyValue('--MI-channelColor')).toBe(channel.color);
			}
			expect(view.queryByRole('button', { name: i18n.ts._channelPicker.noChannel })).toBeNull();
			view.unmount();
		}
		const fixed = await renderNew({ channel: { ...channel, color: '#000' }, initialText: 'Channel post' });
		expect(fixed.container.querySelector<HTMLElement>('[class*="colorBar"]')?.style.getPropertyValue('--MI-channelColor')).toBe('#000');
		fixed.form.clear();
		await nextTick();
		expect(fixed.getAllByText(channel.name).length).toBeGreaterThan(0);
	});

	test('disposes the picker when posting or closing the composer and ignores a stale selection', async () => {
		let finish!: (result: { createdNote: Misskey.entities.Note }) => void;
		mocks.misskeyApi.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const view = await renderNew({ initialText: 'Ordinary post' });
		await fireEvent.click(view.getByTestId('post-form-channel'));
		const callbacks = mocks.popup.mock.calls.at(-1)![2];
		const dispose = mocks.popup.mock.results.at(-1)!.value.dispose;
		await fireEvent.click(view.getByTestId('post-form-submit'));
		expect(dispose).toHaveBeenCalledOnce();
		expect((view.getByTestId('post-form-channel') as HTMLButtonElement).disabled).toBe(true);
		callbacks.choose(channel);
		await nextTick();
		expect(view.getByTestId('post-form-channel').textContent).toContain(i18n.ts.selectChannel);
		finish({ createdNote: makeNote() });
		await waitFor(() => expect((view.getByTestId('post-form-channel') as HTMLButtonElement).disabled).toBe(false));
		await fireEvent.click(view.getByTestId('post-form-channel'));
		const secondDispose = mocks.popup.mock.results.at(-1)!.value.dispose;
		view.unmount();
		expect(secondDispose).toHaveBeenCalled();
	});

	test('restores channel and ordinary drafts without leaking channel association or a previous private audience', async () => {
		const view = await renderNew({ initialVisibility: 'home', initialLocalOnly: false });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.account }));
		mocks.popupMenu.mock.calls.at(-1)![0].find((item: { text?: string }) => item.text === i18n.ts._drafts.listDrafts).action();
		const restore = mocks.popup.mock.calls.at(-1)![2].restore;
		await restore({ id: 'channel-draft', text: 'In channel', channelId: channel.id, channel, visibility: 'public', localOnly: true });
		await nextTick();
		expect(view.getByTestId('post-form-channel').textContent).toContain(channel.name);
		await selectChannel(view, null);
		expect(view.getByRole('button', { name: `${i18n.ts.visibility}: ${i18n.ts._visibility.home}` })).toBeTruthy();
		await selectChannel(view);
		await restore({ id: 'private-draft', text: 'Private draft', channelId: null, channel: null, visibility: 'followers', localOnly: false });
		await nextTick();
		expect(view.getByTestId('post-form-channel').textContent).toContain(i18n.ts.selectChannel);
		expect(view.getByRole('button', { name: `${i18n.ts.visibility}: ${i18n.ts._visibility.followers}` })).toBeTruthy();
		await selectChannel(view);
		await selectChannel(view, null);
		expect(view.getByRole('button', { name: `${i18n.ts.visibility}: ${i18n.ts._visibility.followers}` })).toBeTruthy();
		await restore({ id: 'reply-draft', text: 'Reply', replyId: 'parent', reply: makeNote(), visibility: 'followers', localOnly: true });
		await nextTick();
		expect(view.queryByTestId('post-form-channel')).toBeNull();
	});

	test('rejects incompatible drafts in a fixed channel without publishing private draft content there', async () => {
		const view = await renderNew({ channel, initialText: 'Current text' });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.account }));
		mocks.popupMenu.mock.calls.at(-1)![0].find((item: { text?: string }) => item.text === i18n.ts._drafts.listDrafts).action();
		await mocks.popup.mock.calls.at(-1)![2].restore({ id: 'private-draft', text: 'Private content', channelId: null, visibility: 'specified' });
		expect(mocks.alert).toHaveBeenCalledWith({ type: 'info', text: i18n.ts._channelPicker.draftChannelMismatch });
		expect(view.textarea.value).toBe('Current text');
	});

	test('restores an initial channel note and saves its association in an explicit server draft', async () => {
		const note = makeNote({ channel, channelId: channel.id, visibility: 'public', localOnly: true });
		const view = await renderNew({ initialNote: note, initialVisibility: 'followers', initialLocalOnly: false });
		expect(view.getByTestId('post-form-channel').textContent).toContain(channel.name);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.other }));
		await mocks.popupMenu.mock.calls.at(-1)![0].find((item: { text?: string }) => item.text === i18n.ts._drafts.saveToDraft).action();
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('notes/drafts/create', expect.objectContaining({ channelId: channel.id, visibility: 'public', localOnly: true, text: note.text, fileIds: note.fileIds, visibleUserIds: [] }));
		await selectChannel(view, null);
		expect(view.getByRole('button', { name: `${i18n.ts.visibility}: ${i18n.ts._visibility.followers}` })).toBeTruthy();
		expect(view.getByRole('button', { name: i18n.ts._visibility.disableFederation }).getAttribute('aria-pressed')).toBe('false');
		expect(view.textarea.value).toBe(note.text);
	});

	test('retries a created packet in the open composer without automatically saving a draft', async () => {
		const packet = { id: 'packet', senderId: 'sender', kind: 'group', audience: 'public', coverId: 'classic', mode: 'equal', message: '', totalCoins: 10, count: 2, remainingCoins: 10, remainingCount: 2, status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', claimedCoins: null };
		const sent: unknown[] = [];
		mocks.misskeyApi.mockImplementation(async (endpoint: string, data: unknown) => {
			if (endpoint === 'red-packets/show') return packet;
			if (endpoint === 'notes/create') {
				sent.push(data);
				if (sent.length === 1) throw new Error('response lost');
				return { createdNote: makeNote() };
			}
			return [];
		});
		const first = await renderNew();
		await fireEvent.click(first.getByRole('button', { name: i18n.ts._redPacket.title }));
		const handlers = mocks.popup.mock.calls.at(-1)![2];
		handlers.created(packet);
		await nextTick();
		await fireEvent.click(first.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.alert).toHaveBeenCalled());
		expect(sent[0]).toEqual(expect.objectContaining({ text: null, localOnly: true, redPacketId: 'packet' }));
		expect(sent[0]).not.toHaveProperty('redPacket');
		expect(mocks.misskeyApi.mock.calls.some(([endpoint]) => endpoint === 'red-packets/create' || endpoint === 'i/wallet')).toBe(false);
		expect(localStorage.getItem('drafts')).toBeNull();
		expect(first.getByText(i18n.ts._redPacket.createdDescription)).toBeTruthy();
		await waitFor(() => expect(first.getByTestId('post-form-submit').hasAttribute('disabled')).toBe(false));
		await fireEvent.click(first.getByTestId('post-form-submit'));
		await waitFor(() => expect(sent).toHaveLength(2));
		expect(sent[1]).toEqual(sent[0]);
		await waitFor(() => expect(first.queryByText(i18n.ts._redPacket.createdDescription)).toBeNull());
		expect(localStorage.getItem('drafts')).toBeNull();
	});

	test('removes only the attachment without refunding the issued packet', async () => {
		const view = await renderNew();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.title }));
		mocks.popup.mock.calls.at(-1)![2].created({ id: 'packet', senderId: 'sender', kind: 'group', audience: 'public', coverId: 'classic', mode: 'equal', message: '', totalCoins: 10, count: 2, remainingCoins: 10, remainingCount: 2, status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', claimedCoins: null });
		await nextTick();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.remove }));
		await waitFor(() => expect(view.queryByText(i18n.ts._redPacket.createdDescription)).toBeNull());
		expect(mocks.misskeyApi).not.toHaveBeenCalledWith('red-packets/cancel', expect.anything());
		expect(view.queryByText(i18n.ts._redPacket.createdDescription)).toBeNull();
	});

	test('editing a packet-only note never sends a new red packet or debits the wallet', async () => {
		const note = makeNote({ text: null, cw: null, files: [], fileIds: [], redPacket: { id: 'packet', senderId: 'sender', kind: 'group', audience: 'public', coverId: 'classic', mode: 'equal', message: '', totalCoins: 10, count: 2, remainingCoins: 5, remainingCount: 1, status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', claimedCoins: null } });
		const view = await renderEdit(note);
		expect((view.getByRole('button', { name: i18n.ts._redPacket.title }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(view.getByTestId('post-form-submit'));
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		expect(mocks.apiWithDialog.mock.calls[0][0]).toBe('notes/update');
		expect(mocks.apiWithDialog.mock.calls[0][1]).not.toHaveProperty('redPacket');
		expect(mocks.misskeyApi).not.toHaveBeenCalled();
	});
});
