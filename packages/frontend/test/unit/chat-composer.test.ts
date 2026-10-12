/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import * as mfm from 'mfm-js';
import type * as Misskey from 'misskey-js';
import { chatTextForSend, getChatAttention, parseChatDraft, serializeChatDraft } from '@/pages/chat/composer.js';
import ChatForm from '@/pages/chat/room.form.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'self', policies: { chatAvailability: 'available' } }) }));
vi.mock('@/os.js', () => ({ toast: vi.fn() }));
vi.mock('@/utility/drive.js', () => ({ selectFile: vi.fn() }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: vi.fn() } }));
vi.mock('@/components/MkRedPacketDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/XEditor.vue', () => ({ default: {
	props: ['modelValue'], emits: ['update:modelValue'],
	template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>',
} }));

let originalStorage: Storage;
beforeEach(() => {
	originalStorage = localStorage;
	const storage: Record<string, string> = {};
	vi.stubGlobal('localStorage', new Proxy({
		getItem: (key: string) => storage[key] ?? null,
		setItem: (key: string, value: string) => { storage[key] = value; },
		removeItem: (key: string) => { delete storage[key]; },
		clear: () => { for (const key of Object.keys(storage)) delete storage[key]; },
	}, {
		ownKeys: () => Object.keys(storage),
		getOwnPropertyDescriptor: (target, key) => Reflect.getOwnPropertyDescriptor(target, key) ?? { configurable: true, enumerable: true },
	}));
});

afterEach(() => {
	cleanup();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.stubGlobal('localStorage', originalStorage);
});

test('an opening fence becomes code only after a newline, and sending closes it automatically', () => {
	expect(parseChatDraft('```')).toEqual([{ type: 'text', text: '```' }]);
	expect(parseChatDraft('```js\nconst value = 1;')).toEqual([{ type: 'code', language: 'js', text: 'const value = 1;' }]);
	const sent = chatTextForSend('```js\nconst value = 1;');
	expect(sent).toBe('```js\nconst value = 1;\n```');
	expect(mfm.parse(sent)).toMatchObject([{ type: 'blockCode', props: { lang: 'js', code: 'const value = 1;' } }]);
});

test('closed code, following text and multiple code blocks survive restoring and sending', () => {
	const source = 'before\n```ts\nconst value = 1;\n```\nafter\n```\n你好\n```';
	expect(serializeChatDraft(parseChatDraft(source))).toBe(source);
	expect(chatTextForSend(source)).toBe(source);
});

test('empty code blocks do not turn an otherwise empty draft into a message', () => {
	expect(chatTextForSend('```\n\n```')).toBe('');
	expect(chatTextForSend('```\n   \n```')).toBe('');
});

test('提及提示只识别本站本人，代码和其他站同名用户不触发', () => {
	const me = { id: 'me', username: 'alice' };
	const message = { fromUserId: 'other', text: '@Alice', reply: null, replyType: null };
	expect(getChatAttention(message, me, 'example.test')).toBe('mentionedYou');
	for (const text of ['`@alice`', '```\n@alice\n```', '@alice@remote.test']) expect(getChatAttention({ ...message, text }, me, 'example.test')).toBeNull();
	expect(getChatAttention({ ...message, fromUserId: me.id }, me, 'example.test')).toBeNull();
	const reply = { id: 'original', fromUser: me } as NonNullable<Parameters<typeof getChatAttention>[0]['reply']>;
	expect(getChatAttention({ ...message, text: '答复', reply, replyType: 'reply' }, me, 'example.test')).toBeNull();
	expect(getChatAttention({ ...message, text: '引用', reply, replyType: 'quote' }, me, 'example.test')).toBeNull();
});

test('手动清空聊天正文解除旧附件引用，并取消待执行的草稿同步', async () => {
	vi.useFakeTimers();
	localStorage.clear();
	mocks.api.mockReset().mockResolvedValue(undefined);
	const view = render(ChatForm, { props: { user: { id: 'recipient' } as Misskey.entities.UserDetailed }, global: { directives: { tooltip: () => {} } } });
	await nextTick();
	const textarea = view.getByRole('textbox');
	await fireEvent.update(textarea, 'https://example.test/files/first');
	await vi.advanceTimersByTimeAsync(500);
	const firstRequest = mocks.api.mock.calls.find(call => call[0] === 'drive/files/draft' && !call[1].delete)![1];
	await fireEvent.update(textarea, 'https://example.test/files/pending');
	await fireEvent.update(textarea, '');
	await vi.advanceTimersByTimeAsync(1000);
	expect(mocks.api).toHaveBeenCalledWith('drive/files/draft', expect.objectContaining({ draftId: firstRequest.draftId, delete: true }), undefined);
	expect(mocks.api.mock.calls.some(call => call[1].text === 'https://example.test/files/pending')).toBe(false);
	expect(JSON.parse(localStorage.getItem('chatMessageDrafts') ?? '{}')['self:user:recipient']).toBeUndefined();
	await fireEvent.update(textarea, 'https://example.test/files/next');
	await vi.advanceTimersByTimeAsync(500);
	const nextRequest = mocks.api.mock.calls.at(-1)![1];
	expect(nextRequest.text).toBe('https://example.test/files/next');
	expect(nextRequest.draftId).not.toBe(firstRequest.draftId);
});

test.each(['读取', '写入'])('聊天兼容缓存%s失败仍登记附件并恢复独立草稿', async (failure) => {
	vi.useFakeTimers();
	mocks.api.mockReset().mockResolvedValue(undefined);
	const options = { props: { user: { id: 'recipient' } as Misskey.entities.UserDetailed }, global: { directives: { tooltip: () => {} } } };
	const view = render(ChatForm, options);
	await nextTick();
	if (failure === '读取') localStorage.setItem('chatMessageDrafts', '{invalid');
	const setItem = localStorage.setItem.bind(localStorage);
	vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
		if (key === 'chatMessageDrafts') throw new Error('quota');
		setItem(key, value);
	});
	const text = 'https://example.test/files/retained';
	await fireEvent.update(view.getByRole('textbox'), text);
	await vi.advanceTimersByTimeAsync(500);
	expect(mocks.api).toHaveBeenCalledWith('drive/files/draft', expect.objectContaining({ text }), undefined);
	const request = mocks.api.mock.calls.find(call => call[0] === 'drive/files/draft' && call[1].text === text)![1];
	expect(JSON.parse(localStorage.getItem(`misskey:chatDraft:self:user:recipient:${request.draftId}`)!).data.text).toBe(text);
	view.unmount();
	const restored = render(ChatForm, options);
	await vi.advanceTimersByTimeAsync(0);
	expect((restored.getByRole('textbox') as HTMLTextAreaElement).value).toBe(text);
});
