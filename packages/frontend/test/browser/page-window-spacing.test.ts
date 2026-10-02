/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkPageWindow from '@/components/MkPageWindow.vue';
import PageWithHeader from '@/components/global/PageWithHeader.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import { definePage } from '@/page.js';

const mocks = vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
	return { createRouter: vi.fn(), useListener: vi.fn() };
});

vi.mock('misskey-js', () => ({}));
vi.mock('@/router.js', () => ({ createRouter: mocks.createRouter, mainRouter: { pushByPath: vi.fn() }, useRouter: () => ({ useListener: mocks.useListener }) }));
vi.mock('@/os.js', () => ({ openingWindowsCount: { value: 0 }, claimZIndex: () => 1000, contextMenu: vi.fn() }));
vi.mock('@/utility/popout.js', () => ({ popout: vi.fn() }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/analytics.js', () => ({ analytics: { page: vi.fn() } }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/preferences.js', () => ({ prefer: { s: {
	animation: false, numberOfPageCache: 3, enableHorizontalSwipe: false, showPageTabBarBottom: false, 'experimental.stackingRouterView': false,
} } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	goBack: '返回', reload: '刷新', showInPage: '在页面中显示', windowMinimize: '最小化', windowMaximize: '最大化', windowRestore: '还原', close: '关闭',
} } }));

let app: App | undefined;
let host: HTMLElement | undefined;

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

beforeEach(async () => {
	vi.clearAllMocks();
	await page.viewport(1200, 900);
});

afterEach(async () => {
	app?.unmount();
	host?.remove();
	await nextFrame();
});

afterAll(() => vi.unstubAllGlobals());

test.each(['note', '_pageLayout', '_standalonePage'])('keeps one 18px window inset for a %s route and no gap inside its note card', async routeShape => {
	const route = defineComponent({
		setup() {
			definePage({ title: '帖子详情', icon: 'ti ti-note' });
			return () => h(PageWithHeader, { hideHeader: true }, {
				default: () => h('div', { class: '_pageBody' }, [
					h('article', { class: '_panel', 'data-note-card': '' }, [
						h(MkPageHeader, { embedded: true, displayBackButton: true, overridePageMetadata: { title: '帖子' } }, { actions: () => h('button', { type: 'button' }, '分享') }),
						h('div', { 'data-note-content': '', style: 'padding:24px;min-height:160px;' }, [
							h('strong', '示例用户'),
							h('p', '这是一条在独立窗口中打开的帖子。'),
						]),
					]),
				]),
			});
		},
	});
	const component = routeShape === 'note' ? route : defineComponent({
		setup: () => () => h('div', { class: routeShape }, [h(route)]),
	});
	mocks.createRouter.mockReturnValue({
		current: { route: { path: '/notes/example', component }, props: new Map() },
		getCurrentFullPath: () => '/notes/example', addListener: vi.fn(), useListener: mocks.useListener, init: vi.fn(),
	});
	host = document.createElement('div');
	host.id = 'page-window-spacing-fixture';
	host.style.cssText = '--MI-pageHeaderBorder:none;--MI_THEME-bg:#f1f3f5;--MI_THEME-panel:#fff;--MI_THEME-fg:#333;--MI_THEME-pageHeaderBg:#fff;--MI_THEME-pageHeaderFg:#333;--MI_THEME-divider:rgba(0,0,0,.1);--MI_THEME-modalBg:rgba(0,0,0,.2);';
	document.body.append(host);
	app = createApp({ render: () => h(MkPageWindow, { initialPath: '/notes/example' }) });
	app.component('MkPageHeader', MkPageHeader);
	app.component('MkStickyContainer', MkStickyContainer);
	for (const name of ['StackingRouterView', 'MkLoading', 'MkAvatar', 'MkUserName']) app.component(name, { render: () => null });
	app.directive('tooltip', () => {});
	app.mount(host);
	await document.fonts.ready;
	await nextFrame();
	await nextFrame();

	const windowBody = host.querySelector<HTMLElement>('._shadow')!;
	const title = windowBody.firstElementChild!.getBoundingClientRect();
	const windowContent = windowBody.lastElementChild!.getBoundingClientRect();
	const card = host.querySelector<HTMLElement>('[data-note-card]')!;
	const cardBox = card.getBoundingClientRect();
	const header = card.querySelector<HTMLElement>('[data-page-header]')!.getBoundingClientRect();
	const content = card.querySelector<HTMLElement>('[data-note-content]')!.getBoundingClientRect();
	expect(cardBox.width).toBeGreaterThan(0);
	expect(cardBox.top - title.bottom).toBe(18);
	expect(cardBox.left - windowContent.left).toBe(18);
	expect(windowContent.right - cardBox.right).toBe(18);
	expect(content.top - header.bottom).toBe(0);
	for (const container of host.querySelectorAll<HTMLElement>('._pageContainer, ._pageScrollable, ._pageScrollableReversed')) {
		expect(getComputedStyle(container).scrollbarWidth).toBe('none');
	}
	if (routeShape === 'note') await page.screenshot({ element: windowBody, path: '../e2e/artifacts/component-browser/page-window-spacing-wide.png' });

	card.querySelector<HTMLElement>('[data-note-content]')!.style.minHeight = '1200px';
	await nextFrame();
	const scrollContainer = Array.from(host.querySelectorAll<HTMLElement>('._pageContainer, ._pageScrollable'))
		.find(container => container.clientHeight > 0 && container.scrollHeight > container.clientHeight);
	expect(scrollContainer).toBeDefined();
	scrollContainer!.scrollTop = 120;
	expect(scrollContainer!.scrollTop).toBe(120);
});
