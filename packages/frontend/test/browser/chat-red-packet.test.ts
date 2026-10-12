/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App, Ref } from 'vue';
import type { entities } from 'misskey-js';
import ChatForm from '@/pages/chat/room.form.vue';

const mocks = vi.hoisted(() => ({
	me: { id: 'me', policies: { chatAvailability: 'available' } },
	api: vi.fn(), alert: vi.fn(), toast: vi.fn(), popup: vi.fn(), confirm: vi.fn(), store: new Map<string, string>(),
	emoji: vi.fn(), selectFile: vi.fn(),
}));

vi.mock('misskey-js', () => ({ acct: { toString: (user: { username: string }) => user.username } }));
vi.mock('@@/js/config.js', () => ({ url: 'https://example.com' }));
vi.mock('@/i.js', () => ({ $i: mocks.me, ensureSignin: () => mocks.me }));
vi.mock('@/os.js', () => ({ popup: mocks.popup, confirm: mocks.confirm, alert: mocks.alert, toast: mocks.toast, launchUploader: vi.fn() }));
vi.mock('@/events.js', () => ({ globalEvents: { emit: vi.fn() } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: (key: string) => mocks.store.get(key) ?? null, setItem: (key: string, value: string) => mocks.store.set(key, value) } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { 'chat.sendOnEnter': true } } }));
vi.mock('@/utility/drive.js', () => ({ selectFile: mocks.selectFile }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: mocks.emoji } }));
vi.mock('@/drag-and-drop.js', () => ({ checkDragDataType: vi.fn(), getDragData: vi.fn() }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRedPacket.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRedPacketDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	inputMessageHere: 'Message', attachFile: 'Attach file', emoji: 'Emoji', send: 'Send', remove: 'Remove', cancel: 'Cancel',
	code: 'Code', copy: 'Copy', save: 'Save', saved: 'Saved', reply: 'Reply',
	_chat: { inputCode: 'Input code', continueText: 'Continue text', originalMessage: 'Original message', cancelReply: 'Cancel reply', editMessage: 'Edit message', cannotChatWithTheUser_description: 'Mutual follow required' },
	_postForm: { draftSaveFailed: 'Could not save draft' },
	_redPacket: {
		create: 'Create red packet', created: 'Created red packet', createdDescription: 'Coins were deducted on creation.',
		pendingLocked: 'Retry the saved message safely.', operationFailed: 'Message result unknown.', invalidDraft: 'No eligible recipients',
	},
} } }));

const packet = { id: 'packet1', senderId: 'me', roomId: null, kind: 'direct', audience: 'recipients', mode: 'equal', coverId: 'sunset', message: 'Good luck', totalCoins: 20, count: 1, remainingCoins: 20, remainingCount: 1, expiresAt: '2099-01-01T00:00:00Z', status: 'active', coverFileId: null, coverUrl: null, startsAt: null, serverTime: '2026-10-03T00:00:00.000Z', password: null, claimedCoins: null } satisfies entities.RedPacketsCreateResponse;
const fixtures: { app: App; host: HTMLElement; form: Ref<InstanceType<typeof ChatForm> | null>; editing: Ref<entities.ChatMessageLite | null> }[] = [];

async function mountForm(room = false, ownerId = 'owner') {
	const host = document.createElement('div');
	host.style.cssText = 'width:320px;margin-top:100px;font:14px sans-serif;--MI-margin:16px;--MI-marginHalf:8px;--MI-cardPadding:12px;--MI-radius:8px;--MI_THEME-panel:white;--MI_THEME-fg:black;--MI_THEME-accent:#5484a4;';
	document.body.append(host);
	const form = ref<InstanceType<typeof ChatForm> | null>(null);
	const editing = ref<entities.ChatMessageLite | null>(null);
	const app = createApp({ render: () => h(ChatForm, {
		ref: form, editing: editing.value, onEdited: () => { editing.value = null; }, onCancelEdit: () => { editing.value = null; },
		...(room ? { room: { id: 'room1', ownerId } as entities.ChatRoom } : { user: { id: 'recipient', host: null } as entities.UserDetailed }),
	}) });
	app.directive('tooltip', () => {});
	app.component('MkLoading', { render: () => h('span', 'Loading') });
	app.component('MkUserName', { render: () => null });
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', { props: ['text'], setup: (props: { text?: string }) => () => h('span', props.text) });
	app.mount(host);
	fixtures.push({ app, host, form, editing });
	await nextTick();
	return host;
}

async function attachCreatedPacket(host: HTMLElement) {
	await page.elementLocator(host).getByRole('button', { name: 'Create red packet' }).click();
	await expect.poll(() => mocks.popup.mock.calls.length).toBe(1);
	const callbacks = mocks.popup.mock.lastCall![2];
	callbacks.created(packet);
	callbacks.closed();
	await nextTick();
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.store.clear();
	mocks.me.id = 'me';
	mocks.me.policies.chatAvailability = 'available';
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'chat/rooms/members' ? [{ userId: 'member', user: { id: 'member', host: null } }] : { id: 'message1' });
});

afterEach(() => { for (const { app, host } of fixtures.splice(0)) { app.unmount(); host.remove(); } });

test('confirming a private packet sends its ID immediately without another create request', async () => {
	const host = await mountForm();
	await attachCreatedPacket(host);
	await expect.poll(() => mocks.api.mock.calls).toEqual([['chat/messages/create-to-user', { toUserId: 'recipient', redPacketId: 'packet1' }]]);
	await expect.element(page.elementLocator(host).getByText('Created red packet', { exact: true })).not.toBeInTheDocument();
});

test('拒收原因显示 toast，失败消息留在草稿，红包预览不撑高输入区', async () => {
	const host = await mountForm();
	const beforeHeight = host.getBoundingClientRect().height;
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('keep this draft');
	mocks.api.mockRejectedValueOnce({ code: 'RECIPIENT_REJECTS_CHAT' });
	await attachCreatedPacket(host);
	expect(host.getBoundingClientRect().height).toBeCloseTo(beforeHeight, 1);
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Remove' })).toBeVisible();
	await expect.poll(() => mocks.toast.mock.calls).toEqual([['Mutual follow required', 'error']]);
	await expect.element(page.elementLocator(host).getByRole('textbox', { name: 'Message' })).toHaveValue('keep this draft');
	const draft = JSON.parse(mocks.store.get('chatMessageDrafts')!)['me:user:recipient'];
	expect(draft.data.text).toBe('keep this draft');
	expect(draft.data.redPacket.id).toBe('packet1');
});

test('附件与红包都悬浮在输入组件上方，添加及移除不移动编辑器和工具栏', async () => {
	const host = await mountForm();
	const editor = page.elementLocator(host).getByRole('textbox', { name: 'Message' });
	const send = page.elementLocator(host).getByRole('button', { name: 'Send', exact: true });
	const editorTop = editor.element().getBoundingClientRect().top;
	const sendTop = send.element().getBoundingClientRect().top;
	const height = host.getBoundingClientRect().height;
	mocks.selectFile.mockResolvedValue({ id: 'file1', name: 'attachment.gif' });
	await page.elementLocator(host).getByRole('button', { name: 'Attach file' }).click();
	await expect.element(page.elementLocator(host).getByText('attachment.gif')).toBeVisible();
	await attachCreatedPacket(host);
	expect(host.getBoundingClientRect().height).toBeCloseTo(height, 1);
	expect(editor.element().getBoundingClientRect().top).toBeCloseTo(editorTop, 1);
	expect(send.element().getBoundingClientRect().top).toBeCloseTo(sendTop, 1);
	const filePreview = page.elementLocator(host).getByText('attachment.gif').element().parentElement!;
	expect(filePreview.getBoundingClientRect().bottom).toBeCloseTo(host.firstElementChild!.getBoundingClientRect().top - 2, 1);
	await page.elementLocator(filePreview).getByRole('button', { name: 'Remove' }).click();
	await expect.element(page.elementLocator(host).getByText('attachment.gif')).not.toBeInTheDocument();
	expect(editor.element().getBoundingClientRect().top).toBeCloseTo(editorTop, 1);
	expect(send.element().getBoundingClientRect().top).toBeCloseTo(sendTop, 1);
});

test('a lost send response freezes and restores the same payload for idempotent retry', async () => {
	let host = await mountForm();
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('Saved text');
	mocks.api.mockRejectedValueOnce(new Error('network timeout'));
	await attachCreatedPacket(host);
	await expect.poll(() => mocks.toast.mock.calls).toEqual([['Message result unknown.', 'error']]);
	expect(mocks.alert).not.toHaveBeenCalled();
	await expect.element(page.elementLocator(host).getByRole('textbox')).toBeDisabled();
	const previous = fixtures.pop()!;
	previous.app.unmount();
	previous.host.remove();
	host = await mountForm();
	await expect.element(page.elementLocator(host).getByRole('textbox')).toHaveValue('Saved text');
	await expect.element(page.elementLocator(host).getByRole('textbox')).toBeDisabled();
	await page.elementLocator(host).getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => mocks.api.mock.calls.length).toBe(2);
	expect(mocks.api.mock.calls[1]).toEqual(mocks.api.mock.calls[0]);
	expect(mocks.api.mock.calls[1][1]).toEqual({ toUserId: 'recipient', redPacketId: 'packet1' });
	await expect.element(page.elementLocator(host).getByRole('textbox')).toBeEnabled();
	await expect.element(page.elementLocator(host).getByRole('textbox')).toHaveValue('Saved text');
});

test('removing a room packet confirms cancellation and waits for the refund', async () => {
	const host = await mountForm(true);
	mocks.api.mockRejectedValueOnce({ code: 'RECIPIENT_REJECTS_CHAT' });
	await attachCreatedPacket(host);
	await page.elementLocator(host).getByRole('button', { name: 'Remove', exact: true }).click();
	await expect.poll(() => mocks.api.mock.lastCall?.[0]).toBe('red-packets/cancel');
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
	expect(mocks.confirm).toHaveBeenCalledOnce();
});

test('room delivery uses the room endpoint', async () => {
	const host = await mountForm(true);
	await attachCreatedPacket(host);
	expect(mocks.popup.mock.lastCall?.[1]).toEqual({ kind: 'group', roomId: 'room1', chat: true, memberCount: undefined });
	await expect.poll(() => mocks.api.mock.lastCall?.[0]).toBe('chat/messages/create-to-room');
	expect(mocks.api.mock.lastCall?.[1]).toMatchObject({ toRoomId: 'room1', redPacketId: 'packet1' });
});

test('private creation uses the recipient explicitly', async () => {
	await attachCreatedPacket(await mountForm());
	expect(mocks.popup.mock.lastCall?.[1]).toEqual({ kind: 'direct', recipientIds: ['recipient'], chat: true });
});

test('a different signed-in account cannot restore an existing packet draft', async () => {
	mocks.api.mockRejectedValueOnce({ code: 'RECIPIENT_REJECTS_CHAT' });
	await attachCreatedPacket(await mountForm());
	const previous = fixtures.pop()!;
	previous.app.unmount();
	previous.host.remove();
	mocks.me.id = 'another';
	const host = await mountForm();
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Create red packet' })).toBeEnabled();
});

test('a single-owner group can create a room packet without fetching member snapshots', async () => {
	const host = await mountForm(true, 'me');
	await attachCreatedPacket(host);
	expect(mocks.popup.mock.lastCall?.[1]).toEqual({ kind: 'group', roomId: 'room1', memberCount: undefined, chat: true });
	expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/messages/create-to-room', { toRoomId: 'room1', redPacketId: 'packet1' });
	expect(mocks.alert).not.toHaveBeenCalled();
});

test.each([false, true])('红包独立发布并保留文字、附件和回复草稿（群聊=%s）', async room => {
	const host = await mountForm(room);
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('unsent draft');
	mocks.selectFile.mockResolvedValue({ id: 'file1', name: 'attachment.gif' });
	await page.elementLocator(host).getByRole('button', { name: 'Attach file' }).click();
	await fixtures.at(-1)!.form.value!.compose('reply', original);
	await attachCreatedPacket(host);
	await expect.poll(() => mocks.api.mock.calls).toEqual([[room ? 'chat/messages/create-to-room' : 'chat/messages/create-to-user', {
		...(room ? { toRoomId: 'room1' } : { toUserId: 'recipient' }), redPacketId: 'packet1',
	}]]);
	await expect.element(page.elementLocator(host).getByRole('textbox')).toHaveValue('unsent draft');
	await expect.element(page.elementLocator(host).getByText('attachment.gif')).toBeVisible();
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Cancel reply' })).toBeVisible();
	await page.elementLocator(host).getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => mocks.api.mock.lastCall?.[1]).toMatchObject({ text: 'unsent draft', fileId: 'file1', replyId: 'original', replyType: 'reply' });
	expect(mocks.api.mock.lastCall?.[1]).not.toHaveProperty('redPacketId');
});

test('three backticks and Enter create a styled code editor; Enter inside code does not send', async () => {
	const host = await mountForm();
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('```js');
	await userEvent.keyboard('{Enter}');
	const code = page.elementLocator(host).getByRole('textbox', { name: 'Input code' });
	await expect.element(code).toBeVisible();
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
	await code.fill('const greeting = "你好";');
	await userEvent.keyboard('{Enter}');
	expect(mocks.api).not.toHaveBeenCalled();
	await userEvent.keyboard('console.log(greeting);');
	expect(host.scrollWidth).toBeLessThanOrEqual(320);
	await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/chat-code-editor.png' });
	await page.elementLocator(host).getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => mocks.api.mock.lastCall?.[1].text).toBe('```js\nconst greeting = "你好";\nconsole.log(greeting);\n```');
});

test('an unclosed pasted code block restores as code and can be followed by normal text', async () => {
	let host = await mountForm();
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('```\npasted code');
	await expect.element(page.elementLocator(host).getByRole('textbox', { name: 'Input code' })).toHaveValue('pasted code');
	const previous = fixtures.pop()!;
	previous.app.unmount();
	previous.host.remove();
	host = await mountForm();
	await expect.element(page.elementLocator(host).getByRole('textbox', { name: 'Input code' })).toHaveValue('pasted code');
	await page.elementLocator(host).getByRole('button', { name: 'Continue text' }).click();
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('after code');
	await page.elementLocator(host).getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => mocks.api.mock.lastCall?.[1].text).toBe('```\npasted code\n```\nafter code');
});

test('IME confirmation does not send or convert a code fence', async () => {
	const host = await mountForm();
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('```');
	host.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
	await nextTick();
	expect(host.querySelector('[data-chat-code]')).toBeNull();
	expect(mocks.api).not.toHaveBeenCalled();
});

const original = { id: 'original', fromUserId: 'alice', fromUser: { id: 'alice', username: 'alice' }, text: 'first\nsecond' } as entities.ChatMessageLite;

test.each([false, true])('reply retains the current draft and sends a separate reference (room=%s)', async room => {
	const host = await mountForm(room);
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('answer');
	await fixtures.at(-1)!.form.value!.compose('reply', original);
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Cancel reply' })).toBeVisible();
	await page.elementLocator(host).getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => mocks.api.mock.lastCall?.[1]).toMatchObject({ text: 'answer', replyId: 'original', replyType: 'reply' });
});

test('quote shows a reference card and mention inserts outside the active code block', async () => {
	const host = await mountForm();
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('```\ncode');
	await fixtures.at(-1)!.form.value!.compose('quote', original);
	await expect.element(page.elementLocator(host).getByRole('textbox', { name: 'Message' })).toHaveValue('');
	await fixtures.at(-1)!.form.value!.compose('mention', original);
	await expect.element(page.elementLocator(host).getByRole('textbox', { name: 'Message' })).toHaveValue('@alice ');
	await expect.element(page.elementLocator(host).getByRole('textbox', { name: 'Input code' })).toHaveValue('code');
});

test('editing a code message restores the prior draft and does not replace its reply', async () => {
	const host = await mountForm();
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('draft');
	await fixtures.at(-1)!.form.value!.compose('reply', original);
	fixtures.at(-1)!.editing.value = { ...original, text: '```\nold code\n```' };
	await nextTick();
	await expect.element(page.elementLocator(host).getByRole('textbox', { name: 'Input code' })).toHaveValue('old code');
	await page.elementLocator(host).getByRole('textbox', { name: 'Input code' }).fill('new code');
	await page.elementLocator(host).getByRole('button', { name: 'Save' }).click();
	await expect.poll(() => mocks.api.mock.lastCall).toEqual(['chat/messages/update', { messageId: 'original', text: '```\nnew code\n```' }]);
	await expect.element(page.elementLocator(host).getByRole('textbox', { name: 'Message' })).toHaveValue('draft');
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Cancel reply' })).toBeVisible();
	expect(mocks.toast).not.toHaveBeenCalled();
});

test('emoji selection inserts at the remembered code cursor', async () => {
	const host = await mountForm();
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('```\nhello');
	await page.elementLocator(host).getByRole('textbox', { name: 'Input code' }).click();
	await userEvent.keyboard('{End}');
	await page.elementLocator(host).getByRole('button', { name: 'Emoji' }).click();
	mocks.emoji.mock.lastCall![1]('😀');
	mocks.emoji.mock.lastCall![2]();
	await expect.element(page.elementLocator(host).getByRole('textbox', { name: 'Input code' })).toHaveValue('hello😀');
});

test('mention separates from preceding text and replaces a selection', async () => {
	const host = await mountForm();
	const textbox = page.elementLocator(host).getByRole('textbox', { name: 'Message' });
	await textbox.fill('hello123');
	await userEvent.keyboard('{End}');
	await fixtures.at(-1)!.form.value!.compose('mention', original);
	await expect.element(textbox).toHaveValue('hello123 @alice ');
	const input = host.querySelector('textarea')!;
	input.setSelectionRange(0, input.value.length);
	await fixtures.at(-1)!.form.value!.compose('mention', original);
	await expect.element(textbox).toHaveValue('@alice ');
});

test('quote survives draft restoration and sends no original text or URL in the body', async () => {
	let host = await mountForm();
	await fixtures.at(-1)!.form.value!.compose('quote', { ...original, text: 'x'.repeat(2000) });
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('answer');
	const previous = fixtures.pop()!;
	previous.app.unmount();
	previous.host.remove();
	host = await mountForm();
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Cancel reply' })).toBeVisible();
	await page.elementLocator(host).getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => mocks.api.mock.lastCall?.[1]).toMatchObject({ text: 'answer', replyId: 'original', replyType: 'quote' });
});
