/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App, PropType } from 'vue';
import type { entities } from 'misskey-js';
import type { Locale } from '../../../i18n/src/autogen/locale.js';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import AdminCheckin from '@/pages/admin/checkin.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), popup: vi.fn(), toast: vi.fn() }));
vi.mock('misskey-js', () => ({}));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api, misskeyApiGet: mocks.api }));
vi.mock('@/os.js', () => ({ popup: mocks.popup, toast: mocks.toast, alert: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMiniChart.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class {} }));
vi.mock('@/filters/user.js', () => ({ acct: (user: { username: string }) => user.username }));
vi.mock('@/i18n.js', async () => {
	const { I18n } = await import('@@/js/i18n.js');
	const { version } = await import('../../../../package.json');
	const locales = import.meta.glob<Locale>('../../../../built/_frontend_dist_/locales/zh-CN.*.json', { eager: true, import: 'default' });
	return { i18n: new I18n<Locale>(locales[`../../../../built/_frontend_dist_/locales/zh-CN.${version}.json`]) };
});

const recipient = { id: 'recipient', username: 'community_member', name: '每天记录一点美好的社区成员', host: null, isSuspended: false, movedTo: null } as entities.UserDetailed;
const operator = { ...recipient, id: 'admin', username: 'administrator' };
let granted = 0;
let app: App | undefined;
let host: HTMLElement | undefined;
let originalStyle = '';

function history(type: string): entities.AdminCheckinHistoryResponse {
	return { total: 2, items: [0, 1].map(index => ({
		id: `${type}-${index}`, createdAt: '2026-09-29T04:15:00Z', userId: recipient.id, user: recipient,
		operator: type === 'grant' ? operator : null, recipientUsername: recipient.username,
		amount: type === 'grant' ? 5 : 1, before: type === 'grant' ? 2 : null, after: type === 'grant' ? 7 : null,
		date: type === 'use' ? '2026-09-28' : null, pointsSpent: type === 'exchange' ? 7 : null,
		batchId: null, usageStatus: 'legacy', used: null, remaining: null, revoked: null,
	})) };
}

beforeEach(() => {
	granted = 0;
	vi.clearAllMocks();
	originalStyle = document.documentElement.style.cssText;
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
	mocks.api.mockImplementation(async (endpoint: string, params: { userId?: string; type?: string; amount?: number } = {}) => {
		if (endpoint === 'admin/checkin/stats') return { grantedCards: 12500 + granted, grantCount: 360, grantedUsers: 208, usedCards: 4900, usedUsers: 186, exchangedCards: 520, availableCards: 8120 + granted };
		if (endpoint === 'admin/checkin/history') return history(params.type ?? 'grant');
		if (endpoint === 'admin/checkin/users') return { total: 1, items: [{ user: recipient, grantedCards: 12, usedCards: 3, exchangedCards: 1, availableCards: 10, points: 28 }] };
		if (endpoint === 'admin/show-user') return { checkinPoints: 28, checkinMakeupCards: 10 + granted, isSuspended: false };
		if (endpoint === 'admin/checkin/grant-cards') { granted += params.amount ?? 0; return { makeupCards: 10 + granted }; }
		throw new Error(`Unexpected endpoint ${endpoint}`);
	});
});

afterEach(() => {
	app?.unmount();
	host?.remove();
	document.documentElement.style.cssText = originalStyle;
});

async function mount(width: number, dark: boolean) {
	await page.viewport(width, 1000);
	document.documentElement.style.cssText = '--MI_THEME-accent:#2686ff;--MI_THEME-accentedBg:#2686ff20;--MI_THEME-link:#2686ff;--MI_THEME-fgOnAccent:#fff;--MI_THEME-buttonBg:#8882;--MI_THEME-buttonHoverBg:#8883;--MI_THEME-focus:#2686ff;--MI_THEME-inputBorder:#8888;--MI_THEME-inputBorderHover:#2686ff;';
	for (const [key, value] of Object.entries({
		bg: dark ? '#232323' : '#f2f3f5', panel: dark ? '#2d2d2d' : '#fff', fg: dark ? '#c7d1d8' : '#35404a',
		fgTransparentWeak: dark ? '#c7d1d8b3' : '#676767b3', divider: dark ? '#ffffff24' : '#e8e8e8',
	})) document.documentElement.style.setProperty(`--MI_THEME-${key}`, value);
	host = document.createElement('div');
	host.style.cssText = 'background:var(--MI_THEME-bg);min-height:100vh;';
	document.body.append(host);
	app = createApp(AdminCheckin);
	app.component('PageWithHeader', defineComponent({ setup: (_, { slots }) => () => h('main', null, slots.default?.()) }));
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
	expect(host!.scrollWidth).toBeLessThanOrEqual(width);
	for (const section of host!.querySelectorAll('section')) {
		const bounds = section.getBoundingClientRect();
		expect(bounds.left).toBeGreaterThanOrEqual(0);
		expect(bounds.right).toBeLessThanOrEqual(width);
	}
	for (const table of host!.querySelectorAll('table')) {
		const scroller = table.parentElement!;
		expect(getComputedStyle(scroller).overflowX).toBe('auto');
		expect(scroller.getBoundingClientRect().right).toBeLessThanOrEqual(width);
	}
}

test.each([1280, 390, 320].flatMap(width => [false, true].map(dark => ({ width, dark }))))('card management dashboard at $width px (dark: $dark)', async ({ width, dark }) => {
	await mount(width, dark);
	await expect.element(page.getByTestId('checkin-admin-stats')).toBeVisible();
	await expect.element(page.getByTestId('checkin-admin-records')).toBeVisible();
	await expect.element(page.getByTestId('checkin-admin-grantedCards')).toHaveTextContent('12,500');
	expectPageFit(width);
	await page.getByRole('button', { name: i18n.ts.selectUser }).click();
	const callbacks = mocks.popup.mock.lastCall![2];
	callbacks.ok(recipient);
	callbacks.closed();
	await expect.element(page.getByRole('spinbutton', { name: i18n.ts._checkin.grantAmount })).toBeVisible();
	await page.getByRole('spinbutton', { name: i18n.ts._checkin.grantAmount }).fill('5');
	await page.getByRole('button', { name: i18n.ts._checkin.grantCards, exact: true }).click();
	await expect.element(page.getByTestId('checkin-admin-grantedCards')).toHaveTextContent('12,505');
	expect(mocks.api).toHaveBeenCalledWith('admin/checkin/grant-cards', { userId: recipient.id, amount: 5 });
	expectPageFit(width);
	await page.viewport(width, Math.ceil(host!.getBoundingClientRect().height));
	await page.screenshot({ element: host!, path: `../e2e/artifacts/component-browser/checkin-admin-${width}-${dark ? 'dark' : 'light'}.png` });
});
