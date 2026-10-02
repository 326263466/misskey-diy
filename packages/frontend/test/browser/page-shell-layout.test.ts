/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { page } from 'vitest/browser';
import '@/style.scss';
import type { PageMetadata } from '@/page.js';
import Universal from '@/ui/universal.vue';
import { mainRouter } from '@/router.js';

vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
	vi.stubGlobal('_DEV_', false);
});

vi.mock('@@/js/config.js', () => ({ instanceName: 'Test' }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {} } }));

const mocks = vi.hoisted(() => ({
	receiveMetadata: null as ((getter: () => PageMetadata | null) => void) | null,
	signedIn: false,
	navigation: false,
}));

vi.mock('@/router.js', async () => {
	const { shallowRef } = await import('vue');
	return { mainRouter: { currentRoute: shallowRef({ path: '/settings' }), on: vi.fn() } };
});
vi.mock('@/page.js', () => ({
	provideMetadataReceiver: (receiver: typeof mocks.receiveMetadata) => { mocks.receiveMetadata = receiver; },
	provideReactiveMetadata: vi.fn(),
}));
vi.mock('@/preferences.js', () => ({ prefer: { s: {}, r: { showTitlebar: { value: false } } } }));
vi.mock('@/preferences/utility.js', () => ({ shouldSuggestRestoreBackup: false }));
vi.mock('@/utility/reload-suggest.js', () => ({ shouldSuggestReload: false }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null } }));
vi.mock('@/theme.js', () => ({ isPreviewMode: false }));
vi.mock('@/i.js', () => ({ get $i() { return mocks.signedIn ? { id: 'self' } : null; } }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/ui/_common_/common.vue', () => ({ default: { render: () => h('div') } }));
vi.mock('@/ui/_common_/mobile-footer-menu.vue', () => ({ default: { render: () => h('div') } }));
vi.mock('@/ui/_common_/PreferenceRestore.vue', () => ({ default: { render: () => h('div') } }));
vi.mock('@/ui/_common_/ReloadSuggestion.vue', () => ({ default: { render: () => h('div') } }));
vi.mock('@/ui/_common_/ThemePreviewing.vue', () => ({ default: { render: () => h('div') } }));
vi.mock('@/ui/_common_/titlebar.vue', () => ({ default: { render: () => h('div') } }));
vi.mock('@/ui/_common_/juejin-header.vue', () => ({
	default: { props: ['dockHidden'], render: () => h('header', { 'data-testid': 'header', style: 'height:48px' }) },
}));
vi.mock('@/ui/_common_/juejin-dock.vue', () => ({ default: { render: () => h('nav') } }));
vi.mock('@/ui/_common_/juejin-checkin.vue', () => ({ default: { render: () => h('div') } }));
vi.mock('@/ui/_common_/juejin-floating-actions.vue', () => ({
	default: { props: ['content'], render: () => h('div') },
}));
vi.mock('@/ui/_common_/widgets.vue', () => ({ default: { render: () => h('aside') } }));
vi.mock('@/ui/_common_/statusbars.vue', () => ({ __esModule: true, default: { render: () => h('div') } }));
vi.mock('@/ui/_common_/announcements.vue', () => ({ default: { render: () => h('div') } }));

let app: App | undefined;
let host: HTMLElement | undefined;

function renderShell() {
	host = document.createElement('div');
	document.body.append(host);
	app = createApp(Universal);
	app.component('RouterView', {
		render: () => h('main', { 'data-testid': 'page', style: 'height:100%' }, mocks.navigation
			? h('div', { class: '_pageLayout _pageLayoutWithSidebar' }, [h('nav', { class: '_pageNavigation' }, 'Menu'), h('section', { class: '_pageContent', 'data-testid': 'surface' }, 'Content')])
			: h('section', { 'data-testid': 'surface' }, 'Content')),
	});
	app.component('StackingRouterView', { render: () => null });
	app.mount(host);
	const view = { getByTestId: (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)! };
	return { view, columns: view.getByTestId('page').parentElement!.parentElement! };
}

async function publishMetadata(needWideArea: boolean) {
	expect(mocks.receiveMetadata).not.toBeNull();
	mocks.receiveMetadata!(() => ({ title: 'Page', needWideArea }));
	await nextTick();
}

beforeEach(() => {
	vi.stubGlobal('innerWidth', 1440);
	mocks.receiveMetadata = null;
	mocks.signedIn = false;
});

afterEach(() => {
	app?.unmount();
	host?.remove();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test.each(['/feedback', '/settings', '/admin', '/@:acct', 'community'])('keeps the correct width and header gap for %s before and after loading', async path => {
	await page.viewport(1600, 900);
	mocks.navigation = path !== '/feedback';
	mainRouter.currentRoute.value = { path: path === 'community' ? '' : path, name: path === 'community' ? 'community' : undefined } as typeof mainRouter.currentRoute.value;
	const { view, columns } = renderShell();
	await nextTick();
	const measure = () => {
		const surface = view.getByTestId('surface').getBoundingClientRect();
		const header = view.getByTestId('header').getBoundingClientRect();
		return { width: columns.getBoundingClientRect().width, gap: surface.top - header.bottom };
	};
	const initial = measure();
	expect(initial.width).toBe((mocks.navigation ? 1040 : 1200) + 32);
	expect(initial.gap).toBe(18);
	await publishMetadata(true);
	expect(measure()).toEqual(initial);
	await publishMetadata(false);
	expect(measure()).toEqual(initial);
});
