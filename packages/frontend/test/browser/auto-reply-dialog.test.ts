/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import MkAutoReplyDialog from '@/components/MkAutoReplyDialog.vue';
import MkPopupMenu from '@/components/MkPopupMenu.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import { updateDeviceKind } from '@/utility/device-kind.js';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: {
		close: '关闭', none: '无', cancel: '取消', ok: '确定',
		_onlineStatus: {
			away: '离开', busy: '忙碌', doNotDisturb: '请勿打扰', autoReply: '自动回复',
			customAutoReply: '自定义自动回复', autoReplyContent: '回复内容', autoReplyPlaceholder: '输入自动回复内容',
			_autoReplyPresets: { away: '暂时离开，稍后回复。', work: '工作中，请勿打扰。', meal: '用餐中，稍后回复。' },
		},
	},
	tsx: { _onlineStatus: {
		switchTo: ({ status }: { status: string }) => `切换为${status}`,
		autoReplyLimit: ({ max }: { max: number }) => `最多 ${max} 个字符`,
	} },
} }));

let app: App | undefined;
let host: HTMLElement | undefined;
const popupApps: App[] = [];

function configureApp(instance: App): void {
	instance.directive('hotkey', hotkeyDirective);
	for (const name of ['MkEllipsis', 'MkAvatar', 'MkA', 'MkUserName']) instance.component(name, { render: () => null });
}

beforeEach(() => {
	vi.mocked(os.popupMenu).mockImplementation((items, source, options = {}) => {
		const popupHost = document.createElement('div');
		host!.append(popupHost);
		return new Promise<void>(resolve => {
			const popupApp = createApp({ render: () => h(MkPopupMenu, {
				items: items.filter(item => item != null),
				anchorElement: source instanceof HTMLElement ? source : null,
				returnFocusTo: source instanceof HTMLElement ? source : null,
				width: options.width,
				matchAnchorWidth: options.matchAnchorWidth,
				onClosing: options.onClosing,
				onClosed: () => { popupHost.remove(); resolve(); },
			}) });
			configureApp(popupApp);
			popupApp.mount(popupHost);
			popupApps.push(popupApp);
		});
	});
});

async function settle(): Promise<void> {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

afterEach(async () => {
	for (const popupApp of popupApps.splice(0)) popupApp.unmount();
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
	updateDeviceKind(null);
	vi.clearAllMocks();
	await settle();
});

test.each([
	{ width: 900, height: 700, dark: false },
	{ width: 390, height: 700, dark: true },
	{ width: 320, height: 480, dark: false },
])('auto reply remains usable at $width × $height (dark: $dark)', async ({ width, height, dark }) => {
	await page.viewport(width, height);
	updateDeviceKind(width > 500 ? 'desktop' : 'smartphone');
	host = document.createElement('div');
	host.style.cssText = '--MI-cardPadding:20px;--MI_THEME-accent:#86b300;--MI_THEME-accentedBg:#86b30022;--MI_THEME-fgOnAccent:#132000;--MI_THEME-divider:#8884;--MI_THEME-inputBorder:#8888;--MI_THEME-inputBorderHover:#86b300;--MI_THEME-focus:#86b300;--MI_THEME-buttonBg:#8882;--MI_THEME-buttonHoverBg:#8883;--MI_THEME-modalBg:#0008;--MI_THEME-error:#ec4137;--MI_THEME-shadow:#0003;color:var(--MI_THEME-fg);font-size:14px;';
	host.style.setProperty('--MI_THEME-bg', dark ? '#17191f' : '#f2f3f5');
	host.style.setProperty('--MI_THEME-panel', dark ? '#282f32' : '#fff');
	host.style.setProperty('--MI_THEME-popup', dark ? '#282f32' : '#fff');
	host.style.setProperty('--MI_THEME-windowHeader', dark ? '#282f32' : '#fff');
	host.style.setProperty('--MI_THEME-fg', dark ? '#e2e6e9' : '#444');
	document.body.append(host);
	const save = vi.fn().mockResolvedValue(undefined);
	app = createApp({ render: () => h(MkAutoReplyDialog, { status: 'doNotDisturb', save }) });
	configureApp(app);
	app.mount(host);
	await document.fonts.ready;
	await settle();
	const trigger = page.getByRole('button', { name: '自动回复', exact: true });
	await expect.element(trigger).toHaveFocus();
	await expect.element(trigger).toHaveTextContent('工作中，请勿打扰。');
	await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
	expect(host.querySelector('select, .ti-check')).toBeNull();
	const close = host.querySelector<HTMLElement>('[data-testid="modal-window-close"]')!;
	const root = close.parentElement!.parentElement!;
	const body = root.children[1] as HTMLElement;
	expect(body.scrollWidth).toBe(body.clientWidth);
	expect(root.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
	expect(root.getBoundingClientRect().right).toBeLessThanOrEqual(width);
	expect(root.getBoundingClientRect().bottom).toBeLessThanOrEqual(height);
	if (width > 500) expect(root.getBoundingClientRect().width).toBe(380);
	const triggerElement = root.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
	const triggerBox = triggerElement.getBoundingClientRect();
	for (const point of [
		{ edge: 'top', x: triggerBox.left + triggerBox.width / 2, y: triggerBox.top - 4 },
		{ edge: 'bottom', x: triggerBox.left + triggerBox.width / 2, y: triggerBox.bottom + 4 },
		{ edge: 'left', x: triggerBox.left - 4, y: triggerBox.top + triggerBox.height / 2 },
		{ edge: 'right', x: triggerBox.right + 4, y: triggerBox.top + triggerBox.height / 2 },
	]) {
		await page.elementLocator(document.body).click({ position: { x: point.x, y: point.y }, force: true });
		expect(os.popupMenu, `click outside the ${point.edge} edge`).not.toHaveBeenCalled();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
	}
	await page.getByText('自动回复', { exact: true }).click();
	expect(os.popupMenu, 'clicking the label must not expand the dropdown').not.toHaveBeenCalled();
	const labelBox = document.getElementById(triggerElement.getAttribute('aria-labelledby')!)!.getBoundingClientRect();
	await page.elementLocator(document.body).click({ position: { x: labelBox.right - 4, y: labelBox.top + labelBox.height / 2 }, force: true });
	expect(os.popupMenu, 'clicking label row whitespace must not expand the dropdown').not.toHaveBeenCalled();
	await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/auto-reply-${width}-${dark ? 'dark' : 'light'}.png` });
	for (const point of [
		{ x: triggerBox.left + triggerBox.width / 2, y: triggerBox.top + 1 },
		{ x: triggerBox.left + triggerBox.width / 2, y: triggerBox.bottom - 1 },
		{ x: triggerBox.left + 1, y: triggerBox.top + triggerBox.height / 2 },
		{ x: triggerBox.right - 1, y: triggerBox.top + triggerBox.height / 2 },
	]) {
		await page.elementLocator(document.body).click({ position: point, force: true });
		await expect.element(page.getByRole('menu')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
		await expect.element(trigger).toHaveFocus();
	}
	for (const child of [triggerElement.querySelector<HTMLElement>('span')!, triggerElement.querySelector<HTMLElement>('i')!]) {
		await page.elementLocator(child).click();
		await expect.element(page.getByRole('menu')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
		await expect.element(trigger).toHaveFocus();
	}
	await trigger.click();
	await expect.element(page.getByRole('menu')).toBeVisible();
	await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');
	expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
	const menu = host.querySelector<HTMLElement>('[role="menu"]')!;
	const anchor = root.querySelector<HTMLElement>('[aria-haspopup="menu"]')!.getBoundingClientRect();
	const menuBox = menu.getBoundingClientRect();
	expect(menuBox.width).toBeCloseTo(anchor.width, 1);
	expect(menuBox.left).toBeGreaterThanOrEqual(0);
	expect(menuBox.top).toBeGreaterThanOrEqual(0);
	expect(menuBox.right).toBeLessThanOrEqual(width);
	expect(menuBox.bottom).toBeLessThanOrEqual(height);
	expect(menuBox.top >= anchor.bottom || menuBox.bottom <= anchor.top).toBe(true);
	await page.getByRole('menuitem', { name: '用餐中，稍后回复。' }).hover();
	const hovered = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(item => item.textContent?.includes('用餐中'))!;
	expect(getComputedStyle(hovered, '::before').backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
	expect(menu.querySelector('.ti-check')).toBeNull();
	await page.screenshot({ path: `../e2e/artifacts/component-browser/auto-reply-dropdown-${width}-${dark ? 'dark' : 'light'}.png` });
	await userEvent.keyboard('{ArrowDown}');
	await expect.element(page.getByRole('menuitem', { name: '暂时离开，稍后回复。' })).toHaveFocus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.element(page.getByRole('menuitem', { name: '工作中，请勿打扰。' })).toHaveFocus();
	await userEvent.keyboard('{ArrowDown}');
	await userEvent.keyboard('{Enter}');
	await expect.element(trigger).toHaveTextContent('用餐中，稍后回复。');
	await expect.element(trigger).toHaveFocus();
	await trigger.click();
	await expect.element(page.getByRole('menu')).toBeVisible();
	await userEvent.keyboard('{Escape}');
	await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
	await expect.element(trigger).toHaveFocus();
	await trigger.click();
	await page.getByRole('menuitem', { name: '无', exact: true }).click();
	await expect.element(trigger).toHaveTextContent('无');
	await expect.element(trigger).toHaveFocus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.element(page.getByRole('menu')).toBeVisible();
	await userEvent.keyboard('{ArrowUp}');
	await expect.element(page.getByRole('menuitem', { name: '自定义自动回复' })).toHaveFocus();
	await userEvent.keyboard('{Enter}');
	const text = page.getByRole('textbox', { name: '回复内容' });
	await expect.element(text).toHaveFocus();
	await expect.element(page.getByRole('button', { name: '确定', exact: true })).toBeDisabled();
	await text.fill('正在开会，结束后回复。');
	expect(getComputedStyle(root.querySelector('textarea')!).resize).toBe('none');
	expect(body.scrollWidth).toBe(body.clientWidth);
	for (const button of root.querySelectorAll('button')) {
		const bounds = button.getBoundingClientRect();
		expect(bounds.left).toBeGreaterThanOrEqual(0);
		expect(bounds.right).toBeLessThanOrEqual(width);
		expect(bounds.bottom).toBeLessThanOrEqual(height);
	}
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/auto-reply-custom-${width}-${dark ? 'dark' : 'light'}.png` });
	await page.getByRole('button', { name: '确定', exact: true }).click();
	expect(save).toHaveBeenCalledExactlyOnceWith('正在开会，结束后回复。');
});
