/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, defineComponent, h, inject, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import 'virtual:tabler-icons.css';
import ChatLayout from '@/pages/chat/index.vue';
import ChatHome from '@/pages/chat/home.vue';
import ChatWindow from '@/ui/_common_/chat-window.vue';
import PageWithHeader from '@/components/global/PageWithHeader.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import { Nirax } from '@/lib/nirax.js';
import type { RouteDef } from '@/lib/nirax.js';
import { DI } from '@/di.js';
import { useRouter } from '@/router.js';
import type { MenuButton, MenuItem } from '@/types/menu.js';

const mocks = vi.hoisted(() => ({
	popupMenu: vi.fn<(items: MenuItem[], source: EventTarget | null) => void>(),
	selectUser: vi.fn(), popup: vi.fn(), push: vi.fn(), dispose: vi.fn(), createRouter: vi.fn(), toast: vi.fn(),
	route: { route: { name: 'chat' }, _parsedRoute: { fullPath: '/chat' } },
}));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: mocks.popupMenu, selectUser: mocks.selectUser, popup: mocks.popup, toast: mocks.toast }));
vi.mock('@/router.js', () => ({
	useRouter: () => inject(DI.router, null) ?? { current: mocks.route, currentRef: { value: mocks.route }, push: mocks.push, resolve: () => mocks.route },
	createRouter: mocks.createRouter,
	mainRouter: { pushByPath: mocks.push, replaceByPath: mocks.push },
}));
vi.mock('@/preferences.js', () => ({ prefer: { s: { numberOfPageCache: 5, animation: false, menuStyle: 'popup' } } }));
vi.mock('@/utility/popup-history.js', () => ({ setPopupHistoryDismissal: vi.fn(), syncPopupHistory: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn(), provideMetadataReceiver: vi.fn() }));
vi.mock('@/components/MkChatHistories.vue', () => ({ default: { render: () => h('span', '已有会话') } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { render: () => h('input', { type: 'search', 'aria-label': '搜索' }) } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	chat: '聊天', search: '搜索', more: '更多', close: '关闭', windowMinimize: '最小化', windowMaximize: '最大化', windowRestore: '还原',
	_chat: { groups: '群组', history: '聊天记录', newDirectMessage: '发起私信', createRoom: '创建群聊', joinRoom: '加入群聊', selectConversation: '选择一个对话开始聊天' },
} } }));

// 与 chat/room.vue 相同的会话页骨架：PageWithHeader + 粘性输入框 footer，
// 用于断言大弹窗放大后输入框仍贴在窗口底部。
const ChatRoomFixture = defineComponent({
	setup() {
		const draft = ref('');
		return () => h(PageWithHeader, { contentCard: true, fillHeight: true, hideTitle: true }, {
			default: () => h('div', '当前对话'),
			footer: () => h('div', { 'data-testid': 'chat-room-footer' }, h('input', { 'aria-label': '消息草稿', value: draft.value, onInput: (event: Event) => { draft.value = (event.target as HTMLInputElement).value; } })),
		});
	},
});

const fixtures: { app: App; host: HTMLElement }[] = [];
const ChatLink = defineComponent({
	props: ['to'],
	setup(props, { slots }) {
		const router = useRouter();
		return () => h('a', { href: props.to, onClick: (event: MouseEvent) => { event.preventDefault(); router.pushByPath(props.to); } }, slots.default?.());
	},
});

async function mountWindow() {
	const host = document.createElement('div');
	host.dataset.testid = 'chat-window-fixture';
	host.style.cssText = 'position:fixed;inset:0;';
	document.body.append(host);
	const open = ref(true);
	const restoreKey = ref(0);
	const app = createApp({ render: () => h(ChatWindow, { open: open.value, restoreKey: restoreKey.value, top: 64, 'onUpdate:open': value => { open.value = value; } }) });
	app.component('NestedRouterView', NestedRouterView);
	app.component('MkA', ChatLink);
	app.component('PageWithHeader', PageWithHeader);
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkLoading', { render: () => null });
	// eslint-disable-next-line vue/multi-word-component-names -- 与应用的全局 Mfm 注册名保持一致。
	app.component('Mfm', defineComponent({ props: ['text'], setup: props => () => h('span', props.text) }));
	app.directive('tooltip', {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	const router = mocks.createRouter.mock.results.at(-1)!.value as Nirax<RouteDef[]>;
	return { host, open, restoreKey, router };
}

async function mountChat() {
	const host = document.createElement('div');
	host.dataset.testid = 'chat-layout-fixture';
	host.style.cssText = 'width:calc(100% - 32px);height:650px;margin:16px;';
	document.body.append(host);
	const app = createApp({ render: () => h(ChatLayout) });
	app.component('MkA', ChatLink);
	app.component('NestedRouterView', { render: () => h(ChatHome) });
	app.directive('tooltip', {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	return host;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.selectUser.mockResolvedValue({ id: 'recipient' });
	mocks.popup.mockReturnValue({ dispose: mocks.dispose });
	mocks.createRouter.mockImplementation((path: string) => new Nirax([{
		path: '/chat', name: 'chat', component: ChatLayout, children: [
			{ path: '/', component: ChatHome },
			{ path: '/groups', component: ChatHome },
			{ path: '/search', component: ChatHome },
			{ path: '/user/:userId', component: ChatRoomFixture },
		],
	}], path, true, ChatHome));
});

describe('forum chat window', () => {
	test('聊天在浮窗和大弹窗之间切换保留会话与草稿，输入框仍贴近底部', async () => {
		await page.viewport(390, 800);
		const { router } = await mountWindow();
		router.pushByPath('/chat/user/recipient');
		const view = page.getByRole('dialog', { name: '聊天' });
		await expect.element(view.getByText('当前对话')).toBeVisible();
		const windowElement = view.element();
		expect(windowElement.getBoundingClientRect().width).toBeLessThan(window.innerWidth);
		await view.getByRole('textbox', { name: '消息草稿' }).fill('尚未发送');
		await page.viewport(1100, 800);
		await expect.element(view.getByRole('button', { name: '最大化' })).toBeVisible();
		expect(windowElement.getBoundingClientRect().width).toBeLessThan(window.innerWidth);
		expect(windowElement.getBoundingClientRect().left).toBeGreaterThan(0);
		expect(windowElement.getBoundingClientRect().bottom).toBe(window.innerHeight);
		await view.getByRole('button', { name: '最大化' }).click();
		await expect.element(view.getByRole('button', { name: '还原' })).toBeVisible();
		expect(document.fullscreenElement).toBeNull();
		// 宽屏放大是大弹窗而非全屏：居中留边，不贴满视口。
		const maximizedBox = windowElement.getBoundingClientRect();
		expect(maximizedBox.top).toBeGreaterThan(0);
		expect(maximizedBox.left).toBeGreaterThan(0);
		expect(maximizedBox.width).toBeLessThan(window.innerWidth);
		expect(maximizedBox.height).toBeLessThan(window.innerHeight);
		expect(Math.floor(maximizedBox.left + maximizedBox.width / 2)).toBe(Math.floor(window.innerWidth / 2));
		expect(Math.floor(maximizedBox.top + maximizedBox.height / 2)).toBe(Math.floor(window.innerHeight / 2));
		// 会话页的粘性输入框必须贴住大弹窗底部，不能停在窗口中间。
		const footer = windowElement.querySelector('[data-testid="chat-room-footer"]')!;
		const footerBox = footer.getBoundingClientRect();
		expect(Math.abs(footerBox.bottom - maximizedBox.bottom)).toBeLessThanOrEqual(1);
		await expect.element(view.getByRole('textbox', { name: '消息草稿' })).toHaveValue('尚未发送');
		await view.getByRole('button', { name: '更多' }).click();
		expect(mocks.popupMenu).toHaveBeenCalledOnce();
		await view.getByRole('button', { name: '还原' }).click();
		await expect.element(view.getByRole('button', { name: '最大化' })).toBeVisible();
		await page.viewport(390, 800);
		await expect.element(view.getByRole('button', { name: '最大化' })).not.toBeInTheDocument();
		await page.viewport(1100, 800);
		await expect.element(view.getByRole('button', { name: '最大化' })).toBeVisible();
		await expect.element(view.getByText('当前对话')).toBeVisible();
		await expect.element(view.getByRole('textbox', { name: '消息草稿' })).toHaveValue('尚未发送');
		expect(windowElement.getBoundingClientRect().width).toBeLessThan(window.innerWidth);
	});

	test('大弹窗选择会话不会移动列表标题和加号，空白点击保留窗口，Esc 按公共弹窗行为关闭', async () => {
		await page.viewport(1100, 800);
		const { router, open } = await mountWindow();
		const view = page.getByRole('dialog', { name: '聊天' });
		await view.getByRole('button', { name: '最大化' }).click();
		const navigation = view.getByRole('navigation', { name: '聊天记录' });
		await expect.element(navigation.getByRole('button', { name: '更多' })).toBeVisible();
		const menuButton = navigation.getByRole('button', { name: '更多' }).element();
		const header = menuButton.closest('header')!;
		const beforeMenu = menuButton.getBoundingClientRect();
		const beforeHeader = header.getBoundingClientRect();
		router.pushByPath('/chat/user/recipient');
		await expect.element(view.getByText('当前对话')).toBeVisible();
		expect(navigation.getByRole('button', { name: '更多' }).element()).toBe(menuButton);
		expect(menuButton.getBoundingClientRect().x).toBe(beforeMenu.x);
		expect(menuButton.getBoundingClientRect().y).toBe(beforeMenu.y);
		expect(header.getBoundingClientRect().y).toBe(beforeHeader.y);
		expect(header.getBoundingClientRect().height).toBe(beforeHeader.height);
		await page.elementLocator(page.getByTestId('bg').element().nextElementSibling!).click({ position: { x: 4, y: 4 } });
		expect(open.value).toBe(true);
		await expect.element(view.getByRole('button', { name: '还原' })).toBeVisible();
		await userEvent.keyboard('{Escape}');
		expect(open.value).toBe(false);
	});

	test('关闭重开返回聊天列表，群组和独立搜索入口按路由切换', async () => {
		await page.viewport(1100, 800);
		const { host, open, restoreKey, router } = await mountWindow();
		const view = page.getByRole('dialog', { name: '聊天' });
		router.pushByPath('/chat/user/recipient');
		await expect.element(view.getByText('当前对话')).toBeVisible();
		await view.getByRole('button', { name: '关闭' }).click();
		open.value = true;
		await expect.element(view.getByRole('link', { name: '聊天', exact: true })).toHaveAttribute('aria-current', 'page');
		await expect.element(view.getByRole('searchbox')).not.toBeInTheDocument();
		expect(router.currentRef.value._parsedRoute.fullPath).toBe('/chat');
		await view.getByRole('button', { name: '更多' }).click();
		expect(mocks.popupMenu).toHaveBeenCalledOnce();
		await view.getByRole('link', { name: '群组' }).click();
		expect(router.currentRef.value._parsedRoute.fullPath).toBe('/chat/groups');
		await expect.element(view.getByRole('link', { name: '群组' })).toHaveAttribute('aria-current', 'page');
		await view.getByRole('link', { name: '搜索', exact: true }).click();
		expect(router.currentRef.value._parsedRoute.fullPath).toBe('/chat/search');
		await expect.element(view.getByRole('link', { name: '搜索', exact: true })).toHaveAttribute('aria-current', 'page');
		await expect.element(view.getByRole('link', { name: '聊天', exact: true })).not.toHaveAttribute('aria-current');
		await expect.element(view.getByRole('searchbox')).toBeVisible();
		expect(document.activeElement).toBe(host.querySelector('input[type="search"]'));
		const history = host.querySelector('[query]')!;
		await view.getByRole('searchbox').fill('A');
		await view.getByRole('searchbox').fill('Al');
		await view.getByRole('searchbox').fill('Alice');
		expect(history.getAttribute('query')).toBe('Alice');
		await expect.poll(() => history.getAttribute('query')).toBe('Alice');
		await view.getByRole('link', { name: '群组' }).click();
		await expect.element(view.getByRole('searchbox')).not.toBeInTheDocument();
		router.replaceByPath('/chat/search');
		await expect.element(view.getByRole('searchbox')).toHaveValue('Alice');
		await view.getByRole('searchbox').fill('');
		await expect.poll(() => history.getAttribute('query')).toBe('');
		router.pushByPath('/chat/user/recipient');
		await expect.element(view.getByText('当前对话')).toBeVisible();
		restoreKey.value++;
		await expect.element(view.getByRole('searchbox')).not.toBeInTheDocument();
		expect(router.currentRef.value._parsedRoute.fullPath).toBe('/chat');
		await expect.element(view.getByRole('link', { name: '聊天', exact: true })).toHaveAttribute('aria-current', 'page');
		await view.getByRole('button', { name: '最小化' }).click();
		await expect.element(view.getByRole('button', { name: '还原' })).toBeVisible();
		await view.getByRole('button', { name: '还原' }).click();
		await expect.element(view.getByRole('link', { name: '聊天', exact: true })).toBeVisible();
		await view.getByRole('button', { name: '最小化' }).click();
		await view.getByRole('button', { name: '关闭' }).click();
		expect(open.value).toBe(false);
	});
});

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

describe('chat conversation list actions', () => {
	test.each([320, 1000])('新进入聊天未选中会话，底栏显示独立搜索入口，宽度 %i', async width => {
		await page.viewport(width, 900);
		const host = await mountChat();
		const navigation = page.elementLocator(host).getByRole('navigation', { name: '聊天记录' });
		await expect.element(navigation.getByRole('searchbox')).not.toBeInTheDocument();
		await expect.element(navigation.getByRole('link', { name: '搜索', exact: true })).toHaveAttribute('href', '/chat/search');
		await expect.element(navigation.getByRole('button', { name: '更多' })).toBeVisible();
		expect(host.querySelector('main')!.textContent).toBe('选择一个对话开始聊天');
		if (width === 1000) await expect.element(page.elementLocator(host).getByText('选择一个对话开始聊天')).toBeVisible();
		expect(mocks.push).not.toHaveBeenCalled();
		expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
	});

	test('发起私信保持单选，选择后进入该用户会话', async () => {
		await page.viewport(1000, 900);
		const host = await mountChat();
		await page.elementLocator(host).getByRole('button', { name: '更多' }).click();
		const item = mocks.popupMenu.mock.lastCall![0].find((entry): entry is MenuButton => 'text' in entry && entry.text === '发起私信' && 'action' in entry)!;
		await item.action(new PointerEvent('click'));
		expect(mocks.selectUser).toHaveBeenCalledExactlyOnceWith({ includeSelf: false, localOnly: true });
		expect(mocks.push).toHaveBeenCalledWith('/chat/user/:userId', { params: { userId: 'recipient' } });
	});

	test.each(['创建群聊', '加入群聊'])('%s 经弹窗选择群聊后进入对应会话', async name => {
		const host = await mountChat();
		await page.elementLocator(host).getByRole('button', { name: '更多' }).click();
		const item = mocks.popupMenu.mock.lastCall![0].find((entry): entry is MenuButton => 'text' in entry && entry.text === name && 'action' in entry)!;
		await item.action(new PointerEvent('click'));
		expect(mocks.popup).toHaveBeenCalledOnce();
		const callbacks = mocks.popup.mock.lastCall![2];
		(name === '创建群聊' ? callbacks.created : callbacks.selected)({ id: 'room' });
		expect(mocks.push).toHaveBeenCalledWith('/chat/room/:roomId', { params: { roomId: 'room' } });
		callbacks.closed();
		expect(mocks.dispose).toHaveBeenCalledOnce();
	});
});
