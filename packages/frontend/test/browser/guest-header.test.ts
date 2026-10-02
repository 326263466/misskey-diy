/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import Header from '@/ui/_common_/juejin-header.vue';
import MkLaunchPad from '@/components/MkLaunchPad.vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';

const mocks = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: vi.fn() }) }));
vi.mock('@/instance.js', () => ({ instance: { name: '公开社区', disableRegistration: true } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menu: [] }, r: { menu: { value: [] } } } }));
vi.mock('@/store.js', () => ({ store: { r: { realtimeMode: { value: false } } } }));
vi.mock('@/navbar.js', () => ({ navbarItemDef: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`item${i}`, { title: ['Follow requests', 'Community ranking', 'Clear cache', '个人资料', '通知', 'Preferences', '邀请码', '二维码'][i % 8], icon: 'ti ti-folder', action: vi.fn() }])) }));
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.({ type: 'popup', maxHeight: window.innerHeight - 80 })) }) };
});
vi.mock('@/os.js', () => ({ popupAsyncWithDialog: mocks.signup, post: vi.fn(), popupMenu: vi.fn() }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: mocks.login }));
vi.mock('@/components/MkSignupDialog.vue', () => ({ default: {} }));
vi.mock('@/components/global/MkA.vue', () => ({ getLinkMenu: vi.fn() }));
vi.mock('@/ui/_common_/common.js', () => ({ openInstanceMenu: vi.fn(), toggleRealtimeMode: vi.fn() }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/filters/user.js', () => ({ userName: vi.fn(), userPage: vi.fn() }));
vi.mock('@/utility/user-status.js', () => ({ getUserStatusDisplay: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	instance: '社区', navbar: '导航', home: '首页', timeline: '时间线', login: '登录', signup: '注册',
	search: '搜索', more: '更多', invitationRequiredToRegister: '注册需要邀请码',
	_search: { placeholder: '搜索公开内容' }, _postForm: { post: '发布' },
} } }));

const fixtures: { app: App; host: HTMLElement }[] = [];
afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) { app.unmount(); host.remove(); }
	vi.clearAllMocks();
});

test.each([320, 375, 1280])('keeps public navigation and authentication usable at %ipx', async width => {
	await page.viewport(width, 700);
	mocks.signup.mockResolvedValue({ dispose: vi.fn() });
	const host = document.createElement('div');
	host.style.cssText = 'width:100%;--MI_THEME-panel:#fff;--MI_THEME-navBg:#fff;--MI_THEME-navFg:#394452;--MI_THEME-fg:#394452;--MI_THEME-accent:#1677ff;--MI_THEME-accentedBg:#eaf3ff;--MI_THEME-fgOnAccent:#fff;--MI_THEME-divider:#e5e7eb;';
	host.style.setProperty('--MI_THEME-fgTransparentWeak', '#798390');
	document.body.append(host);
	const app = createApp({ render: () => h(Header, { dockHidden: true }) });
	app.component('MkA', defineComponent({
		props: { to: { type: String, required: true } },
		setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()),
	}));
	app.component('MkAvatar', { render: () => null });
	app.directive('tooltip', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	await document.fonts.ready;
	expect(host.scrollWidth).toBeLessThanOrEqual(width);
	expect(host.querySelector('a[href="/"]')?.textContent).toBe('首页');
	expect(host.querySelector('a[href="/timeline"]')?.textContent).toBe('时间线');
	expect(getComputedStyle(page.getByRole('button', { name: '更多', exact: true }).element()).color).toBe('rgb(121, 131, 144)');
	const login = page.getByRole('button', { name: '登录', exact: true });
	const signup = page.getByRole('button', { name: '注册', exact: true });
	for (const button of [login.element(), signup.element()]) {
		const bounds = button.getBoundingClientRect();
		expect(bounds.width).toBeGreaterThan(30);
		expect(bounds.right).toBeLessThanOrEqual(width);
	}
	await login.click();
	expect(mocks.login).toHaveBeenCalledWith({ message: '' });
	await signup.click();
	expect(mocks.signup).toHaveBeenCalledWith(expect.any(Promise), { autoSet: true }, expect.any(Object));
	if (width === 375) await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/guest-header-mobile.png' });
});

test.each([320, 1000].flatMap(width => [8, 24].map(count => ({ width, count }))))('more menu keeps its natural height and secondary colors at $width px with $count items', async ({ width, count }) => {
	await page.viewport(width, 900);
	const host = document.createElement('div');
	host.style.cssText = '--MI_THEME-popup:#fff;--MI_THEME-fg:#222;--MI_THEME-fgTransparentWeak:#798390;';
	document.body.append(host);
	const app = createApp({ render: () => h(MkLaunchPad, { excludedItems: Array.from({ length: 24 - count }, (_, i) => `item${i + count}`) }) });
	app.component('MkA', { render: () => null });
	app.directive('click-anime', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	const popup = host.querySelector<HTMLElement>('._popup')!;
	const buttons = popup.querySelectorAll('button');
	expect(buttons).toHaveLength(count);
	expect(getComputedStyle(popup).padding).toBe('18px');
	expect(popup.getBoundingClientRect().height).toBeLessThanOrEqual(560);
	if (count === 8 && width === 1000) expect(popup.getBoundingClientRect().height).toBeLessThan(240);
	for (const button of buttons) {
		expect(getComputedStyle(button).color).toBe('rgb(121, 131, 144)');
		expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(80);
		for (const child of button.children) {
			expect(child.getBoundingClientRect().top).toBeGreaterThanOrEqual(button.getBoundingClientRect().top);
			expect(child.getBoundingClientRect().bottom).toBeLessThanOrEqual(button.getBoundingClientRect().bottom);
		}
	}
	await page.screenshot({ element: popup, path: `../e2e/artifacts/component-browser/more-menu-${width}-${count}.png` });
});
