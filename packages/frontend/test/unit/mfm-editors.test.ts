/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import ChatForm from '@/pages/chat/room.form.vue';
import PageTextEditor from '@/pages/page-editor/els/page-editor.el.text.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	picker: vi.fn(),
	detach: vi.fn(),
	storage: new Map<string, string>(),
}));

vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ emojiStyle: 'twemoji', 'chat.sendOnEnter': false }) } };
});
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: vi.fn(class { detach = mocks.detach; }) }));
vi.mock('@/utility/emoji-mute.js', () => ({ checkMuted: () => ({ value: false }) }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: mocks.picker } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/drive.js', () => ({ selectFile: vi.fn() }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/local-storage.js', () => ({
	miLocalStorage: {
		getItem: (key: string) => mocks.storage.get(key) ?? null,
		setItem: (key: string, value: string) => mocks.storage.set(key, value),
	},
}));

const preferences = prefer.s as { emojiStyle: 'twemoji' | 'fluentEmoji' | 'native' };

function renderChat() {
	const view = render(ChatForm, {
		props: { user: { id: 'recipient' } as Misskey.entities.UserDetailed },
		global: { stubs: { MkLoading: true }, directives: { tooltip: () => {} } },
	});
	return { ...view, textarea: view.getByRole('textbox', { name: i18n.ts.inputMessageHere }) as HTMLTextAreaElement };
}

describe('MFM content editors', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.storage.clear();
		mocks.api.mockResolvedValue({});
		preferences.emojiStyle = 'twemoji';
	});
	afterEach(cleanup);

	test('restores and submits chat drafts without converting the raw MFM source', async () => {
		const text = '**聊天** 🎉 :custom: <plain>原文</plain>';
		mocks.storage.set('chatMessageDrafts', JSON.stringify({ 'user:recipient': { data: { text, file: null } } }));
		const view = renderChat();
		await nextTick();
		expect(view.textarea.value).toBe(text);
		expect(view.container.querySelector('[data-emoji-input-overlay] img')?.getAttribute('src')).toBe('/twemoji/1f389.svg');
		preferences.emojiStyle = 'fluentEmoji';
		await nextTick();
		expect(view.container.querySelector('[data-emoji-input-overlay] img')?.getAttribute('src')).toBe('/fluent-emoji/1f389.png');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.send }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/messages/create-to-user', {
			toUserId: 'recipient', text, fileId: undefined,
		}));
		expect(view.textarea.value).toBe('');
		expect(view.container.querySelector('[data-emoji-input-overlay]')).toBeNull();
	});

	test('preserves chat text after a replaced selection when choosing multiple emoji', async () => {
		const view = renderChat();
		await fireEvent.update(view.textarea, '**before** old after');
		view.textarea.setSelectionRange(11, 14);
		await fireEvent.click(view.container.querySelector('.ti-mood-happy')!.parentElement!);
		const [, chooseEmoji, closePicker] = mocks.picker.mock.calls[0];
		chooseEmoji('🎉');
		chooseEmoji('❤️');
		closePicker();
		await nextTick();
		expect(view.textarea.value).toBe('**before** 🎉❤️ after');
		expect(document.activeElement).toBe(view.textarea);
		expect(view.textarea.selectionStart).toBe(15);
		expect(view.textarea.selectionEnd).toBe(15);
		expect(Array.from(view.container.querySelectorAll('[data-emoji-input-overlay] img'), image => image.getAttribute('alt'))).toEqual(['🎉', '❤️']);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.send }));
		expect(mocks.api).toHaveBeenCalledWith('chat/messages/create-to-user', {
			toUserId: 'recipient', text: '**before** 🎉❤️ after', fileId: undefined,
		});
	});

	test('shows live chat composition without sending incomplete IME text', async () => {
		const view = renderChat();
		await fireEvent.update(view.textarea, '🎉 ');
		await fireEvent.compositionStart(view.textarea);
		await fireEvent.input(view.textarea, { target: { value: '🎉 zhong' }, isComposing: true });
		await fireEvent.keyDown(view.textarea, { key: 'Enter', ctrlKey: true, isComposing: true });
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.container.querySelector('[data-emoji-input-overlay]')?.textContent).toContain('🎉 zhong');
		view.textarea.value = '🎉 中文';
		await fireEvent.compositionEnd(view.textarea);
		await fireEvent.keyDown(view.textarea, { key: 'Enter', ctrlKey: true });
		expect(mocks.api).toHaveBeenCalledWith('chat/messages/create-to-user', {
			toUserId: 'recipient', text: '🎉 中文', fileId: undefined,
		});
	});

	test('renders page text emoji while keeping MFM syntax and emitted content editable', async () => {
		const initial = { id: 'text-block', type: 'text' as const, text: '页面 🎉 **文字**' };
		const onUpdate = vi.fn();
		const view = render(PageTextEditor, {
			props: { modelValue: initial, 'onUpdate:modelValue': onUpdate },
			global: { stubs: { XContainer: { template: '<div><slot/></div>' } } },
		});
		const textarea = view.getByRole('textbox', { name: i18n.ts._pages.blocks.text }) as HTMLTextAreaElement;
		await nextTick();
		expect(view.container.querySelector('[data-emoji-input-overlay] img')?.getAttribute('src')).toBe('/twemoji/1f389.svg');
		const edited = '$[x2 页面 🎉] :custom: **原文**';
		await fireEvent.update(textarea, edited);
		expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ ...initial, text: edited });
		expect(textarea.value).toBe(edited);
		preferences.emojiStyle = 'native';
		await nextTick();
		expect(view.container.querySelector('[data-emoji-input-overlay]')).toBeNull();
		expect(textarea.value).toBe(edited);
		view.unmount();
		expect(mocks.detach).toHaveBeenCalledExactlyOnceWith();
	});
});
