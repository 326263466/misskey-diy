/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import XMessage from '@/pages/chat/XMessage.vue';

vi.hoisted(() => {
	Object.assign(globalThis, { _LANGS_: [['zh-CN', '简体中文']], _VERSION_: 'test', _DEV_: false });
});

const events = vi.hoisted(() => ({ context: vi.fn(), api: vi.fn(), alert: vi.fn() }));
const preferences = vi.hoisted(() => ({ 'chat.showSenderName': true, animation: false }));
vi.mock('@/preferences.js', () => ({ prefer: { s: preferences } }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'me', policies: { chatAvailability: 'available' } }) }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { more: 'More' } } }));
vi.mock('@@/js/config.js', () => ({ url: 'https://example.com' }));
vi.mock('misskey-js', () => ({}));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn(), contextMenu: events.context, alert: events.alert }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: events.api }));
vi.mock('@/utility/reaction-picker.js', () => ({ reactionPicker: {} }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRedPacket.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { render: () => null } }));

let app: App;
let host: HTMLElement;
afterEach(() => { vi.clearAllMocks(); app?.unmount(); host?.remove(); preferences['chat.showSenderName'] = true; });

async function mount(isMe: boolean, width = 640, dark = true) {
	host = document.createElement('div');
	host.style.cssText = `width:${width}px;container-type:inline-size;font:16px sans-serif;--MI-radius:12px;--MI_THEME-panel:${dark ? '#252525' : '#fff'};--MI_THEME-fg:${dark ? '#ddd' : '#333'};--MI_THEME-panelHighlight:${dark ? '#393939' : '#f7f7f7'};background:var(--MI_THEME-panelHighlight);--MI_THEME-fgTransparentWeak:#999;--MI_THEME-accent:#86b300;`;
	document.body.append(host);
	const sender = { id: isMe ? 'me' : 'other', name: '测试用户', username: 'long_account_name_for_overflow' };
	app = createApp({ render: () => h(XMessage, { message: { id: 'message', fromUserId: sender.id, fromUser: sender, text: '这是一条聊天消息', reactions: [{ reaction: '😀', user: { id: 'other' } }], createdAt: '2026-10-02T00:00:00Z' } as never }) });
	app.component('MkAvatar', { render: () => h('div', { 'data-avatar': '', style: 'background:#e55;border-radius:50%;' }) });
	app.component('MkUserName', { render: () => h('span', { 'data-name': '' }, sender.name) });
	app.component('MkAcct', { render: () => h('span', { 'data-account': '' }, '@' + sender.username) });
	app.component('MkA', { render: () => h('a') });
	app.component('MkTime', { render: () => h('time', '刚刚') });
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', { render: () => h('span', { 'data-message': '' }, '这是一条聊天消息') });
	app.mount(host);
	await nextTick();
	return { avatar: host.querySelector<HTMLElement>('[data-avatar]')!, header: host.querySelector<HTMLElement>('time')!.parentElement!, content: host.querySelector<HTMLElement>('[data-message]')! };
}

test.each([false, true])('sender and time mirror alongside a top-aligned avatar (own=%s)', async isMe => {
	const { avatar, header, content } = await mount(isMe);
	const sender = host.querySelector<HTMLElement>('[data-name]')!;
	const time = host.querySelector<HTMLElement>('time')!;
	expect(avatar.getBoundingClientRect().top).toBeCloseTo(header.getBoundingClientRect().top, 0);
	expect(content.getBoundingClientRect().top).toBeGreaterThan(header.getBoundingClientRect().bottom);
	expect(sender.getBoundingClientRect().left < time.getBoundingClientRect().left).toBe(!isMe);
	expect(avatar.getBoundingClientRect().left < header.getBoundingClientRect().left).toBe(!isMe);
});

test.each([false, true])('long account names stay inside a narrow chat and keep the avatar (own=%s)', async isMe => {
	const { avatar, header } = await mount(isMe, 320);
	expect(avatar.getBoundingClientRect().width).toBeGreaterThan(0);
	expect(header.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right + 1);
	expect(host.scrollWidth).toBeLessThanOrEqual(320);
});

test('the existing sender switch hides both name and account while retaining time', async () => {
	preferences['chat.showSenderName'] = false;
	await mount(true);
	expect(host.querySelector('[data-name]')).toBeNull();
	expect(host.querySelector('[data-account]')).toBeNull();
	expect(host.querySelector('time')).not.toBeNull();
});

test('only the bubble opens the message context menu', async () => {
	const { content, header } = await mount(false);
	const dispatch = (element: Element) => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
	dispatch(header);
	dispatch(host.querySelector('button')!);
	dispatch(host.firstElementChild!);
	expect(events.context).not.toHaveBeenCalled();
	dispatch(content);
	expect(events.context).toHaveBeenCalledOnce();
});

test.each([false, true])('peer bubble has a distinct theme-adaptive background (dark=%s)', async dark => {
	await mount(false, 320, dark);
	const bubble = host.querySelector('[data-chat-bubble]')!;
	expect(getComputedStyle(bubble).backgroundColor).not.toBe(getComputedStyle(host).backgroundColor);
	expect(getComputedStyle(bubble).getPropertyValue('--fukidashi-bg')).toContain('16%');
});
