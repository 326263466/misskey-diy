/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import ChatHome from '@/pages/chat/home.vue';
import ChatRoom from '@/pages/chat/room.vue';
import PageWithHeader from '@/components/global/PageWithHeader.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import { DI } from '@/di.js';

vi.hoisted(() => { vi.stubGlobal('_LANGS_', []); vi.stubGlobal('_VERSION_', 'test'); vi.stubGlobal('_DEV_', false); });
const api = vi.hoisted(() => vi.fn());
const connection = vi.hoisted(() => ({ on: vi.fn(), send: vi.fn(), dispose: vi.fn() }));
const chatPreferences = vi.hoisted(() => ({
	s: { animation: false, enableHorizontalSwipe: true },
	r: { animation: { value: false }, enableHorizontalSwipe: { value: true } },
}));
vi.mock('misskey-js', () => ({}));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@@/js/intl-const.js', () => ({ versatileLang: 'en-US' }));
vi.mock('@/preferences.js', () => ({ prefer: chatPreferences }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ useListener: vi.fn() }) }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn(), updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null, ensureSignin: () => ({ id: 'self', policies: { chatAvailability: 'available' } }) }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null, setItem: vi.fn() } }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ useChannel: () => connection }) }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));
vi.mock('@/composables/use-user-statistics.js', () => ({ useUserStatistics: vi.fn() }));
vi.mock('@/composables/use-user-statistics-visibility.js', () => ({ useUserStatisticsVisibility: () => true }));
vi.mock('@/utility/drive.js', () => ({ selectFile: vi.fn() }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: {} }));
vi.mock('@/utility/reaction-picker.js', () => ({ reactionPicker: {} }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('@/drag-and-drop.js', () => ({ checkDragDataType: vi.fn(), getDragData: vi.fn() }));
vi.mock('@/components/MkRedPacket.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRedPacketDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/room.search.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/room.members.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/room.info.vue', async () => {
	const { h } = await import('vue');
	return { default: { render: () => h('div', { class: '_panel _panelPadding', 'data-room-info': '', style: 'height:100px;' }, 'Room settings') } };
});
vi.mock('@/utility/timeline-date-separate.js', async () => {
	const { computed } = await import('vue');
	return { makeDateSeparatedTimelineComputedRef: (messages: { value: { id: string }[] }) => computed(() => messages.value.map(data => ({ type: 'item', id: data.id, data }))) };
});
vi.mock('@/components/MkChatHistories.vue', () => ({ default: { render: () => 'History' } }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPolkadots.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.invitations.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.joiningRooms.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.ownedRooms.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	chat: 'Chat', startChat: 'Start chat', search: 'Search', goBack: 'Back', info: 'Info',
	inputMessageHere: 'Message', attachFile: 'Attach file', emoji: 'Emoji', send: 'Send',
	_redPacket: { create: 'Gift' },
	_chat: { home: 'Home', invitations: 'Invitations', joiningRooms: 'Joined rooms', yourRooms: 'Your rooms', searchMessages: 'Search messages', history: 'History', members: 'Members', noMessagesYet: 'No messages', inviteUserToChat: 'Invite someone', newMessage: 'New message' },
} } }));

const fixtures: { app: App; host: HTMLElement }[] = [];

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

test.each([320, 720, 1040].flatMap(width => [false, true].map(dark => ({ width, dark }))))(
	'aligns the actual chat title, search and history cards at $width px (dark: $dark)',
	async ({ width, dark }) => {
		await page.viewport(Math.max(1100, width), 900);
		const host = document.createElement('div');
		host.style.cssText = `width:${width}px;height:800px;container-type:size;--MI_THEME-bg:${dark ? '#222' : '#eee'};--MI_THEME-panel:${dark ? '#333' : '#fff'};--MI_THEME-fg:${dark ? '#ddd' : '#333'};--MI_THEME-pageHeaderFg:var(--MI_THEME-fg);--MI-pageHeaderBg:var(--MI_THEME-panel);--MI_THEME-divider:#8883;--MI_THEME-accent:#3478cc;--MI_THEME-fgOnAccent:#fff;`;
		document.body.append(host);
		const app = createApp(ChatHome);
		app.component('PageWithHeader', PageWithHeader);
		app.component('MkPageHeader', MkPageHeader);
		app.component('MkStickyContainer', MkStickyContainer);
		for (const name of ['MkAvatar', 'MkUserName', 'MkAd']) app.component(name, { render: () => null });
		app.directive('tooltip', () => {});
		app.directive('adaptive-border', () => {});
		app.provide(DI.pageMetadata, ref({ title: 'Chat' }));
		app.mount(host);
		fixtures.push({ app, host });
		await nextTick();
		await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		const header = host.querySelector<HTMLElement>('[data-page-header]')!;
		const search = host.querySelector('input[type="search"]')!.closest<HTMLElement>('._panel')!;
		const history = search.nextElementSibling as HTMLElement;
		const bounds = header.getBoundingClientRect();
		for (const card of [search, history]) {
			const box = card.getBoundingClientRect();
			expect(box.width).toBe(width);
			expect(box.left).toBe(bounds.left);
			expect(box.right).toBe(bounds.right);
			expect(getComputedStyle(card).backgroundColor).toBe(dark ? 'rgb(51, 51, 51)' : 'rgb(255, 255, 255)');
		}
		expect(search.getBoundingClientRect().top - bounds.bottom).toBe(18);
		const style = getComputedStyle(search);
		for (const inset of [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]) expect(inset).toBe('18px');
		expect(host.scrollWidth).toBe(width);
		await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/chat-column-${width}-${dark ? 'dark' : 'light'}.png` });
	},
);

test.each([320, 720].flatMap(width => [false, true].flatMap(dark => ['user', 'room'].flatMap(kind => [0, 30].flatMap(count => [false, true].map(swipe => ({ width, dark, kind, count, swipe })))))))(
	'keeps $kind conversation continuous at $width px with $count messages (dark: $dark, swipe: $swipe)',
	async ({ width, dark, kind, count, swipe }) => {
		await page.viewport(1100, 900);
		connection.on.mockClear();
		chatPreferences.s.enableHorizontalSwipe = swipe;
		const peer = { id: 'peer', username: 'peer', name: 'Peer', host: null, canChat: true, chatScope: 'everyone' };
		api.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'users/show') return peer;
			if (endpoint === 'chat/rooms/show') return { id: 'room', name: 'Room', ownerId: 'self', memberCount: 2 };
			if (endpoint.endsWith('-timeline')) return Array.from({ length: count }, (_, i) => ({ id: String(i), text: `Message ${i + 1}`, createdAt: '2026-10-02T00:00:00Z', fromUserId: i % 2 ? 'self' : peer.id, fromUser: i % 2 ? { ...peer, id: 'self' } : peer, reactions: [] }));
			throw new Error(`Unexpected endpoint: ${endpoint}`);
		});
		const host = document.createElement('div');
		host.style.cssText = `width:${width}px;height:700px;container-type:size;color:var(--MI_THEME-fg);--MI_THEME-bg:${dark ? '#202020' : '#eee'};--MI_THEME-panel:${dark ? '#303030' : '#fff'};--MI_THEME-panelHighlight:${dark ? '#393939' : '#f7f7f7'};--MI_THEME-fg:${dark ? '#ddd' : '#333'};--MI_THEME-divider:#8883;--MI_THEME-accent:#3478cc;--MI_THEME-shadow:rgb(0 0 0 / ${dark ? '0.3' : '0.1'});`;
		document.body.append(host);
		const app = createApp({ render: () => h(ChatRoom, kind === 'user' ? { userId: 'peer' } : { roomId: 'room' }) });
		app.component('PageWithHeader', PageWithHeader);
		app.component('MkPageHeader', MkPageHeader);
		app.component('MkStickyContainer', MkStickyContainer);
		for (const name of ['MkUserName', 'MkLoading', 'MkTime', 'MkA']) app.component(name, { render: () => null });
		app.component('MkAvatar', { render: () => h('span', { 'data-chat-avatar': '', style: 'background:var(--MI_THEME-accent);border-radius:50%;' }) });
		// 保留应用的全局组件名，只隔离富文本渲染。
		// eslint-disable-next-line vue/multi-word-component-names
		app.component('Mfm', { props: ['text'], setup: (props: { text: string }) => () => h('span', props.text) });
		app.directive('tooltip', () => {});
		app.directive('appear', () => {});
		app.provide(DI.pageMetadata, ref({ title: 'Conversation' }));
		app.mount(host);
		fixtures.push({ app, host });
		await expect.element(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
		await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		const scroller = host.querySelector<HTMLElement>('._pageScrollableReversed')!;
		const header = host.querySelector<HTMLElement>('[data-page-header]')!;
		const body = host.querySelector<HTMLElement>('[data-page-body]')!;
		const input = host.querySelector('textarea')!;
		const composer = input.parentElement!;
		const box = host.getBoundingClientRect();
		const background = dark ? 'rgb(48, 48, 48)' : 'rgb(255, 255, 255)';
		const chatBackground = dark ? 'rgb(57, 57, 57)' : 'rgb(247, 247, 247)';
		const conversation = body.querySelector<HTMLElement>('[class*="conversation"]')!;
		expect(getComputedStyle(scroller).backgroundColor).toBe(chatBackground);
		expect(getComputedStyle(body).backgroundColor).toBe(background);
		const surface = getComputedStyle(conversation);
		expect(surface.backgroundColor).toBe(chatBackground);
		expect(surface.backgroundImage).toContain('radial-gradient');
		expect(surface.boxShadow).toBe('none');
		expect(conversation.getBoundingClientRect().left).toBe(box.left);
		expect(conversation.getBoundingClientRect().right).toBe(box.right);
		expect(conversation.getBoundingClientRect().bottom).toBe(body.getBoundingClientRect().bottom);
		expect(getComputedStyle(body).padding).toBe('0px');
		expect(surface.padding).toBe('18px');
		for (const avatar of conversation.querySelectorAll('[data-chat-avatar]')) {
			const row = avatar.parentElement!;
			expect(row.getBoundingClientRect().left - box.left).toBe(18);
			expect(box.right - row.getBoundingClientRect().right).toBe(18);
		}
		expect(getComputedStyle(input).paddingLeft).toBe('18px');
		expect(getComputedStyle(input).paddingRight).toBe('18px');
		expect(getComputedStyle(input).backgroundColor).toContain('0.7');
		expect(getComputedStyle(input).backdropFilter).toBe('blur(15px)');
		expect(getComputedStyle(input).borderTopLeftRadius).toBe(getComputedStyle(composer).borderTopLeftRadius);
		expect(parseFloat(getComputedStyle(composer).borderTopLeftRadius)).toBeGreaterThan(0);
		expect(getComputedStyle(composer.querySelector('footer')!).backgroundColor).toBe(background);
		for (let ancestor: HTMLElement | null = composer; ancestor && ancestor !== scroller; ancestor = ancestor.parentElement) {
			expect(getComputedStyle(ancestor).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		}
		for (const element of [header, body, composer]) {
			expect(element.getBoundingClientRect().left).toBe(box.left);
			expect(element.getBoundingClientRect().right).toBe(box.right);
		}
		if (count === 0) {
			expect(body.getBoundingClientRect().top).toBe(header.getBoundingClientRect().bottom);
			expect(body.getBoundingClientRect().bottom).toBe(composer.getBoundingClientRect().top);
			expect(scroller.scrollHeight).toBe(scroller.clientHeight);
		} else {
			scroller.scrollTop = -200;
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
			expect(scroller.scrollTop).toBe(-200);
			const event = (name: string, data: unknown) => connection.on.mock.calls.find(([type]) => type === name)![1](data);
			const anchor = [...host.querySelectorAll<HTMLElement>('[data-chat-bubble]')].find(element => element.getBoundingClientRect().top > scroller.getBoundingClientRect().top + 20 && element.getBoundingClientRect().bottom < composer.getBoundingClientRect().top)!;
			const anchorTop = anchor.getBoundingClientRect().top;
			const reaction = { messageId: '0', reaction: '😀', ...(kind === 'room' ? { user: peer } : {}) };
			event('react', reaction);
			event('react', reaction);
			await nextTick();
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
			expect(host.querySelectorAll('button[class*="reaction_"]')).toHaveLength(1);
			expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 0);
			expect(scroller.scrollTop).toBeLessThan(0);
			event('unreact', reaction);
			await nextTick();
			await expect.poll(() => host.querySelectorAll('button[class*="reaction_"]').length).toBe(0);
			expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 0);
			expect(scroller.scrollTop).toBeLessThan(0);
			const incoming = { id: 'incoming', text: 'new message', createdAt: '2026-10-02T00:01:00Z', fromUserId: peer.id, fromUser: peer, reactions: [] };
			event('message', incoming);
			await nextTick();
			expect(scroller.scrollTop).toBeLessThan(0);
			scroller.scrollTop = 0;
			event('message', { ...incoming, id: 'following' });
			await nextTick();
			expect(scroller.scrollTop).toBe(0);
		}
		expect(header.getBoundingClientRect().top).toBe(box.top);
		expect(composer.getBoundingClientRect().bottom).toBe(box.bottom);
		await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/chat-${kind}-${width}-${count}-${dark ? 'dark' : 'light'}.png` });
		if (kind === 'room' && count === 0) {
			await page.getByRole('button', { name: /Info/ }).click();
			await nextTick();
			await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
			const info = host.querySelector<HTMLElement>('[data-room-info]')!;
			expect(info.getBoundingClientRect().height).toBe(100);
			await expect.poll(() => host.querySelector('[class*="conversation"]')).toBeNull();
			expect(host.querySelector('textarea')).toBeNull();
			expect(getComputedStyle(host.querySelector('[data-page-body]')!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
			await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/chat-info-${width}-${dark ? 'dark' : 'light'}.png` });
		}
	},
);
