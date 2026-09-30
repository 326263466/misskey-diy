/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import ChatHome from '@/pages/chat/home.vue';
import PageWithHeader from '@/components/global/PageWithHeader.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import { adaptiveBorderDirective } from '@/directives/adaptive-border.js';
import { DI } from '@/di.js';
import type { MenuButton, MenuItem, MenuParent } from '@/types/menu.js';

const mocks = vi.hoisted(() => ({
	me: { id: 'me', policies: { chatAvailability: 'available' as 'available' | 'readonly' | 'unavailable' } },
	api: vi.fn(), popupMenu: vi.fn<(items: MenuItem[], source: EventTarget | null) => void>(), selectUser: vi.fn(), inputText: vi.fn(), push: vi.fn(), updateAccount: vi.fn(),
}));

vi.mock('misskey-js', () => ({}));
vi.mock('@/i.js', () => ({ $i: mocks.me, ensureSignin: () => mocks.me }));
vi.mock('@/os.js', () => ({ popupMenu: mocks.popupMenu, selectUser: mocks.selectUser, inputText: mocks.inputText }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn(), updateCurrentAccountPartial: mocks.updateAccount }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: mocks.push, useListener: vi.fn() }) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: {
	s: { animation: false, enableHorizontalSwipe: true, showPageTabBarBottom: false },
	r: { animation: { value: false }, enableHorizontalSwipe: { value: true } },
} }));
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn() } }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class {} }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkChatHistories.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/XMessage.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.invitations.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.joiningRooms.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.ownedRooms.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	chat: '聊天', startChat: '开始聊天', goBack: '返回', name: '名称', search: '搜索', searchResult: '搜索结果',
	_chat: {
		home: '主页', invitations: '邀请', joiningRooms: '已加入的房间', yourRooms: '我的房间',
		individualChat: '私聊', individualChat_description: '与用户聊天', roomChat: '聊天室', roomChat_description: '与多人聊天',
		createRoom: '创建房间', searchMessages: '搜索消息', history: '聊天记录',
		chatIsReadOnlyForThisAccountOrServer: '聊天只读', chatNotAvailableForThisAccountOrServer: '聊天不可用',
	},
} } }));

const fixtures: { app: App; host: HTMLElement }[] = [];

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

async function mountChat() {
	const host = document.createElement('div');
	host.id = `chat-home-fixture-${fixtures.length}`;
	host.className = '_pageContent';
	host.style.cssText = 'width:calc(100% - 32px);max-width:880px;height:650px;margin:16px;--MI-pageHeaderBorder:none;--MI_THEME-panel:#fff;--MI_THEME-fg:#333;--MI_THEME-accent:#86b300;--MI_THEME-fgOnAccent:#fff;--MI_THEME-buttonGradateA:#86b300;--MI_THEME-buttonGradateB:#65b96e;--MI_THEME-pageHeaderBg:#fff;--MI_THEME-pageHeaderFg:#333;--MI_THEME-divider:rgba(0,0,0,.1);';
	document.body.append(host);
	const app = createApp({ render: () => h(ChatHome) });
	app.provide(DI.pageMetadata, ref({ title: '聊天' }));
	app.component('PageWithHeader', PageWithHeader);
	app.component('MkPageHeader', MkPageHeader);
	app.component('MkStickyContainer', MkStickyContainer);
	for (const name of ['MkAd', 'MkAvatar', 'MkUserName']) app.component(name, { render: () => null });
	app.directive('adaptive-border', adaptiveBorderDirective);
	app.directive('tooltip', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	await document.fonts.ready;
	await nextFrame();
	await nextFrame();
	return host;
}

beforeEach(async () => {
	vi.clearAllMocks();
	mocks.me.policies.chatAvailability = 'available';
	mocks.selectUser.mockResolvedValue({ id: 'recipient' });
	mocks.inputText.mockResolvedValue({ canceled: false, result: 'New room' });
	mocks.api.mockResolvedValue({ id: 'new-room' });
	await page.viewport(1000, 900);
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
});

afterEach(async () => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	await nextFrame();
});

describe('chat home header action', () => {
	test.each([320, 1000])('places the only start action at the header right and keeps a 20px body gap at %i px', async width => {
		await page.viewport(width, 900);
		const host = await mountChat();
		const start = page.elementLocator(host).getByRole('button', { name: /开始聊天$/ });
		await expect.element(start).toBeVisible();
		const button = start.element() as HTMLButtonElement;
		const header = host.querySelector<HTMLElement>('[data-page-header]')!;
		const headerBox = header.getBoundingClientRect();
		const buttonBox = button.getBoundingClientRect();
		expect(Array.from(host.querySelectorAll('button')).filter(item => item.textContent?.trim() === '开始聊天')).toHaveLength(1);
		expect(header.contains(button)).toBe(true);
		expect(headerBox.right - buttonBox.right).toBeCloseTo(8, 1);
		expect(buttonBox.top).toBeGreaterThanOrEqual(headerBox.top);
		expect(buttonBox.bottom).toBeLessThanOrEqual(headerBox.bottom);
		expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
		const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
		expect(search.getBoundingClientRect().top - headerBox.bottom).toBe(20);
		if (width === 1000) await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/chat-home-header-wide.png' });
		await start.click();
		expect(mocks.popupMenu).toHaveBeenCalledOnce();
		expect(mocks.popupMenu.mock.lastCall?.[1]).toBe(button);
	});

	test('keeps the user and room menu actions connected to the original routes', async () => {
		const host = await mountChat();
		await page.elementLocator(host).getByRole('button', { name: /开始聊天$/ }).click();
		const menu = mocks.popupMenu.mock.lastCall![0];
		const individual = menu.find((item): item is MenuButton => 'text' in item && item.text === '私聊' && 'action' in item)!;
		individual.action(new PointerEvent('click'));
		await expect.poll(() => mocks.push.mock.lastCall).toEqual(['/chat/user/:userId', { params: { userId: 'recipient' } }]);
		expect(mocks.selectUser).toHaveBeenCalledWith({ localOnly: true });

		const roomMenu = menu.find((item): item is MenuParent => 'type' in item && item.type === 'parent' && item.text === '聊天室')!;
		expect(Array.isArray(roomMenu.children)).toBe(true);
		const room = (roomMenu.children as MenuItem[]).find((item): item is MenuButton => 'text' in item && item.text === '创建房间' && 'action' in item)!;
		room.action(new PointerEvent('click'));
		await expect.poll(() => mocks.push.mock.lastCall).toEqual(['/chat/room/:roomId', { params: { roomId: 'new-room' } }]);
		expect(mocks.inputText).toHaveBeenCalledWith({ title: '名称', minLength: 1 });
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/create', { name: 'New room' });
	});

	test.each(['readonly', 'unavailable'] as const)('omits the start action when chat is %s', async availability => {
		mocks.me.policies.chatAvailability = availability;
		const host = await mountChat();
		await expect.element(page.elementLocator(host).getByText(availability === 'readonly' ? '聊天只读' : '聊天不可用', { exact: true })).toBeVisible();
		expect(Array.from(host.querySelectorAll('button')).some(item => item.textContent?.trim() === '开始聊天')).toBe(false);
		expect(mocks.popupMenu).not.toHaveBeenCalled();
	});

	test('keeps one start action visible when switching tabs', async () => {
		const host = await mountChat();
		const view = page.elementLocator(host);
		await view.getByRole('button', { name: /邀请$/ }).click();
		await expect.element(view.getByRole('button', { name: /开始聊天$/ })).toBeVisible();
		await view.getByRole('button', { name: /主页$/ }).click();
		await expect.element(view.getByRole('button', { name: /开始聊天$/ })).toBeVisible();
		expect(Array.from(host.querySelectorAll('button')).filter(item => item.textContent?.trim() === '开始聊天')).toHaveLength(1);
	});
});
