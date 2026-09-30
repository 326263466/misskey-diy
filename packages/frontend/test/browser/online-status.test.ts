/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import MkMenu from '@/components/MkMenu.vue';
import { $i } from '@/i.js';
import { popup } from '@/os.js';
import { getOnlineStatusMenu } from '@/utility/online-status.js';
import { hotkeyDirective } from '@/directives/hotkey.js';

vi.mock('@/os.js', () => ({ apiWithDialog: vi.fn(), popupMenu: vi.fn(), popup: vi.fn(() => ({ dispose: vi.fn() })) }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { hideOnlineStatus: false, onlineStatusOverride: 'online' } }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false, lastPointerType: 'mouse' }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { onlineStatus: '在线状态', online: '在线', custom: '自定义', _onlineStatus: { away: '离开', busy: '忙碌', doNotDisturb: '请勿打扰', invisible: '隐身', customStatus: '自定义状态' } } } }));

let app: App;
let host: HTMLElement;

afterEach(() => {
	app?.unmount();
	host?.remove();
	vi.clearAllMocks();
});

test.each([
	{ dark: false, custom: false, width: 360 },
	{ dark: true, custom: false, width: 360 },
	{ dark: false, custom: true, width: 320 },
	{ dark: true, custom: true, width: 320 },
])('status grid supports keyboard entry and editing (dark: $dark, custom: $custom, width: $width)', async ({ dark, custom, width }) => {
	await page.viewport(width, 380);
	Object.assign($i!, { customStatus: custom ? { icon: 'book', text: '正在阅读' } : null });
	const parentName = custom ? '在线状态 正在阅读' : '在线状态 在线';
	host = document.createElement('div');
	host.style.cssText = 'min-height:300px;padding:24px;box-sizing:border-box;background:var(--MI_THEME-bg);color:var(--MI_THEME-fg);font-size:14px;--MI_THEME-accent:#86b300;--MI_THEME-accentedBg:rgba(134,179,0,.15);--MI_THEME-success:#86b300;--MI_THEME-error:#ec4137;--MI_THEME-warn:#ecb637;--MI_THEME-focus:#86b300;--MI_THEME-buttonHoverBg:rgba(128,128,128,.15);--MI_THEME-divider:rgba(128,128,128,.2);--MI_THEME-shadow:rgba(0,0,0,.15);';
	host.style.setProperty('--MI_THEME-bg', dark ? '#17191f' : '#f2f3f5');
	host.style.setProperty('--MI_THEME-panel', dark ? '#282f32' : '#fff');
	host.style.setProperty('--MI_THEME-popup', dark ? '#282f32' : '#fff');
	host.style.setProperty('--MI_THEME-fg', dark ? '#e2e6e9' : '#444');
	host.style.setProperty('--MI_THEME-fgOnWhite', '#333');
	host.style.setProperty('--MI_THEME-fgOnAccent', '#fff');
	document.body.append(host);
	app = createApp({ render: () => h(MkMenu, { items: [getOnlineStatusMenu()], width: 220 }) });
	app.directive('hotkey', hotkeyDirective);
	for (const name of ['MkEllipsis', 'MkAvatar', 'MkA', 'MkUserName']) app.component(name, { render: () => null });
	app.mount(host);
	await nextTick();
	await page.getByRole('menuitem', { name: parentName }).hover();
	await expect.element(page.getByRole('group', { name: '在线状态' })).toBeVisible();
	for (const button of host.querySelectorAll<HTMLElement>('[role="menuitemradio"]')) {
		expect(getComputedStyle(button).outlineStyle).toBe('none');
	}
	await document.fonts.ready;
	await page.screenshot({ path: `../e2e/artifacts/component-browser/online-status-${custom ? 'custom-' : ''}${dark ? 'dark' : 'light'}.png` });
	await userEvent.keyboard('{ArrowDown}');
	await expect.element(page.getByRole('menuitem', { name: parentName })).toHaveFocus();
	await userEvent.keyboard('{Enter}');
	const grid = page.getByRole('group', { name: '在线状态' });
	await expect.element(grid).toBeVisible();
	const online = page.getByRole('menuitemradio', { name: '在线' });
	const customOption = page.getByRole('menuitemradio', { name: '自定义' });
	await expect.element(custom ? customOption : online).toHaveFocus();
	await expect.element(online).toHaveAttribute('aria-checked', custom ? 'false' : 'true');
	await expect.element(customOption).toHaveAttribute('aria-checked', custom ? 'true' : 'false');
	const buttons = Array.from(host.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
	expect(buttons.map(button => button.textContent?.trim())).toEqual(['在线', '离开', '忙碌', '请勿打扰', '隐身', '自定义']);
	expect(host.querySelector('[role="separator"], .ti-check')).toBeNull();
	for (const button of buttons) {
		const style = getComputedStyle(button);
		expect(style.boxShadow).toBe('none');
		expect(style.borderWidth).toBe('0px');
		expect(style.textAlign).toBe('center');
		const icon = button.firstElementChild as HTMLElement;
		const isCustom = button.textContent?.trim() === '自定义';
		const glyph = isCustom ? icon.firstElementChild as HTMLElement : icon.querySelector<HTMLElement>('i')!;
		const iconBox = icon.getBoundingClientRect();
		const glyphBox = glyph.getBoundingClientRect();
		const buttonBox = button.getBoundingClientRect();
		expect(iconBox.width).toBe(22);
		expect(iconBox.height).toBe(22);
		expect(glyphBox.width).toBeLessThanOrEqual(iconBox.width);
		expect(glyphBox.height).toBeLessThanOrEqual(iconBox.height);
		expect(Math.abs(glyphBox.left + glyphBox.width / 2 - buttonBox.left - buttonBox.width / 2)).toBeLessThan(0.1);
		expect(getComputedStyle(icon).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
		if (isCustom) {
			expect(icon.dataset.customStatusIcon).toBe('add');
			expect(icon.querySelector('i, svg, img')).toBeNull();
		}
	}
	const rects = buttons.map(button => button.getBoundingClientRect());
	expect(rects).toHaveLength(6);
	expect(rects[0].top).toBe(rects[1].top);
	expect(rects[1].top).toBe(rects[2].top);
	expect(rects[3].top).toBeGreaterThan(rects[0].bottom);
	expect(rects[3].top).toBe(rects[4].top);
	expect(rects[4].top).toBe(rects[5].top);
	for (const rect of rects) {
		expect(rect.left).toBeGreaterThanOrEqual(0);
		expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
		expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
	}
	await document.fonts.ready;
	await page.screenshot({ path: `../e2e/artifacts/component-browser/online-status-${custom ? 'custom-' : ''}${dark ? 'dark' : 'light'}-keyboard.png` });
	await userEvent.keyboard('{ArrowDown}');
	await expect.element(page.getByRole('menuitemradio', { name: custom ? '忙碌' : '请勿打扰' })).toHaveFocus();
	await userEvent.keyboard('{ArrowUp}');
	await expect.element(custom ? customOption : online).toHaveFocus();
	await userEvent.keyboard('{ArrowRight}');
	await expect.element(page.getByRole('menuitemradio', { name: custom ? '在线' : '离开' })).toHaveFocus();
	await userEvent.keyboard('{Escape}');
	await expect.element(grid).not.toBeInTheDocument();
	await expect.element(page.getByRole('menuitem', { name: parentName })).toHaveFocus();
	if (custom) {
		await userEvent.keyboard('{Enter}');
		await customOption.click();
		expect(popup).toHaveBeenCalledExactlyOnceWith(expect.anything(), { initialStatus: { icon: 'book', text: '正在阅读' }, save: expect.any(Function) }, { closed: expect.any(Function) });
	}
});
