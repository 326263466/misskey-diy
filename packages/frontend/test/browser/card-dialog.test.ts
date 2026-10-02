/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App, VNode } from 'vue';
import '@/style.scss';
import MkDialog from '@/components/MkDialog.vue';
import MkSystemIcon from '@/components/global/MkSystemIcon.vue';
import MkAnnouncementDialog from '@/components/MkAnnouncementDialog.vue';
import { updateDeviceKind } from '@/utility/device-kind.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('misskey-js', () => ({}));
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn(), currentCompiledTheme: { panel: '' } } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ useListener: vi.fn() }) }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release() {} }) }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkDatePicker.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { destroy() {} } }));
vi.mock('@/i.js', () => ({ $i: { unreadAnnouncements: [] } }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { close: 'Close', scrollToClose: 'Scroll to close', ok: 'OK', cancel: 'Cancel' } } }));

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
	app.component('Mfm', { props: ['text'], setup: props => () => h('div', { style: 'white-space:pre-wrap;line-height:20px;' }, props.text) });
	for (const directive of ['hotkey', 'adaptive-border', 'tooltip']) app.directive(directive, () => {});
	app.mount(host);
	await settle();
	await settle();
}

afterEach(() => {
	app?.unmount();
	host?.remove();
	updateDeviceKind(null);
});

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

test.each([320, 900].flatMap(width => ['增加虚拟币', '减少虚拟币'].map(title => ({ width, title }))))('wallet confirmation keeps its warning and two text rows at $width px: $title', async ({ width, title }) => {
	await page.viewport(width, 700);
	const done = vi.fn();
	const text = title === '增加虚拟币' ? '确定增加 10,000 虚拟币？' : '确定减少 10,000 虚拟币？';
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
	await page.screenshot({ element: card, path: `../e2e/artifacts/component-browser/wallet-confirm-${width}-${title === '增加虚拟币' ? 'increase' : 'decrease'}.png` });
	await page.getByRole('button', { name: title, exact: true }).click();
	expect(done).toHaveBeenCalledWith({ canceled: false, result: true });
});

test.each([320, 900])('long announcements unlock after reaching the bottom at %i px', async width => {
	await page.viewport(width, 700);
	await mount(() => h(MkAnnouncementDialog, { announcement: {
		id: 'example', title: 'Announcement', text: 'Announcement line\n'.repeat(80), icon: 'info', imageUrl: null,
		createdAt: '2026-10-02T00:00:00Z', updatedAt: null, display: 'dialog', needConfirmationToRead: false,
		forYou: false, silence: false, isRead: false,
	} }));
	const button = host!.querySelector('button')!;
	const footer = button.parentElement!;
	const card = footer.parentElement!;
	expect(button.disabled).toBe(true);
	expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(width - 16);
	expect(card.scrollWidth).toBe(card.clientWidth);
	expect(getComputedStyle(footer).padding).toBe('18px');
	expect(getComputedStyle(footer).backgroundColor).toBe(getComputedStyle(card).backgroundColor);
	card.scrollTop = card.scrollHeight / 3;
	await settle();
	expect(button.disabled).toBe(true);
	card.scrollTop = card.scrollHeight;
	await expect.poll(() => button.disabled).toBe(false);
	card.scrollTop = 0;
	await settle();
	expect(button.disabled).toBe(false);
	await page.screenshot({ element: card, path: `../e2e/artifacts/component-browser/announcement-card-${width}.png` });
});

test('short announcements can close without requiring a scroll', async () => {
	await page.viewport(320, 700);
	await mount(() => h(MkAnnouncementDialog, { announcement: {
		id: 'example', title: 'Announcement', text: 'Short announcement.', icon: 'info', imageUrl: null,
		createdAt: '2026-10-02T00:00:00Z', updatedAt: null, display: 'dialog', needConfirmationToRead: false,
		forYou: false, silence: false, isRead: false,
	} }));
	await expect.poll(() => host!.querySelector('button')!.disabled).toBe(false);
});
