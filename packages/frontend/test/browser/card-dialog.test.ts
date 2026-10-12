/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App, VNode } from 'vue';
import '@/style.scss';
import 'virtual:tabler-icons.css';
import MkDialog from '@/components/MkDialog.vue';
import MkSystemIcon from '@/components/global/MkSystemIcon.vue';
import MkAnnouncementDialog from '@/components/MkAnnouncementDialog.vue';
import MkSigninDialog from '@/components/MkSigninDialog.vue';
import { updateDeviceKind } from '@/utility/device-kind.js';
import { misskeyApi } from '@/utility/misskey-api.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('misskey-js', () => ({}));
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn(), currentCompiledTheme: { panel: '' } } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ useListener: vi.fn() }) }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release() {} }) }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkDatePicker.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkSignin.vue', () => ({ default: { render: () => h('div', '登录表单') } }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { destroy() {} } }));
vi.mock('@/i.js', () => ({ $i: { unreadAnnouncements: [] } }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { close: 'Close', login: '登录 Sign in', scrollToClose: 'Scroll to close', ok: 'OK', cancel: 'Cancel' } } }));

let app: App | undefined;
let host: HTMLElement | undefined;

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function mount(render: () => VNode) {
	updateDeviceKind('desktop');
	host = document.createElement('div');
	host.style.cssText = '--MI_THEME-panel:#fff;--MI_THEME-bg:#f2f3f5;--MI_THEME-fg:#303540;--MI_THEME-accent:#1682ff;--MI_THEME-fgOnAccent:#fff;--MI_THEME-buttonBg:#e8edf2;--MI_THEME-divider:#d5d8de;--MI_THEME-modalBg:#0008;color:var(--MI_THEME-fg);font-size:14px;';
	document.body.append(host);
	app = createApp({ render });
	app.component('MkSystemIcon', MkSystemIcon);
	app.component('MkLoading', { render: () => null });
	// Match the application's existing global component name.
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', defineComponent({
		props: { text: { type: String, default: '' } },
		setup: props => () => h('div', { style: 'white-space:pre-wrap;line-height:20px;' }, props.text),
	}));
	for (const directive of ['hotkey', 'adaptive-border', 'tooltip']) app.directive(directive, () => {});
	app.mount(host);
	await document.fonts.ready;
	await settle();
	await settle();
}

afterEach(() => {
	app?.unmount();
	host?.remove();
	updateDeviceKind(null);
	vi.clearAllMocks();
});

async function clickBackdrop() {
	await page.elementLocator(page.getByTestId('bg').element().nextElementSibling!).click({ position: { x: 4, y: 4 } });
	await settle();
}

test.each([320, 900])('input dialogs fit a %i px viewport with one card inset', async width => {
	await page.viewport(width, 700);
	await mount(() => h(MkDialog, { input: { type: 'text', default: 'Example' }, showCancelButton: true }));
	const input = host!.querySelector('input')!;
	const card = host!.querySelector('[data-testid="modal-dialog-ok"]')!.parentElement!.parentElement!;
	const bounds = card.getBoundingClientRect();
	expect(bounds.left).toBeGreaterThanOrEqual(16);
	expect(bounds.right).toBeLessThanOrEqual(width - 16);
	expect(input.getBoundingClientRect().left - bounds.left).toBe(18);
	expect(bounds.right - input.getBoundingClientRect().right).toBe(18);
	expect(getComputedStyle(card).backgroundColor).toBe('rgb(255, 255, 255)');
	expect(getComputedStyle(input).backgroundColor).toBe('rgb(242, 243, 245)');
});

test.each([320, 900].flatMap(width => ['增加积分', '减少积分'].map(title => ({ width, title }))))('wallet confirmation keeps its warning and two text rows at $width px: $title', async ({ width, title }) => {
	await page.viewport(width, 700);
	const done = vi.fn();
	const text = title === '增加积分' ? '确定增加 10,000 积分？' : '确定减少 10,000 积分？';
	await mount(() => h(MkDialog, { type: 'warning', title, text, okText: title, showCancelButton: true, onDone: done }));
	host!.style.setProperty('--MI_THEME-fgTransparentWeak', '#6b7280');
	host!.style.setProperty('--MI_THEME-warn', '#ff8c00');
	const card = host!.querySelector('[data-testid="modal-dialog-ok"]')!.parentElement!.parentElement!;
	const [icon, heading, amount, buttons] = [...card.children];
	expect(card.children).toHaveLength(4);
	expect(icon.querySelector('svg')).not.toBeNull();
	expect(heading.tagName).toBe('HEADER');
	expect(heading.textContent).toBe(title);
	expect(amount.textContent).toBe(text);
	expect(buttons.querySelectorAll('button')).toHaveLength(2);
	expect(card.scrollWidth).toBe(card.clientWidth);
	expect(card.getBoundingClientRect().left).toBeGreaterThanOrEqual(16);
	expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(width - 16);
	expect(getComputedStyle(card).padding).toBe('18px');
	expect(getComputedStyle(heading).color).not.toBe(getComputedStyle(amount).color);
	await Promise.all(icon.getAnimations({ subtree: true }).map(animation => animation.finished));
	await page.screenshot({ element: card, path: `../e2e/artifacts/component-browser/wallet-confirm-${width}-${title === '增加积分' ? 'increase' : 'decrease'}.png` });
	await page.getByRole('button', { name: title, exact: true }).click();
	expect(done).toHaveBeenCalledWith({ canceled: false, result: true });
});

test.each([320, 900])('long announcements unlock after reaching the bottom at %i px', async width => {
	await page.viewport(width, 700);
	const closed = vi.fn();
	await mount(() => h(MkAnnouncementDialog, { onClosed: closed, announcement: {
		id: 'example', title: 'Announcement', text: 'Announcement line\n'.repeat(80), icon: 'info', imageUrl: null,
		createdAt: '2026-10-02T00:00:00Z', updatedAt: null, display: 'dialog', needConfirmationToRead: false,
		forYou: false, silence: false, isRead: false,
	} }));
	const button = host!.querySelector('button')!;
	const footer = button.parentElement!;
	const card = footer.parentElement!;
	expect(button.disabled).toBe(true);
	await clickBackdrop();
	expect(closed).not.toHaveBeenCalled();
	expect(misskeyApi).not.toHaveBeenCalled();
	expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(width - 16);
	expect(card.scrollWidth).toBe(card.clientWidth);
	expect(getComputedStyle(footer).padding).toBe('18px');
	expect(getComputedStyle(footer).backgroundColor).toBe(getComputedStyle(card).backgroundColor);
	card.scrollTop = card.scrollHeight / 3;
	await settle();
	expect(button.disabled).toBe(true);
	await clickBackdrop();
	expect(closed).not.toHaveBeenCalled();
	card.scrollTop = card.scrollHeight;
	await expect.poll(() => button.disabled).toBe(false);
	card.scrollTop = 0;
	await settle();
	expect(button.disabled).toBe(false);
	await page.screenshot({ element: card, path: `../e2e/artifacts/component-browser/announcement-card-${width}.png` });
	await clickBackdrop();
	await expect.poll(() => closed.mock.calls.length).toBe(1);
	expect(misskeyApi).toHaveBeenCalledExactlyOnceWith('i/read-announcement', { announcementId: 'example' });
});

test.each([false, true])('short announcements respect required confirmation=%s when clicking outside', async needConfirmationToRead => {
	await page.viewport(320, 700);
	const closed = vi.fn();
	await mount(() => h(MkAnnouncementDialog, { onClosed: closed, announcement: {
		id: 'example', title: 'Announcement', text: 'Short announcement.', icon: 'info', imageUrl: null,
		createdAt: '2026-10-02T00:00:00Z', updatedAt: null, display: 'dialog', needConfirmationToRead,
		forYou: false, silence: false, isRead: false,
	} }));
	await expect.poll(() => host!.querySelector('button')!.disabled).toBe(false);
	await clickBackdrop();
	if (needConfirmationToRead) {
		expect(closed).not.toHaveBeenCalled();
		expect(misskeyApi).not.toHaveBeenCalled();
	} else {
		await expect.poll(() => closed.mock.calls.length).toBe(1);
		expect(misskeyApi).toHaveBeenCalledExactlyOnceWith('i/read-announcement', { announcementId: 'example' });
	}
});

test.each([320, 900])('sign-in centers the title, login and close icons with a larger font at %i px', async width => {
	await page.viewport(width, 700);
	const onCancelled = vi.fn();
	await mount(() => h(MkSigninDialog, { onCancelled }));
	host!.style.fontSize = '17px';
	host!.style.zoom = '1.25';
	await settle();
	const close = page.getByRole('button', { name: 'Close', exact: true }).element();
	const header = close.parentElement!;
	const title = header.firstElementChild!;
	const center = (element: Element) => {
		const box = element.getBoundingClientRect();
		return (box.top + box.bottom) / 2;
	};
	expect(header.getBoundingClientRect().height).toBe(62.5);
	for (const element of [title.firstElementChild!, title.lastElementChild!, close.querySelector('i')!]) {
		expect(center(element)).toBeCloseTo(center(header), 1);
	}
	const closeBox = close.getBoundingClientRect();
	expect(closeBox.width).toBe(closeBox.height);
	expect(header.scrollWidth).toBe(header.clientWidth);
	await page.screenshot({ element: header.parentElement!, path: `../e2e/artifacts/component-browser/signin-header-centered-${width}.png` });
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	expect(onCancelled).toHaveBeenCalledOnce();
});

test.each([320, 900].flatMap(width => [false, true].map(multiline => ({ width, multiline }))))('announcement centers its icon with a multiline=$multiline title at $width px', async ({ width, multiline }) => {
	await page.viewport(width, 700);
	await mount(() => h(MkAnnouncementDialog, { announcement: {
		id: 'example', title: multiline ? '通知标题含中文与 English '.repeat(12) : '通知 Announcement', text: '正文', icon: 'warning', imageUrl: null,
		createdAt: '2026-10-02T00:00:00Z', updatedAt: null, display: 'dialog', needConfirmationToRead: false,
		forYou: false, silence: false, isRead: false,
	} }));
	const card = host!.querySelector('button')!.parentElement!.parentElement!;
	const header = card.firstElementChild!;
	const icon = header.firstElementChild!;
	const label = header.lastElementChild!;
	const center = (element: Element) => {
		const box = element.getBoundingClientRect();
		return (box.top + box.bottom) / 2;
	};
	expect(center(icon)).toBeCloseTo(center(label), 1);
	expect(icon.getBoundingClientRect().height).toBeCloseTo(parseFloat(getComputedStyle(icon, '::before').fontSize), 1);
	if (multiline) expect(label.getBoundingClientRect().height).toBeGreaterThan(20);
	else expect(label.getBoundingClientRect().height).toBe(20);
	expect(card.scrollWidth).toBe(card.clientWidth);
	if (width === 320 && multiline) await page.screenshot({ element: card, path: '../e2e/artifacts/component-browser/announcement-header-centered-multiline.png' });
});
