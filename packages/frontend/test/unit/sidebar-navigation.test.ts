/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import Settings from '@/pages/settings/index.vue';
import Admin from '@/pages/admin/index.vue';
import RouterView from '@/components/global/RouterView.vue';
import StackingRouterView from '@/components/global/StackingRouterView.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { DI } from '@/di.js';
import type { Router } from '@/router.js';

vi.mock('@/i.js', () => ({ $i: { id: 'self', policies: {} }, iAmAdmin: true, iAmModerator: true }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, numberOfPageCache: 4 } } }));
vi.mock('@/store.js', () => ({ store: { r: { enablePreferencesAutoCloudBackup: { value: true } }, set: vi.fn() } }));
vi.mock('@/instance.js', () => ({ instance: { disableRegistration: true } }));
vi.mock('@/pages/timeline.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/_error_.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/_loading_.vue', () => ({ default: { render: () => null } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn(), provideMetadataReceiver: vi.fn(), provideReactiveMetadata: vi.fn() }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: async () => [] }));
vi.mock('@/utility/clear-cache.js', () => ({ clearCache: vi.fn() }));
vi.mock('@/utility/lookup.js', () => ({ lookup: vi.fn() }));
vi.mock('@/utility/admin-lookup.js', () => ({ lookupUser: vi.fn(), lookupUserByEmail: vi.fn(), lookupFile: vi.fn() }));
vi.mock('@/preferences/utility.js', () => ({ enableAutoBackup: vi.fn(), getPreferencesProfileMenu: vi.fn() }));
vi.mock('@/signout.js', () => ({ signout: vi.fn() }));
vi.mock('@/composables/use-scroll-position-keeper.js', () => ({ useScrollPositionKeeper: vi.fn() }));
vi.mock('@/utility/storage.js', () => ({ getStoragePersistenceStatusRef: async () => true, storagePersistenceSupported: false, enableStoragePersistence: vi.fn(), skipStoragePersistence: vi.fn() }));
vi.mock('@/router.js', async () => {
	const { inject } = await import('vue');
	const { DI } = await import('@/di.js');
	return { useRouter: () => inject(DI.router) };
});
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkSuperMenu.vue', async () => {
	const { defineComponent, h } = await import('vue');
	const { useRouter } = await import('@/router.js');
	return { default: defineComponent({
		props: ['def'],
		setup(props) {
			const router = useRouter();
			return () => h('div', props.def.flatMap(group => group.items).filter(item => item.to).map(item => h('a', {
				href: item.to, 'data-menu-link': '', 'aria-current': item.active ? 'page' : undefined,
				onClick: (event: MouseEvent) => { event.preventDefault(); router.pushByPath(item.to); },
			}, item.text)));
		},
	}) };
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const sections = [{ path: '/settings', component: Settings, initial: '/settings/security' }, { path: '/admin', component: Admin, initial: '/admin/overview' }];

function mountSection(section: typeof sections[number], view: typeof RouterView | typeof StackingRouterView, initial: string, width = 1200) {
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);
	vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
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
			stubs: { PageWithHeader: { template: '<main><slot/></main>' }, MkLoading: true, MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' } },
		},
	});
	return { router, mounted };
}

test.each([RouterView, StackingRouterView].flatMap(view => sections.map(section => ({ view, section }))))('every $section.path menu stays in its sidebar layout (%#)', async ({ view, section }) => {
	const { router, mounted } = mountSection(section, view, section.initial);
	await waitFor(() => expect(mounted.getByTestId('child').textContent).toBe(section.initial), { timeout: 5000 });
	const sidebar = mounted.getByRole('navigation');
	const links = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('[data-menu-link]'));
	expect(links.length).toBeGreaterThan(10);
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
});

test.each([390, 1200])('opening the wallet directly keeps the settings route at %i px', async width => {
	const { router, mounted } = mountSection(sections[0], RouterView, '/settings/wallet', width);
	await waitFor(() => expect(mounted.getByTestId('child').textContent).toBe('/settings/wallet'));
	expect(router.current.route.name).toBe('settings');
	expect(router.current.child?.route.name).toBe('wallet');
	if (width === 1200) expect(mounted.getByRole('navigation').querySelector('[href="/settings/wallet"]')!.getAttribute('aria-current')).toBe('page');
	else expect(mounted.queryByRole('navigation')).toBeNull();
});

test('the settings wallet still requires login', () => {
	const loginPage = { render: () => null };
	const guest = new Nirax(ROUTE_DEF, '/settings/wallet', false, loginPage);
	guest.init();
	expect(guest.current.props.get('showLoginPopup')).toBe(true);
	expect('component' in guest.current.route && guest.current.route.component).toBe(loginPage);
});

test('settings search indexes the wallet inside settings', async () => {
	const { searchIndexes } = await import('search-index:settings');
	expect(searchIndexes.some(item => item.path === '/settings/wallet')).toBe(true);
});
