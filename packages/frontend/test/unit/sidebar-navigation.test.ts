/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { defineComponent, h, ref } from 'vue';
import type { PropType } from 'vue';
import Settings from '@/pages/settings/index.vue';
import Admin from '@/pages/admin/index.vue';
import MyCenter from '@/pages/my/index.vue';
import Articles from '@/pages/articles/index.vue';
import ChatLayout from '@/pages/chat/index.vue';
import ChatHome from '@/pages/chat/home.vue';
import Dock from '@/ui/_common_/dock.vue';
import RouterView from '@/components/global/RouterView.vue';
import StackingRouterView from '@/components/global/StackingRouterView.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';
import { mainRouter } from '@/router.js';
import type { Router } from '@/router.js';

const navigationMocks = vi.hoisted(() => ({ api: vi.fn().mockResolvedValue([]) }));

vi.mock('@/i.js', () => {
	const account = { id: 'self', policies: { chatAvailability: 'available' } };
	return { $i: account, ensureSignin: () => account, iAmAdmin: true, iAmModerator: true };
});
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, numberOfPageCache: 4 }, r: { menu: { value: [] } } } }));
vi.mock('@/navbar.js', () => ({ navbarItemDef: {}, primaryNavItems: ['explore', 'channels', 'shop'], launchPadExcludedItems: [] }));
vi.mock('@/store.js', () => ({ store: { r: { enablePreferencesAutoCloudBackup: { value: true } }, set: vi.fn() } }));
vi.mock('@/instance.js', () => ({ instance: { disableRegistration: true, articleCategories: [{ id: 'tech', name: '技术交流' }, { id: 'life', name: '生活' }] } }));
vi.mock('@/pages/timeline.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/_error_.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/_loading_.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/XMessage.vue', () => ({ default: { render: () => null } }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn(), provideMetadataReceiver: vi.fn(), provideReactiveMetadata: vi.fn() }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: navigationMocks.api }));
vi.mock('@/utility/clear-cache.js', () => ({ clearCache: vi.fn() }));
vi.mock('@/utility/lookup.js', () => ({ lookup: vi.fn() }));
vi.mock('@/utility/admin-lookup.js', () => ({ lookupUser: vi.fn(), lookupUserByEmail: vi.fn(), lookupFile: vi.fn() }));
vi.mock('@/preferences/utility.js', () => ({ enableAutoBackup: vi.fn(), getPreferencesProfileMenu: vi.fn() }));
vi.mock('@/signout.js', () => ({ signout: vi.fn() }));
vi.mock('@/composables/use-scroll-to-top.js', () => ({ useScrollToTop: vi.fn() }));
vi.mock('@/utility/storage.js', () => ({ getStoragePersistenceStatusRef: async () => true, storagePersistenceSupported: false, enableStoragePersistence: vi.fn(), skipStoragePersistence: vi.fn() }));
vi.mock('@/router.js', async () => {
	const { inject, shallowRef } = await import('vue');
	const { DI } = await import('@/di.js');
	return { useRouter: () => inject(DI.router), mainRouter: { currentRef: shallowRef(null) } };
});
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkSuperMenu.vue', async () => {
	const { defineComponent, h } = await import('vue');
	const { useRouter } = await import('@/router.js');
	return { default: defineComponent({
		props: { def: { type: Array as PropType<Array<{ items: Array<{ to?: string; active?: boolean; text: string }> }>>, required: true } },
		setup(props) {
			const router = useRouter();
			return () => h('div', props.def.flatMap(group => group.items).filter((item): item is typeof item & { to: string } => item.to != null).map(item => h('a', {
				href: item.to, 'data-menu-link': '', 'aria-current': item.active ? 'page' : undefined,
				onClick: (event: MouseEvent) => { event.preventDefault(); router.pushByPath(item.to); },
			}, item.text)));
		},
	}) };
});

beforeEach(() => {
	navigationMocks.api.mockReset().mockResolvedValue([]);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const sections = [
	{ path: '/settings', component: Settings, initial: '/settings/security' },
	{ path: '/admin', component: Admin, initial: '/admin/overview' },
	{ path: '/my', component: MyCenter, initial: '/my/wallet' },
];

function mountSection(section: typeof sections[number], view: typeof RouterView | typeof StackingRouterView, initial: string, width = 1200) {
	let layoutWidth = width;
	let onResize: ResizeObserverCallback | undefined;
	vi.stubGlobal('innerWidth', width);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => layoutWidth);
	vi.stubGlobal('ResizeObserver', class {
		constructor(callback: ResizeObserverCallback) { onResize = callback; }
		observe() {}
		disconnect() {}
	});
	const parent = ROUTE_DEF.find(route => route.path === section.path)!;
	if (!('children' in parent)) throw new Error(`No child routes for ${section.path}`);
	const router = new Nirax([{
		...parent,
		component: section.component,
		children: parent.children.map(route => 'redirect' in route ? route : {
			...route,
			component: defineComponent({ render: () => h('output', { 'data-testid': 'child' }, section.path + route.path) }),
		}),
	}], initial, true, { render: () => h('div', 'Missing route') });
	const mounted = render(view, {
		props: { router: router as unknown as Router },
		global: {
			provide: { [DI.router as symbol]: router },
			components: { NestedRouterView },
			stubs: {
				PageWithHeader: { template: '<main><slot/></main>' }, MkLoading: true,
				MkA: defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', {
					href: props.to,
					onClick: (event: MouseEvent) => { event.preventDefault(); router.pushByPath(props.to); },
				}, slots.default?.()) }),
			},
		},
	});
	return {
		router, mounted,
		resize(nextWidth: number) {
			layoutWidth = nextWidth;
			onResize?.([{ borderBoxSize: [{ inlineSize: nextWidth }] }] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
		},
	};
}

test.each([RouterView, StackingRouterView].flatMap(view => sections.map(section => ({ view, section }))))('every $section.path menu stays in its sidebar layout (%#)', async ({ view, section }) => {
	const { router, mounted } = mountSection(section, view, section.initial);
	await waitFor(() => expect(mounted.getByTestId('child').textContent).toBe(section.initial), { timeout: 5000 });
	const sidebar = mounted.getByRole('navigation');
	const links = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('[data-menu-link]'));
	if (section.path === '/my') expect(links).toHaveLength(16);
	else expect(links.length).toBeGreaterThan(10);
	for (const link of links) {
		const path = link.getAttribute('href')!;
		expect(router.resolve(path)?.route.path, path).toBe(section.path);
		expect(router.resolve(path)?.child, path).toBeDefined();
		await fireEvent.click(link);
		await waitFor(() => expect(mounted.getByTestId('child').textContent).toBe(path));
		expect(mounted.getByRole('navigation')).toBe(sidebar);
		expect(link.getAttribute('aria-current'), path).toBe('page');
		expect(mounted.container.querySelector('._pageContent')!.contains(mounted.getByTestId('child'))).toBe(true);
	}
	router.replaceByPath(section.initial);
	await waitFor(() => expect(mounted.getByTestId('child').textContent).toBe(section.initial));
	expect(mounted.getByRole('navigation')).toBe(sidebar);
	if (section.path === '/my') {
		router.pushByPath('/my');
		await waitFor(() => expect(router.getCurrentFullPath()).toBe('/my/wallet'));
		await waitFor(() => expect(mounted.getByTestId('child').textContent).toBe('/my/wallet'));
		expect(mounted.getByRole('navigation')).toBe(sidebar);
	}
});

test.each([RouterView, StackingRouterView])('opens a personal center page and returns to its narrow menu (%#)', async view => {
	const { router, mounted, resize } = mountSection(sections[2], view, '/my/benefits', 390);
	await waitFor(() => expect(mounted.getByTestId('child').textContent).toBe('/my/benefits'));
	expect(router.getCurrentFullPath()).toBe('/my/benefits');
	await fireEvent.click(mounted.getByRole('link', { name: i18n.ts._myCenter.title }));
	await waitFor(() => expect(mounted.getByRole('navigation', { name: i18n.ts._myCenter.title })).toBeTruthy());
	expect(router.getCurrentFullPath()).toBe('/my');
	const navigation = mounted.getByRole('navigation', { name: i18n.ts._myCenter.title });
	expect(within(navigation).getByRole('link', { name: i18n.ts._benefits.title }).getAttribute('href')).toBe('/my/benefits');
	resize(1040);
	await waitFor(() => expect(mounted.getByTestId('child').textContent).toBe('/my/wallet'));
	expect(router.getCurrentFullPath()).toBe('/my/wallet');
	expect(mounted.getByRole('navigation', { name: i18n.ts._myCenter.title })).toBe(navigation);
});

test('redirects the former personal pages into the personal center', () => {
	const router = new Nirax(ROUTE_DEF, '/', true, { render: () => null });
	for (const [from, to] of [
		['/wallet', '/my/wallet'], ['/wallet/overview', '/my/wallet'], ['/wallet/transactions', '/my/wallet/transactions'],
		['/wallet/red-packets', '/my/wallet/red-packets'], ['/wallet/transfers', '/my/wallet/transfers'], ['/wallet/benefits', '/my/benefits'],
		['/checkin', '/my/checkin'], ['/orders', '/my/orders'], ['/orders?mode=sales', '/my/sales'], ['/orders/order-1', '/my/orders/order-1'],
		['/products/manage', '/my/products'], ['/products/new', '/my/products/new'], ['/products/product-1/edit', '/my/products/product-1/edit'],
	]) {
		router.pushByPath(from);
		expect(router.getCurrentFullPath(), from).toBe(to);
		router.replaceByPath('/');
	}
	for (const path of ['/my/notifications', '/my/lists/list-1', '/my/drive/file/file-1', '/products/product-1']) {
		expect(router.resolve(path)?.route.path, path).not.toBe('/:(*)');
	}
	expect(router.resolve('/my/notifications')?.route.path).toBe('/my/notifications');
	expect(router.resolve('/products/product-1')?.route.name).toBe('shop');
});

test.each([RouterView, StackingRouterView])('keeps the shared article dock mounted and separates the standalone shop page (%#)', async view => {
	const parent = ROUTE_DEF.find(route => 'name' in route && route.name === 'index')!;
	if (!('children' in parent)) throw new Error('No article child routes');
	const shop = ROUTE_DEF.find(route => route.path === '/shop')!;
	const router = new Nirax([{
		...parent,
		component: Articles,
		children: parent.children.map(route => ({
			...route,
			component: defineComponent({ props: ['categoryId'], setup: props => () => h('output', { 'data-testid': 'article-list' }, props.categoryId ?? 'all') }),
		})),
	}, {
		...shop,
		component: defineComponent({ render: () => h('div', { 'data-testid': 'shop' }, 'Shop') }),
	}], '/articles/category/tech', true, { render: () => h('div', 'Missing route') });
	mainRouter.currentRef = router.currentRef;
	const shell = defineComponent({
		setup: () => () => h('div', [
			router.currentRef.value.route.name === 'index' ? h(Dock, { articleCategories: true, 'data-testid': 'article-dock' }) : null,
			h(view, { router: router as unknown as Router }),
		]),
	});
	const mounted = render(shell, {
		global: {
			provide: { [DI.router as symbol]: router },
			components: { NestedRouterView },
			stubs: {
				MkLoading: true,
				MkModalWindow: defineComponent({ emits: ['closed'], setup: (_, { emit, expose, slots }) => {
					expose({ close: () => emit('closed') });
					return () => h('section', [slots.header?.(), slots.default?.()]);
				} }),
				MkA: defineComponent({
					props: ['to'],
					setup: (props, { slots }) => () => h('a', {
						href: props.to,
						onClick: (event: MouseEvent) => { event.preventDefault(); router.pushByPath(props.to); },
					}, slots.default?.()),
				}),
			},
		},
	});
	await waitFor(() => expect(mounted.getByTestId('article-list').textContent).toBe('tech'));
	const dock = mounted.getByTestId('article-dock');
	const sidebar = mounted.getByRole('navigation');
	const categorySelector = mounted.getByRole('button', { name: i18n.ts._article.categories });
	for (const [name, category, path] of [['生活', 'life', '/articles/category/life'], ['综合', 'all', '/'], ['技术交流', 'tech', '/articles/category/tech']]) {
		const link = mounted.getByRole('link', { name });
		await fireEvent.click(link);
		await waitFor(() => expect(mounted.getByTestId('article-list').textContent).toBe(category));
		expect(router.getCurrentFullPath()).toBe(path);
		expect(mounted.getByTestId('article-dock')).toBe(dock);
		expect(mounted.getByRole('navigation')).toBe(sidebar);
		expect(mounted.getByRole('button', { name: i18n.ts._article.categories })).toBe(categorySelector);
		expect(link.getAttribute('aria-current')).toBe('page');
	}
	if (view === StackingRouterView) {
		await fireEvent.click(mounted.getByRole('link', { name: '生活' }));
		await waitFor(() => expect(mounted.getByTestId('article-list').textContent).toBe('life'));
	}
	router.pushByPath('/shop');
	await waitFor(() => expect(mounted.getByTestId('shop')).toBeDefined());
	expect(mounted.queryByTestId('article-dock')).toBeNull();
	expect(mounted.getByTestId('shop').contains(sidebar)).toBe(false);
	if (view === StackingRouterView) {
		await fireEvent.click(mounted.container.querySelector('button:has(.ti-x)')!);
		await waitFor(() => expect(router.getCurrentFullPath()).toBe('/articles/category/life'));
		expect(mounted.getByTestId('article-list').textContent).toBe('life');
		expect(mounted.getByRole('button', { name: i18n.ts._article.categories })).toBe(categorySelector);
	}
	router.replaceByPath('/articles/category/life');
	await waitFor(() => expect(mounted.getByTestId('article-list').textContent).toBe('life'));
	expect(mounted.getByRole('link', { name: '生活' }).getAttribute('aria-current')).toBe('page');
	expect(categorySelector.textContent).toContain('生活');
	await fireEvent.click(categorySelector);
	const categories = within(within(document.body).getByRole('group', { name: i18n.ts._article.categories }));
	await fireEvent.click(categories.getByRole('button', { name: '技术交流' }));
	await waitFor(() => expect(mounted.getByTestId('article-list').textContent).toBe('tech'));
	expect(mounted.getByRole('link', { name: '技术交流' }).getAttribute('aria-current')).toBe('page');
});

test.each([RouterView, StackingRouterView])('keeps the chat list mounted and toggles the selected conversation (%#)', async view => {
	const parent = ROUTE_DEF.find(route => 'name' in route && route.name === 'chat')!;
	if (!('children' in parent)) throw new Error('No chat child routes');
	const alice = { id: 'alice', name: 'Alice', username: 'alice' };
	const bob = { id: 'bob', name: 'Bob', username: 'bob' };
	const userMessages = [alice, bob, ...Array.from({ length: 98 }, (_, index) => ({ id: `peer-${index}`, name: `Peer ${index}`, username: `peer-${index}` })), { id: 'oldest', name: 'Oldest chat', username: 'oldest' }].map((user, index) => ({
		id: `message-${user.id}`, fromUserId: user.id, fromUser: user, toUserId: 'self', toUser: { id: 'self' },
		toRoomId: null, toRoom: null, createdAt: new Date(Date.UTC(2026, 9, 4, 0, index)).toISOString(), isRead: true,
	}));
	const roomMessages = [{
		id: 'message-room', fromUserId: alice.id, fromUser: alice, toUserId: null, toUser: null,
		toRoomId: 'room-a', toRoom: { id: 'room-a', name: 'Room A' }, createdAt: '2026-10-04T00:03:00.000Z', isRead: true,
	}];
	const emptyRoom = { id: 'room-empty', name: 'Empty room', owner: alice, createdAt: '2026-10-04T00:00:00.000Z' };
	navigationMocks.api.mockImplementation(async (endpoint, params) => {
		if (endpoint === 'chat/history') return (params.room ? roomMessages : userMessages).slice(params.offset ?? 0, (params.offset ?? 0) + params.limit);
		if (endpoint === 'chat/rooms/owned') return [emptyRoom];
		if (endpoint === 'chat/rooms/joining') return [{ id: 'membership', room: emptyRoom }];
		return [];
	});
	const router = new Nirax([{
		...parent,
		component: ChatLayout,
		children: parent.children.map(route => ({
			...route,
			component: defineComponent({ props: ['userId', 'roomId', 'messageId'], setup: props => () => h('output', { 'data-testid': 'conversation' }, props.userId ?? props.roomId ?? props.messageId ?? 'home') }),
		})),
	}, {
		path: '/timeline',
		component: defineComponent({ render: () => h('div', { 'data-testid': 'timeline' }, 'Timeline') }),
	}], '/chat/user/alice', true, { render: () => h('div', 'Missing route') });
	mainRouter.currentRef = router.currentRef;
	const mounted = render(view, {
		props: { router: router as unknown as Router },
		global: {
			provide: { [DI.router as symbol]: router },
			components: { NestedRouterView },
			stubs: {
				MkLoading: true, MkAvatar: true, MkError: true, MkAcct: true, MkTime: true, MkInput: true, Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
				MkUserName: { props: ['user'], template: '<span>{{ user.name || user.username }}</span>' },
				MkA: defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', {
					href: props.to,
					onClick: (event: MouseEvent) => { event.preventDefault(); router.pushByPath(props.to); },
				}, slots.default?.()) }),
			},
		},
	});
	await waitFor(() => expect(mounted.getByRole('link', { name: 'Alice' })).toBeDefined());
	await waitFor(() => expect(mounted.getByTestId('conversation').textContent).toBe('alice'));
	const navigation = mounted.getByRole('navigation', { name: i18n.ts._chat.history });
	const conversationContainer = mounted.getByTestId('conversation').parentElement;
	const aliceLink = mounted.getByRole('link', { name: 'Alice' });
	expect(mounted.getAllByRole('link', { name: 'Empty room' })).toHaveLength(1);
	await fireEvent.click(aliceLink);
	await waitFor(() => expect(mounted.getByTestId('conversation').textContent).toBe('alice'));
	expect(router.getCurrentFullPath()).toBe('/chat/user/alice');
	for (const [name, id, path] of [['Bob', 'bob', '/chat/user/bob'], ['Room A', 'room-a', '/chat/room/room-a'], ['Empty room', 'room-empty', '/chat/room/room-empty'], ['Oldest chat', 'oldest', '/chat/user/oldest'], ['Alice', 'alice', '/chat/user/alice']]) {
		const link = mounted.getByRole('link', { name: name === 'Room A' ? /^Room A\b/ : name });
		await fireEvent.click(link);
		await waitFor(() => expect(mounted.getByTestId('conversation').textContent).toBe(id));
		expect(router.getCurrentFullPath()).toBe(path);
		expect(link.getAttribute('aria-current')).toBe('page');
		expect(mounted.getByRole('navigation', { name: i18n.ts._chat.history })).toBe(navigation);
		expect(mounted.getByRole('link', { name: 'Alice' })).toBe(aliceLink);
		expect(mounted.getByTestId('conversation').parentElement).toBe(conversationContainer);
	}
	if (view === StackingRouterView) {
		await fireEvent.click(mounted.getByRole('link', { name: 'Bob' }));
		await waitFor(() => expect(mounted.getByTestId('conversation').textContent).toBe('bob'));
		router.pushByPath('/timeline');
		await waitFor(() => expect(mounted.getByTestId('timeline')).toBeDefined());
		await fireEvent.click(mounted.container.querySelector('button:has(.ti-x)')!);
		await waitFor(() => expect(router.getCurrentFullPath()).toBe('/chat/user/bob'));
		expect(mounted.getByTestId('conversation').textContent).toBe('bob');
		expect(mounted.getByTestId('conversation').parentElement).toBe(conversationContainer);
		expect(mounted.getByRole('navigation', { name: i18n.ts._chat.history })).toBe(navigation);
	}
	router.replaceByPath('/chat');
	await waitFor(() => expect(mounted.getByTestId('conversation').textContent).toBe('home'));
	expect(navigationMocks.api).toHaveBeenCalledWith('chat/history', { room: false, limit: 100, offset: 100 });
});

test('shows chat history immediately inside a page window', async () => {
	const parent = ROUTE_DEF.find(route => 'name' in route && route.name === 'chat')!;
	if (!('children' in parent)) throw new Error('No chat child routes');
	const alice = { id: 'alice', name: 'Alice', username: 'alice' };
	navigationMocks.api.mockImplementation(async (endpoint, params) => endpoint === 'chat/history' && !params.room ? [{
		id: 'message-alice', fromUserId: alice.id, fromUser: alice, toUserId: 'self', toUser: { id: 'self' },
		toRoomId: null, toRoom: null, createdAt: '2026-10-04T00:00:00.000Z', isRead: true,
	}] : []);
	const router = new Nirax([{
		...parent,
		component: ChatLayout,
		children: parent.children.map(route => ({
			...route,
			component: route.name === 'chat-home' ? ChatHome : defineComponent({ render: () => h('div', 'Conversation') }),
		})),
	}], '/chat', true, { render: () => null });
	const mounted = render(RouterView, {
		props: { router: router as unknown as Router },
		global: {
			provide: { [DI.router as symbol]: router, chatNavigationInDock: ref(true), inWindow: true },
			components: { NestedRouterView },
			stubs: {
				MkLoading: true, MkAvatar: true, MkError: true, MkAcct: true, MkTime: true, MkAd: true, Mfm: true, MkInput: true,
				MkFoldableSection: { template: '<section><header><slot name="header"/></header><slot/></section>' },
				MkUserName: { props: ['user'], template: '<span>{{ user.name || user.username }}</span>' },
				MkA: defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', {
					href: props.to,
					onClick: (event: MouseEvent) => { event.preventDefault(); router.pushByPath(props.to); },
				}, slots.default?.()) }),
			},
		},
	});
	await waitFor(() => expect(mounted.getByRole('link', { name: 'Alice' })).toBeDefined());
	expect(router.getCurrentFullPath()).toBe('/chat');
});
