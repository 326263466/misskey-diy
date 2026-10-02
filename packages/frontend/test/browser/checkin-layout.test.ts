/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue';
import type { App, Component, PropType } from 'vue';
import type { entities } from 'misskey-js';
import type { Locale } from '../../../i18n/src/autogen/locale.js';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import Checkin from '@/pages/checkin.vue';
import I18n from '@/components/global/I18n.vue';
import CommunityRanking from '@/pages/community-ranking.vue';
import { i18n } from '@/i18n.js';
import { hotkeyDirective } from '@/directives/hotkey.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	popup: vi.fn(),
	account: { id: 'self', username: 'community_member', name: '每天记录一点美好', createdAt: '2023-01-01T00:00:00Z' },
}));
vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
	vi.stubGlobal('_DEV_', false);
	localStorage.setItem('lang', 'zh-CN');
});
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ $i: mocks.account, ensureSignin: () => mocks.account }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
// The community sidebar has no search input; avoid unrelated editor/router dependencies.
vi.mock('@/components/MkInput.vue', () => ({ default: { render: () => null } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ getCurrentPath: () => '/checkin' }) }));
vi.mock('@/os.js', () => ({ alert: vi.fn(), confirm: vi.fn().mockResolvedValue({ canceled: false }), popup: mocks.popup, claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@@/js/intl-const.js', () => ({ versatileLang: 'zh-CN' }));
vi.mock('@@/js/config.js', () => ({ lang: 'zh-CN', langs: [], url: 'https://example.invalid', host: 'example.invalid', version: 'test' }));
vi.mock('@/filters/user.js', () => ({ userPage: (user: { username: string }) => `/@${user.username}` }));
vi.mock('@/i18n.js', async () => {
	const { I18n } = await import('@@/js/i18n.js');
	const { version } = await import('../../../../package.json');
	const locales = import.meta.glob<Locale>('../../../../built/_frontend_dist_/locales/zh-CN.*.json', { eager: true, import: 'default' });
	const locale = locales[`../../../../built/_frontend_dist_/locales/zh-CN.${version}.json`];
	if (!locale?._checkin) throw new Error('Build the frontend locales before running check-in layout tests.');
	return { i18n: new I18n<Locale>(locale) };
});
// The follow control keeps its icon/text structure and footprint without opening a stream.
vi.mock('@/components/MkFollowButton.vue', async () => {
	const { h } = await import('vue');
	const { i18n } = await import('@/i18n.js');
	return { default: { render: () => h('button', {
		type: 'button', class: '_button', 'aria-label': i18n.ts.follow,
		style: 'display:inline-flex;align-items:center;justify-content:center;height:31px;border-radius:32px;font-weight:bold;color:var(--MI_THEME-fg);background:var(--MI_THEME-buttonBg);',
	}, [h('span', { style: 'margin-right:6px;' }, i18n.ts.follow), h('i', { class: 'ti ti-plus', 'aria-hidden': 'true' })]) } };
});

type FixtureUser = { id: string; username: string; name: string };
const userNames = ['星河旅人', '猫与咖啡', '一位喜欢记录社区日常并且拥有很长很长昵称的朋友', '夏日来信', '每天记录一点美好', '青山', '风铃', '纸飞机', '月光下的散步者', '小小世界'];
const scenarios = [1280, 390, 320].flatMap(width => [false, true].map(dark => ({ width, height: width > 800 ? 1000 : 844, dark })));
let app: App | undefined;
let host: HTMLElement | undefined;
let originalHtmlStyle = '';
let originalBodyStyle = '';
const popup = shallowRef<{ component: Component; props: Record<string, unknown>; closed: () => void } | null>(null);

function status(month = '2026-09', checkedInToday = false): entities.ICheckinStatusResponse {
	return {
		timeZone: 'Asia/Shanghai', today: '2026-09-28', month, checkedInToday,
		totalDays: checkedInToday ? 41 : 40, consecutiveDays: checkedInToday ? 8 : 7, monthlyDays: checkedInToday ? 19 : 18,
		lastCheckinDate: checkedInToday ? '2026-09-28' : '2026-09-27',
		points: checkedInToday ? 41 : 40, makeupCards: 2, makeupDates: [], registeredDate: '2023-01-01',
		makeupCardProgress: checkedInToday ? 0 : 6, makeupCardTarget: checkedInToday ? 30 : 7, makeupCardFirstRewardClaimed: checkedInToday, rewardDates: checkedInToday && month === '2026-09' ? ['2026-09-28'] : [], makeupCardExchangeCost: 60, makeupCardLimit: 3, makeupCardExchangeAvailable: true, makeupEarliestDate: '2026-09-21',
		checkedInDates: month === '2026-09' ? [1, 2, 3, 5, 6, 8, 10, 11, 13, 15, 18, 21, 22, 23, 25, 26, 27, ...(checkedInToday ? [28] : [])].map(day => `2026-09-${String(day).padStart(2, '0')}`) : [`${month}-03`, `${month}-15`],
		achievements: (['checkin1', 'checkinStreak7', 'checkinTotal30'] as const).map(name => ({ name, unlockedAt: 1 })),
	};
}

function ranking(type: string) {
	return {
		type, timeZone: 'Asia/Shanghai', today: '2026-09-28', month: '2026-09',
		myRank: { rank: 5, days: 7 },
		items: userNames.map((name, index) => ({
			rank: index + 1, days: type === 'total' ? 365 - index * 30 : type === 'monthly' ? 28 - index * 2 : 64 - index * 6,
			user: { id: index === 4 ? 'self' : `member-${index}`, username: `member_${index}`, name },
		})),
	};
}

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function mount(component: Component, width: number, height: number, dark: boolean) {
	await page.viewport(width, height);
	document.documentElement.style.cssText = '--MI_THEME-accent:#86b300;--MI_THEME-accentedBg:#86b30026;--MI_THEME-link:#2686ff;--MI_THEME-warn:#ff9800;--MI_THEME-fgOnAccent:#fff;--MI_THEME-buttonBg:#8882;--MI_THEME-buttonHoverBg:#8883;--MI_THEME-focus:#86b300;--MI_THEME-error:#ec4137;--MI_THEME-scrollbarHandle:#8884;';
	document.documentElement.style.setProperty('--MI_THEME-bg', dark ? '#232323' : '#f2f3f5');
	document.documentElement.style.setProperty('--MI_THEME-panel', dark ? '#2d2d2d' : '#fff');
	document.documentElement.style.setProperty('--MI_THEME-fg', dark ? '#c7d1d8' : '#676767');
	document.documentElement.style.setProperty('--MI_THEME-fgTransparentWeak', dark ? '#c7d1d8b3' : '#676767b3');
	document.documentElement.style.setProperty('--MI_THEME-divider', dark ? '#ffffff24' : '#e8e8e8');
	document.documentElement.style.setProperty('--MI_THEME-infoWarnFg', dark ? '#ffbd3e' : '#8f6e31');
	document.body.style.overflow = 'visible';
	host = document.createElement('div');
	host.style.cssText = `container-type:inline-size;height:${height}px;background:var(--MI_THEME-bg);`;
	document.body.append(host);
	app = createApp({ render: () => [h(component), popup.value ? h(popup.value.component, { ...popup.value.props, onClosed: popup.value.closed }) : null] });
	app.component('I18n', I18n); // eslint-disable-line vue/multi-word-component-names -- The application registers this global component with the same name.
	app.directive('hotkey', hotkeyDirective);
	app.component('PageWithHeader', defineComponent({ setup: (_, { slots }) => () => h('div', { 'data-page-body': '', style: 'height:100%;overflow:auto;container-type:size;' }, slots.default?.()) }));
	app.component('MkA', defineComponent({ props: { to: { type: String, required: true } }, setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) }));
	app.component('MkUserName', defineComponent({ props: { user: { type: Object as PropType<FixtureUser>, required: true } }, setup: props => () => h('span', props.user.name) }));
	app.component('MkAvatar', defineComponent({ props: { user: { type: Object as PropType<FixtureUser>, required: true } }, setup: props => () => h('span', {
		'aria-hidden': 'true', style: 'display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--MI_THEME-accentedBg);color:var(--MI_THEME-accent);font-weight:bold;',
	}, props.user.name.slice(0, 1)) }));
	app.component('MkLoading', { render: () => h('span', i18n.ts.loading) });
	app.mount(host);
	await document.fonts.ready;
	await settle();
}

function expectHorizontalFit(width: number) {
	const sidebar = host!.querySelector<HTMLElement>('._pageNavigation')!;
	const hub = sidebar.parentElement!;
	const main = hub.querySelector<HTMLElement>('._pageContent')!;
	expect(host!.scrollWidth).toBeLessThanOrEqual(host!.clientWidth + 1);
	expect(hub.scrollWidth).toBeLessThanOrEqual(hub.clientWidth + 1);
	expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth + 1);
	for (const element of host!.querySelectorAll<HTMLElement>('._pageNavigation, ._pageContent, section, button, a, table, td, progress, [data-checkin-date]')) {
		const box = element.getBoundingClientRect();
		expect(box.left, `${element.tagName}: ${element.textContent}`).toBeGreaterThanOrEqual(0);
		expect(box.right, `${element.tagName}: ${element.textContent}`).toBeLessThanOrEqual(width + 1);
	}
	if (width > 800) {
		expect(sidebar.getBoundingClientRect().top - host!.getBoundingClientRect().top).toBe(18);
		expect(main.getBoundingClientRect().top).toBe(sidebar.getBoundingClientRect().top);
		expect(sidebar.getBoundingClientRect().right).toBeLessThan(main.getBoundingClientRect().left);
		expect(main.getBoundingClientRect().width).toBeGreaterThan(700);
	} else {
		expect(sidebar.getBoundingClientRect().bottom).toBeLessThan(main.getBoundingClientRect().top);
		expect(main.getBoundingClientRect().width).toBeGreaterThan(width - 60);
	}
}

async function screenshot(path: string, width: number, height: number) {
	// Browser-mode tests run inside an iframe, which clips element captures below its viewport.
	await page.viewport(width, Math.ceil(host!.getBoundingClientRect().height));
	await settle();
	await page.screenshot({ element: host!, path: `../e2e/artifacts/component-browser/${path}.png` });
	await page.viewport(width, height);
	await settle();
}

beforeEach(() => {
	popup.value = null;
	mocks.popup.mockImplementation((component: Component, props: Record<string, unknown>, events: { closed: () => void }) => {
		popup.value = { component, props, closed: events.closed };
		return { dispose: () => { popup.value = null; } };
	});
	originalHtmlStyle = document.documentElement.style.cssText;
	originalBodyStyle = document.body.style.cssText;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-28T02:30:00Z'));
	mocks.api.mockImplementation(async (endpoint: string, params: { month?: string; type?: string } = {}) => {
		if (endpoint === 'i/checkin-status') return status(params.month);
		if (endpoint === 'i/checkin') return { ...status('2026-09', true), newlyCheckedIn: true, earnedPoints: 1, earnedMakeupCards: 0, earnedAchievements: [] };
		if (endpoint === 'checkin/ranking') return ranking(params.type ?? 'consecutive');
		throw new Error(`Unexpected endpoint: ${endpoint}`);
	});
});

afterEach(async () => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
	document.documentElement.style.cssText = originalHtmlStyle;
	document.body.style.cssText = originalBodyStyle;
	vi.useRealTimers();
	vi.clearAllMocks();
	await settle();
});

afterAll(() => vi.unstubAllGlobals());

test.each([1280, 390])('uses the same error and retry typography on both community pages at %i px', async width => {
	mocks.api.mockRejectedValue(new Error('HTTP 500'));
	const typography: string[][] = [];
	for (const component of [Checkin, CommunityRanking]) {
		await mount(component, width, 900, false);
		await expect.element(page.getByRole('alert')).toBeVisible();
		const alert = host!.querySelector<HTMLElement>('[role="alert"]')!;
		const retry = alert.querySelector('button')!;
		for (const size of ['14px', '16px']) {
			document.documentElement.style.fontSize = size;
			await settle();
			const textStyle = getComputedStyle(alert);
			const buttonStyle = getComputedStyle(retry);
			expect(textStyle.fontSize).toBe(size);
			expect(buttonStyle.fontSize).toBe(size);
			expect(buttonStyle.lineHeight).toBe(textStyle.lineHeight);
			typography.push([textStyle.fontSize, textStyle.lineHeight, textStyle.fontWeight]);
		}
		app!.unmount();
		host!.remove();
		app = undefined;
		host = undefined;
	}
	expect(typography.slice(0, 2)).toEqual(typography.slice(2));
});

test.each(scenarios)('check-in layout at $width px (dark: $dark)', async ({ width, height, dark }) => {
	await mount(Checkin, width, height, dark);
	await expect.element(page.getByTestId('checkin-calendar')).toBeVisible();
	expect(host!.querySelectorAll('[data-checkin-date]')).toHaveLength(30);
	expect(host!.querySelectorAll('article')).toHaveLength(6);
	expect(host!.querySelector('nav .active')?.textContent).toContain(i18n.ts._checkin.dailyCheckin);
	expectHorizontalFit(width);
	const calendar = host!.querySelector<HTMLElement>('[data-testid="checkin-calendar"]')!;
	expect(getComputedStyle(calendar).gridTemplateColumns.split(' ')).toHaveLength(7);
	const firstDay = host!.querySelector<HTMLElement>('[data-checkin-date="2026-09-01"]')!;
	expect(firstDay.getBoundingClientRect().width).toBeGreaterThan(30);
	const missedDay = host!.querySelector<HTMLElement>('[data-checkin-date="2026-09-24"]')!;
	const today = host!.querySelector<HTMLElement>('[data-checkin-date="2026-09-28"]')!;
	const future = host!.querySelector<HTMLElement>('[data-checkin-date="2026-09-30"]')!;
	expect(firstDay.dataset.dayState).toBe('completed');
	expect(missedDay.querySelector('[data-date-select]')).not.toBeNull();
	expect(missedDay.textContent).toContain(i18n.ts._checkin.pendingMakeup);
	expect(today.dataset.dayState).toBe('pending');
	expect(today.querySelector('[data-card-reward="expected"]')).not.toBeNull();
	expect(today.querySelector('.ti-sun')).not.toBeNull();
	expect(firstDay.querySelector('.ti-circle-check-filled')).not.toBeNull();
	const card = host!.querySelector('section._panel')!;
	expect(getComputedStyle(card.children[1]).padding).toBe('18px');
	for (const milestone of host!.querySelectorAll('article')) expect(getComputedStyle(milestone).padding).toBe('18px');
	expect(future.dataset.dayState).toBe('future');
	expect(getComputedStyle(future.querySelector('time')!).color).not.toBe(getComputedStyle(missedDay.querySelector('time')!).color);
	expect(host!.querySelectorAll('[data-testid="checkin-makeup-cards"]')).toHaveLength(1);
	const cards = host!.querySelector<HTMLElement>('[data-testid="checkin-makeup-cards"]')!;
	expect(cards.getBoundingClientRect().top).toBeLessThan(calendar.getBoundingClientRect().top);
	await screenshot(`checkin-${width}-${dark ? 'dark' : 'light'}`, width, height);
	const button = host!.querySelector<HTMLElement>('[data-testid="checkin-submit"]')!;
	expect(button.querySelector('i')).toBeNull();
	const uncheckedBackground = getComputedStyle(button).backgroundColor;
	await page.getByTestId('checkin-submit').click();
	await expect.element(page.getByTestId('checkin-submit')).toHaveTextContent(i18n.ts._checkin.checkedIn);
	await expect.element(page.getByTestId('checkin-submit')).toBeEnabled();
	await expect.element(page.getByRole('dialog', { name: i18n.ts._checkin.successTitle })).toBeVisible();
	const dialog = host!.querySelector<HTMLElement>('[role="dialog"]')!;
	const box = dialog.getBoundingClientRect();
	expect(box.left).toBeGreaterThanOrEqual(16);
	expect(box.right).toBeLessThanOrEqual(width - 16);
	expect(Math.abs(box.left + box.width / 2 - width / 2)).toBeLessThan(1);
	expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
	expect(dialog.textContent).toContain(i18n.tsx._checkin.successReward({ n: '+1' }));
	expect(getComputedStyle(button).backgroundColor).not.toBe(uncheckedBackground);
	expect(button.querySelector('.ti-diamond-filled')).toBeNull();
	await page.screenshot({ element: dialog, path: `../e2e/artifacts/component-browser/checkin-success-${width}-${dark ? 'dark' : 'light'}.png` });
	await page.getByRole('button', { name: i18n.ts.ok, exact: true }).click();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	expect(document.activeElement).toBe(button);
	await page.getByTestId('checkin-submit').click();
	await expect.element(page.getByRole('dialog')).toBeVisible();
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'i/checkin')).toHaveLength(1);
	await page.getByRole('button', { name: i18n.ts.close, exact: true }).click();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	expect(host!.querySelector<HTMLElement>('[aria-current="date"]')!.dataset.dayState).toBe('completed');
	expect(host!.querySelector('[aria-current="date"] [data-card-reward="received"]')).not.toBeNull();
	expectHorizontalFit(width);
	await page.getByRole('button', { name: i18n.ts._checkin.previousMonth }).click();
	await expect.element(page.getByTestId('checkin-month')).toHaveTextContent('2026年8月');
	expectHorizontalFit(width);
});

test.each([1280, 390, 320].flatMap(width => [false, true].map(dark => ({ width, dark }))))('reward calendar updates and fits at $width px (dark: $dark)', async ({ width, dark }) => {
	const current = (checked = false) => ({ ...status('2026-09', checked), makeupDates: ['2026-09-13'], checkedInDates: status('2026-09', checked).checkedInDates.filter(date => date !== '2026-09-21').concat('2026-09-24') });
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'i/checkin-status') return current();
		if (endpoint === 'i/checkin') return { ...current(true), newlyCheckedIn: true, earnedPoints: 1, earnedMakeupCards: 1, earnedAchievements: [] };
		throw new Error(`Unexpected endpoint: ${endpoint}`);
	});
	await mount(Checkin, width, 1000, dark);
	// The app supplies a definite height for the independently scrolling page layout.
	host!.style.height = '1000px';
	host!.querySelector<HTMLElement>('[data-page-body]')!.style.overflow = 'auto';
	await settle();
	await expect.element(page.getByTestId('checkin-calendar')).toBeVisible();
	const calendar = host!.querySelector<HTMLElement>('[data-testid="checkin-calendar"]')!;
	const today = calendar.querySelector<HTMLElement>('[data-checkin-date="2026-09-28"]')!;
	expect(today.querySelector('[data-card-reward="expected"]')).not.toBeNull();
	for (const state of ['pending', 'completed', 'madeUp', 'missed', 'expired', 'future']) expect(calendar.querySelector(`[data-day-state="${state}"]`)).not.toBeNull();
	for (const cell of calendar.querySelectorAll<HTMLElement>('[data-checkin-date]')) {
		expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth + 1);
		const badge = cell.querySelector<HTMLElement>('[data-card-reward]');
		if (badge) expect(badge.getBoundingClientRect().right).toBeLessThanOrEqual(cell.getBoundingClientRect().right);
	}
	expect(calendar.scrollWidth).toBeLessThanOrEqual(calendar.clientWidth + 1);
	calendar.scrollIntoView({ block: 'center' });
	await settle();
	await page.screenshot({ element: calendar.parentElement!, path: `../e2e/artifacts/component-browser/checkin-redesign-${width}-${dark ? 'dark' : 'light'}.png` });
	await page.getByTestId('checkin-submit').click();
	await expect.element(page.getByTestId('checkin-submit')).toHaveTextContent(i18n.ts._checkin.checkedIn);
	expect(today.querySelector('[data-card-reward="received"]')).not.toBeNull();
	expect(today.querySelector('[data-card-reward="expected"]')).toBeNull();
});

test.each(scenarios)('community ranking layout at $width px (dark: $dark)', async ({ width, height, dark }) => {
	await mount(CommunityRanking, width, height, dark);
	await expect.element(page.getByRole('table')).toBeVisible();
	expect(host!.querySelectorAll('tbody tr')).toHaveLength(10);
	expect(host!.querySelector('nav .active')?.textContent).toContain(i18n.ts.communityRanking);
	expectHorizontalFit(width);
	const longName = page.getByText(userNames[2], { exact: true });
	await expect.element(longName).toBeVisible();
	const nameLink = [...host!.querySelectorAll<HTMLElement>('tbody a')].find(link => link.textContent === userNames[2])!;
	expect(getComputedStyle(nameLink).textOverflow).toBe('ellipsis');
	expect(nameLink.clientWidth).toBeGreaterThan(12);
	if (width <= 800) expect(nameLink.scrollWidth).toBeGreaterThan(nameLink.clientWidth);
	await screenshot(`ranking-${width}-${dark ? 'dark' : 'light'}`, width, height);
	for (const title of [i18n.ts._checkin.totalRanking, i18n.ts._checkin.monthlyRanking]) {
		await page.getByRole('button', { name: title, exact: true }).click();
		await expect.element(page.getByRole('button', { name: title, exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('table')).toBeVisible();
		expectHorizontalFit(width);
	}
	expect(mocks.api.mock.calls.every(([endpoint]) => endpoint === 'checkin/ranking' || endpoint === 'i/checkin-status')).toBe(true);
});
