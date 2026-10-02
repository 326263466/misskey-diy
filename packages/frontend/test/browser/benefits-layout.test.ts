/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App, Component, PropType } from 'vue';
import type { entities } from 'misskey-js';
import type { Locale } from 'i18n';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import Benefits from '@/pages/benefits.vue';
import AdminBenefits from '@/pages/admin/benefits.vue';
import PageWithHeader from '@/components/global/PageWithHeader.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), publish: vi.fn(), user: { id: 'member', username: 'community_member', name: '每天记录一点美好的社区成员', host: null } }));
vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
	vi.stubGlobal('_DEV_', false);
});
vi.mock('misskey-js', () => ({}));
vi.mock('@/i.js', () => ({ $i: mocks.user, ensureSignin: () => mocks.user }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/composables/use-checkin-status.js', () => ({ publishCheckinStatus: mocks.publish }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api, misskeyApiGet: mocks.api }));
vi.mock('@/os.js', () => ({ popup: vi.fn(), toast: vi.fn(), alert: vi.fn(), confirm: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ useListener: vi.fn() }) }));
vi.mock('@/composables/use-scroll-position-keeper.js', () => ({ useScrollPositionKeeper: vi.fn() }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@@/js/config.js', () => ({ lang: 'zh-CN', langs: [], url: 'https://example.invalid', host: 'example.invalid', version: 'test' }));
vi.mock('@/components/MkMiniChart.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class {} }));
vi.mock('@/filters/user.js', () => ({ acct: (user: { username: string }) => user.username }));
vi.mock('@/i18n.js', async () => {
	const { I18n } = await import('@@/js/i18n.js');
	const { version } = await import('../../../../package.json');
	const locales = import.meta.glob<Locale>('../../../../built/_frontend_dist_/locales/zh-CN.*.json', { eager: true, import: 'default' });
	let current = new I18n<Locale>(locales[`../../../../built/_frontend_dist_/locales/zh-CN.${version}.json`]);
	// Changing a fixture language represents a fresh page load, including formatted translations.
	return { i18n: {
		get locale() { return current.locale; },
		set locale(value: Locale) { current = new I18n<Locale>(value); },
		get ts() { return current.ts; },
		get tsx() { return current.tsx; },
		get t() { return current.t; },
	} };
});

const redemptionCode = {
	id: 'community-gift', name: '社区周年庆每日签到福利补签卡领取活动', code: '0123456789ABCDEF0123456789ABCDEF',
	amount: 5, maxRedemptions: 1000000, redemptions: 12345, enabled: true, expiresAt: null,
	createdAt: '2026-09-29T04:15:00Z',
};
let balance = 12345;
let app: App | undefined;
let host: HTMLElement | undefined;
let originalStyle = '';
const defaultLocale = i18n.locale;

beforeEach(() => {
	balance = 12345;
	vi.clearAllMocks();
	i18n.locale = defaultLocale;
	originalStyle = document.documentElement.style.cssText;
	mocks.api.mockImplementation(async (endpoint: string, params: { type?: string } = {}) => {
		if (endpoint === 'i/checkin-status') return { makeupCards: balance, points: 28, today: '2026-09-29', timeZone: 'Asia/Shanghai', checkedInToday: true };
		if (endpoint === 'i/checkin-redeem') { balance += 5; return { makeupCards: balance, points: 28, amount: 5, newlyRedeemed: true }; }
		if (endpoint === 'i/checkin-history') return { total: 23, items: ['admin', 'redemption', 'exchange', 'reward'].map((source, index) => ({ id: `${params.type}-${index}`, createdAt: '2026-09-29T04:15:00Z', source, amount: 5, remaining: 3, used: 1, revoked: 1, date: '2026-09-28', pointsSpent: source === 'exchange' ? 35 : null })) };
		if (endpoint === 'admin/checkin/stats') return { grantedCards: 12500, grantCount: 360, grantedUsers: 208, usedCards: 4900, usedUsers: 186, exchangedCards: 520, availableCards: 8120 };
		if (endpoint === 'admin/checkin/history') return { total: 0, items: [] };
		if (endpoint === 'admin/checkin/codes/list') return { total: 21, items: [redemptionCode] };
		if (endpoint === 'admin/checkin/codes/claims') return { total: 21, items: [{ id: 'claim-1', user: mocks.user, amount: 5, createdAt: '2026-09-29T04:15:00Z' }] };
		throw new Error(`Unexpected endpoint ${endpoint}`);
	});
});

afterEach(() => {
	app?.unmount();
	host?.remove();
	document.documentElement.style.cssText = originalStyle;
});

async function mount(component: Component, width: number, dark: boolean, scrollLayout?: 'admin' | 'personal') {
	await page.viewport(width, 1000);
	document.documentElement.style.cssText = '--MI_THEME-accent:#2686ff;--MI_THEME-accentedBg:#2686ff20;--MI_THEME-link:#2686ff;--MI_THEME-fgOnAccent:#fff;--MI_THEME-buttonBg:#8882;--MI_THEME-buttonHoverBg:#8883;--MI_THEME-focus:#2686ff;--MI_THEME-inputBorder:#8888;--MI_THEME-inputBorderHover:#2686ff;';
	for (const [key, value] of Object.entries({
		bg: dark ? '#232323' : '#f2f3f5', panel: dark ? '#2d2d2d' : '#fff', fg: dark ? '#c7d1d8' : '#35404a',
		fgTransparentWeak: dark ? '#c7d1d8b3' : '#676767b3', divider: dark ? '#ffffff24' : '#e8e8e8',
	})) document.documentElement.style.setProperty(`--MI_THEME-${key}`, value);
	host = document.createElement('div');
	host.style.cssText = 'background:var(--MI_THEME-bg);height:100vh;';
	document.body.append(host);
	if (scrollLayout) host.style.cssText += 'height:720px;min-height:0;display:flex;flex-direction:column;overflow:clip;';
	app = scrollLayout ? createApp({ render: () => [
		h('header', { 'data-testid': 'site-header', style: 'height:64px;flex-shrink:0;background:var(--MI_THEME-panel);' }, 'Site navigation'),
		h('div', { style: 'flex:1;min-height:0;' }, scrollLayout === 'admin'
			? h('div', { class: '_pageLayout _pageLayoutWithSidebar' }, [
				h('nav', { class: '_pageNavigation', 'aria-label': i18n.ts.controlPanel }, h('div', { style: 'height:1200px;' }, i18n.ts._benefits.adminTitle)),
				h('div', { class: '_pageContent _pageContainer' }, h(component)),
			])
			: h(component)),
	] }) : createApp(component);
	// PageWithHeader normally supplies the query container through its scroll surface.
	app.component('PageWithHeader', scrollLayout ? PageWithHeader : defineComponent({ setup: (_, { slots }) => () => h('div', { style: 'height:100%;overflow:auto;container-type:inline-size;' }, slots.default?.()) }));
	app.component('MkPageHeader', MkPageHeader);
	app.component('MkStickyContainer', MkStickyContainer);
	app.provide(DI.pageMetadata, ref({ title: i18n.ts._benefits.adminTitle, icon: 'ti ti-gift' }));
	app.component('MkA', defineComponent({ props: { to: String }, setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) }));
	app.component('MkUserName', defineComponent({ props: { user: { type: Object as PropType<entities.UserLite>, required: true } }, setup: props => () => h('span', props.user.name ?? props.user.username) }));
	app.component('MkAvatar', { render: () => h('span', { style: 'border-radius:50%;background:var(--MI_THEME-accentedBg);' }) });
	app.component('MkTime', defineComponent({ props: { time: String }, setup: props => () => h('time', { datetime: props.time }, '2026/9/29 12:15') }));
	app.component('MkLoading', { render: () => h('span', i18n.ts.loading) });
	app.directive('adaptive-bg', () => {});
	app.directive('adaptive-border', () => {});
	app.directive('tooltip', () => {});
	app.mount(host);
	await document.fonts.ready;
	await nextTick();
}

function expectPageFit(width: number) {
	expect(host!.scrollWidth, 'page width').toBeLessThanOrEqual(width);
	for (const section of host!.querySelectorAll('section, nav')) {
		if (section.getClientRects().length === 0) continue;
		const bounds = section.getBoundingClientRect();
		expect(bounds.left, section.getAttribute('aria-label') ?? 'section left').toBeGreaterThanOrEqual(0);
		expect(bounds.right, section.getAttribute('aria-label') ?? 'section right').toBeLessThanOrEqual(width);
	}
	for (const table of host!.querySelectorAll('table')) {
		if (table.getClientRects().length === 0) continue;
		const scroller = table.parentElement!;
		expect(getComputedStyle(scroller).overflowX).toBe('auto');
		expect(scroller.getBoundingClientRect().right).toBeLessThanOrEqual(width);
	}
}

async function screenshot(name: string, width: number, dark: boolean) {
	await page.viewport(width, Math.ceil(host!.getBoundingClientRect().height));
	await page.screenshot({ element: host!, path: `../e2e/artifacts/component-browser/${name}-${width}-${dark ? 'dark' : 'light'}.png` });
}

const layouts = [1280, 390, 320].flatMap(width => [false, true].map(dark => ({ width, dark })));

test.each(layouts)('personal benefits fit $width px (dark: $dark)', async ({ width, dark }) => {
	await mount(Benefits, width, dark);
	await expect.element(page.getByTestId('benefits-balance')).toHaveTextContent('12,345');
	await expect.element(page.getByTestId('benefits-history')).toBeVisible();
	expect(host!.querySelector('nav a.active')?.getAttribute('href')).toBe('/my/benefits');
	expect(host!.querySelector('nav a.active')?.textContent).toContain(i18n.ts._benefits.title);
	await expect.element(page.getByRole('link', { name: new RegExp(i18n.ts._benefits.useCards) })).toHaveAttribute('href', '/checkin');
	await expect.element(page.getByTestId('benefits-points')).toHaveTextContent('28');
	expectPageFit(width);
	const wallet = host!.querySelector('[data-testid="benefits-balance"]')!.closest('section')!;
	expect(getComputedStyle(wallet).padding).toBe('18px');
	expect(getComputedStyle(wallet).backgroundColor).toBe(dark ? 'rgb(45, 45, 45)' : 'rgb(255, 255, 255)');
	expect(getComputedStyle(host!.querySelector('header')!).padding).toBe('18px');
	await page.getByRole('textbox', { name: i18n.ts._checkin._codes.code, exact: true }).fill('invalid-code');
	await page.getByRole('button', { name: i18n.ts._benefits.redeem, exact: true }).click();
	await expect.element(page.getByRole('alert')).toHaveTextContent(i18n.ts._benefits.invalidCodeFormat);
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/checkin-redeem')).toBe(false);
	await page.getByRole('textbox', { name: i18n.ts._checkin._codes.code, exact: true }).fill(redemptionCode.code);
	await page.getByRole('button', { name: i18n.ts._benefits.redeem, exact: true }).click();
	await expect.element(page.getByTestId('benefits-balance')).toHaveTextContent('12,350');
	await expect.element(page.getByRole('status')).toHaveTextContent(i18n.tsx._benefits.redeemSucceeded({ amount: 5 }));
	expect(mocks.api).toHaveBeenCalledWith('i/checkin-redeem', { code: redemptionCode.code });
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint.startsWith('admin/'))).toBe(false);
	expectPageFit(width);
	await screenshot('benefits', width, dark);
	for (const label of [i18n.ts._checkin._history.sourceExchange, i18n.ts._checkin._history.use]) {
		await page.getByRole('button', { name: label, exact: true }).click();
		await expect.element(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByTestId('benefits-history')).toBeVisible();
		expectPageFit(width);
	}
});

test.each(layouts)('administrator redemption codes fit $width px (dark: $dark)', async ({ width, dark }) => {
	await mount(AdminBenefits, width, dark);
	await page.getByRole('button', { name: i18n.ts._benefits.redemptionCodes, exact: true }).click();
	await expect.element(page.getByTestId(`benefit-code-${redemptionCode.id}`)).toBeVisible();
	await expect.element(page.getByRole('button', { name: i18n.ts._benefits.redemptionCodes, exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect.element(page.getByRole('button', { name: i18n.ts._benefits.redemptionCodes, exact: true })).toHaveAccessibleDescription(i18n.ts._benefits.redemptionDescription);
	expectPageFit(width);
	await expect.element(page.getByRole('textbox', { name: i18n.ts._benefits.codeName, exact: true })).not.toBeInTheDocument();
	await screenshot('benefits-admin-list', width, dark);
	await page.getByRole('button', { name: i18n.ts._benefits.createCode, exact: true }).click();
	await expect.element(page.getByRole('textbox', { name: i18n.ts._benefits.codeName, exact: true })).toHaveFocus();
	await page.getByRole('textbox', { name: i18n.ts._benefits.codeName, exact: true }).fill(redemptionCode.name);
	await page.getByRole('checkbox', { name: i18n.ts.noExpirationDate, exact: true }).click();
	await expect.element(page.getByLabelText(i18n.ts.expirationDate, { exact: true })).toBeVisible();
	await expect.element(page.getByLabelText(i18n.ts.expirationDate, { exact: true })).toHaveAttribute('readonly');
	await expect.element(page.getByRole('button', { name: i18n.ts._benefits.createCode, exact: true })).toBeDisabled();
	expectPageFit(width);
	await screenshot('benefits-admin-create', width, dark);
	await page.getByRole('button', { name: i18n.ts.cancel, exact: true }).click();
	await expect.element(page.getByRole('button', { name: i18n.ts._benefits.createCode, exact: true })).toHaveFocus();
	await page.getByRole('button', { name: i18n.tsx._benefits.claimsTitle({ name: redemptionCode.name }), exact: true }).click();
	await expect.element(page.getByRole('link', { name: `@${mocks.user.username}`, exact: true })).toBeVisible();
	expectPageFit(width);
	await screenshot('benefits-admin-codes', width, dark);
	await page.getByRole('button', { name: i18n.ts.close, exact: true }).click();
	await expect.element(page.getByRole('button', { name: i18n.tsx._benefits.claimsTitle({ name: redemptionCode.name }), exact: true })).toHaveFocus();
});

test.each(['en-US', 'ja-JP'])('administrator descriptions fit a narrow screen in %s', async language => {
	const { version } = await import('../../../../package.json');
	const locales = import.meta.glob<Locale>([
		'../../../../built/_frontend_dist_/locales/en-US.*.json',
		'../../../../built/_frontend_dist_/locales/ja-JP.*.json',
	], { eager: true, import: 'default' });
	i18n.locale = locales[`../../../../built/_frontend_dist_/locales/${language}.${version}.json`];
	await mount(AdminBenefits, 320, false);
	await page.getByRole('button', { name: i18n.ts._benefits.redemptionCodes, exact: true }).click();
	await expect.element(page.getByTestId(`benefit-code-${redemptionCode.id}`)).toBeVisible();
	await expect.element(page.getByRole('button', { name: i18n.ts._benefits.redemptionCodes, exact: true })).toHaveAccessibleDescription(i18n.ts._benefits.redemptionDescription);
	expectPageFit(320);
	await page.getByRole('button', { name: i18n.ts._benefits.createCode, exact: true }).click();
	await expect.element(page.getByRole('textbox', { name: i18n.ts._benefits.codeName, exact: true })).toHaveFocus();
	expectPageFit(320);
	await screenshot(`benefits-admin-${language}`, 320, false);
});

test.each([12, 28])('keeps administrative benefits content below its stationary page header with a %i px gap while scrolling', async gap => {
	await mount(AdminBenefits, 1280, false, 'admin');
	host!.style.setProperty('--MI-pageGap', `${gap}px`);
	await page.getByRole('button', { name: i18n.ts._benefits.redemptionCodes, exact: true }).click();
	await page.getByRole('button', { name: i18n.ts._benefits.createCode, exact: true }).click();
	const scroller = host!.querySelector<HTMLElement>('._pageScrollable')!;
	const header = host!.querySelector<HTMLElement>('[data-page-header]')!;
	for (const top of [150, 300]) {
		scroller.scrollTop = top;
		await nextTick();
		await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		const box = header.getBoundingClientRect();
		expect(scroller.scrollTop).toBeGreaterThan(0);
		expect(box.top).toBeCloseTo(scroller.getBoundingClientRect().top, 1);
		expect(box.top - host!.querySelector('[data-testid="site-header"]')!.getBoundingClientRect().bottom).toBeCloseTo(gap, 1);
		const above = document.elementFromPoint(box.left + box.width / 2, box.top - 2);
		expect(above?.closest('[data-page-body]')).toBeNull();
		const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 2);
		expect(header.contains(hit)).toBe(true);
		await page.screenshot({ element: host!, path: `../e2e/artifacts/component-browser/benefits-admin-scroll-gap-${gap}-${top}.png` });
	}
});

test('clips personal benefits at its real scrollport and keeps the community navigation below the site header', async () => {
	await mount(Benefits, 1280, false, 'personal');
	await expect.element(page.getByTestId('benefits-history')).toBeVisible();
	const scroller = host!.querySelector<HTMLElement>('._pageScrollable')!;
	const navigation = host!.querySelector<HTMLElement>('._pageNavigation')!;
	const siteHeader = host!.querySelector<HTMLElement>('[data-testid="site-header"]')!;
	for (const top of [150, 300]) {
		scroller.scrollTop = top;
		await nextTick();
		await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		expect(scroller.scrollTop).toBeGreaterThan(0);
		expect(scroller.getBoundingClientRect().top).toBeCloseTo(siteHeader.getBoundingClientRect().bottom + 18, 1);
		expect(navigation.getBoundingClientRect().top).toBeCloseTo(scroller.getBoundingClientRect().top, 1);
		const hit = document.elementFromPoint(scroller.getBoundingClientRect().left + scroller.clientWidth / 2, siteHeader.getBoundingClientRect().bottom - 2);
		expect(scroller.contains(hit)).toBe(false);
	}
	await page.screenshot({ element: host!, path: '../e2e/artifacts/component-browser/benefits-personal-scroll.png' });
});
