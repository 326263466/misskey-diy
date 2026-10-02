/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type { entities } from 'misskey-js';
import ChatForm from '@/pages/chat/room.form.vue';

const mocks = vi.hoisted(() => ({
	me: { id: 'me', policies: { chatAvailability: 'available' } },
	api: vi.fn(), alert: vi.fn(), popup: vi.fn(), confirm: vi.fn(), store: new Map<string, string>(),
}));

vi.mock('misskey-js', () => ({}));
vi.mock('@/i.js', () => ({ $i: mocks.me, ensureSignin: () => mocks.me }));
vi.mock('@/os.js', () => ({ popup: mocks.popup, confirm: mocks.confirm, alert: mocks.alert, launchUploader: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: (key: string) => mocks.store.get(key) ?? null, setItem: (key: string, value: string) => mocks.store.set(key, value) } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { 'chat.sendOnEnter': true } } }));
vi.mock('@/utility/drive.js', () => ({ selectFile: vi.fn() }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: vi.fn() } }));
vi.mock('@/drag-and-drop.js', () => ({ checkDragDataType: vi.fn(), getDragData: vi.fn() }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRedPacket.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRedPacketDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	inputMessageHere: 'Message', attachFile: 'Attach file', emoji: 'Emoji', send: 'Send', remove: 'Remove', cancel: 'Cancel',
	_postForm: { draftSaveFailed: 'Could not save draft' },
	_redPacket: {
		create: 'Create red packet', created: 'Created red packet', createdDescription: 'Coins were deducted on creation.',
		pendingLocked: 'Retry the saved message safely.', operationFailed: 'Message result unknown.', invalidDraft: 'No eligible recipients',
	},
} } }));

const packet = { id: 'packet1', senderId: 'me', roomId: null, kind: 'direct', audience: 'recipients', mode: 'equal', coverId: 'sunset', message: 'Good luck', totalCoins: 20, count: 1, remainingCoins: 20, remainingCount: 1, expiresAt: '2099-01-01T00:00:00Z', status: 'active', coverFileId: null, coverUrl: null, claimedCoins: null } satisfies entities.RedPacketsCreateResponse;
const fixtures: { app: App; host: HTMLElement }[] = [];

async function mountForm(room = false, ownerId = 'owner') {
	const host = document.createElement('div');
	host.style.cssText = 'width:320px;--MI-margin:16px;--MI-marginHalf:8px;--MI_THEME-panel:white;--MI_THEME-fg:black;';
	document.body.append(host);
	const app = createApp({ render: () => h(ChatForm, room ? { room: { id: 'room1', ownerId } as entities.ChatRoom } : { user: { id: 'recipient', host: null } as entities.UserDetailed }) });
	app.directive('tooltip', () => {});
	app.component('MkLoading', { render: () => h('span', 'Loading') });
	app.mount(host);
	fixtures.push({ app, host });
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

test('a packet-only private message sends the existing ID without another create request', async () => {
	const host = await mountForm();
	await attachCreatedPacket(host);
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
	await page.elementLocator(host).getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => mocks.api.mock.calls).toEqual([['chat/messages/create-to-user', { toUserId: 'recipient', redPacketId: 'packet1', text: undefined, fileId: undefined }]]);
	await expect.element(page.elementLocator(host).getByText('Created red packet', { exact: true })).not.toBeInTheDocument();
});

test('a lost send response freezes and restores the same payload for idempotent retry', async () => {
	let host = await mountForm();
	await page.elementLocator(host).getByRole('textbox', { name: 'Message' }).fill('Saved text');
	await attachCreatedPacket(host);
	mocks.api.mockRejectedValueOnce(new Error('network timeout'));
	await page.elementLocator(host).getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => mocks.alert.mock.lastCall?.[0]).toMatchObject({ type: 'error', text: 'Message result unknown.' });
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
	await expect.element(page.elementLocator(host).getByRole('textbox')).toBeEnabled();
});

test('removing a room packet only removes the reference and preserves the created packet', async () => {
	const host = await mountForm(true);
	await attachCreatedPacket(host);
	await page.elementLocator(host).getByRole('button', { name: 'Remove', exact: true }).click();
	expect(mocks.api).not.toHaveBeenCalled();
	await expect.element(page.elementLocator(host).getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
	expect(mocks.confirm).not.toHaveBeenCalled();
});

test('room delivery uses the room endpoint', async () => {
	const host = await mountForm(true);
	await attachCreatedPacket(host);
	expect(mocks.popup.mock.lastCall?.[1]).toEqual({ kind: 'group', roomId: 'room1' });
	await page.elementLocator(host).getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => mocks.api.mock.lastCall?.[0]).toBe('chat/messages/create-to-room');
	expect(mocks.api.mock.lastCall?.[1]).toMatchObject({ toRoomId: 'room1', redPacketId: 'packet1' });
});

test('private creation uses the recipient explicitly', async () => {
	await attachCreatedPacket(await mountForm());
	expect(mocks.popup.mock.lastCall?.[1]).toEqual({ kind: 'direct', recipientIds: ['recipient'] });
});

test('a different signed-in account cannot restore an existing packet draft', async () => {
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
	expect(mocks.popup.mock.lastCall?.[1]).toEqual({ kind: 'group', roomId: 'room1' });
	expect(mocks.api).not.toHaveBeenCalled();
	expect(mocks.alert).not.toHaveBeenCalled();
});
