/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkWidgetPicker from '@/components/MkWidgetPicker.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
vi.mock('@/instance.js', () => ({ instance: { federation: 'all' } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	close: '关闭', editWidgets: '编辑小工具', editWidgetsExit: '完成编辑', settings: '设置', remove: '删除', resetToDefaultValue: '恢复默认',
	_widgets: { profile: '个人资料', instanceInfo: '服务器信息', memo: '便签', todo: '待办清单', pomodoro: '番茄钟', countdown: '倒计时' },
	_widgetPicker: {
		title: '添加小工具', search: '搜索小工具', empty: '没有找到匹配的小工具，试试其他关键词。', current: '已添加', moveUp: '上移', moveDown: '下移',
		_descriptions: { profile: '显示你的头像和个人资料', instanceInfo: '查看当前服务器的信息', memo: '随手记录文字和想法', todo: '记录待办事项并标记完成', pomodoro: '安排专注和休息时间', countdown: '查看距离指定日期还有多久' },
	},
} } }));

const fixtures: { app: App; host: HTMLElement }[] = [];
let anchor: HTMLButtonElement;
let originalStyle: string;

function mountApp(component: Parameters<typeof h>[0], props: Record<string, unknown>): HTMLElement {
	const host = document.createElement('div');
	document.body.append(host);
	const app = createApp({ render: () => h(component, props) });
	app.directive('hotkey', hotkeyDirective);
	app.mount(host);
	fixtures.push({ app, host });
	return host;
}

async function mountPicker(dark = false): Promise<{ root: HTMLElement; choose: ReturnType<typeof vi.fn>; closed: ReturnType<typeof vi.fn> }> {
	document.documentElement.style.cssText = `font-size:14px;--MI_THEME-bg:${dark ? '#202327' : '#f2f3f5'};--MI_THEME-panel:${dark ? '#2b2f35' : '#fff'};--MI_THEME-fg:${dark ? '#d4d9e1' : '#252933'};--MI_THEME-fgTransparentWeak:${dark ? '#9099a8' : '#8a919f'};--MI_THEME-divider:${dark ? '#ffffff20' : '#00000015'};--MI_THEME-accent:#1e80ff;--MI_THEME-focus:#1e80ff;--MI_THEME-buttonBg:${dark ? '#353941' : '#f2f3f5'};--MI_THEME-fgOnAccent:#fff;--MI-radius:12px;`;
	const toolbar = mountApp({ render: () => h('button', { class: '_textButton', 'data-testid': 'widget-edit' }, '编辑小工具') }, {});
	toolbar.style.cssText = 'width:320px;max-width:calc(100vw - 32px);margin:16px;';
	anchor = toolbar.querySelector<HTMLButtonElement>('[data-testid="widget-edit"]')!;
	anchor.focus();
	const choose = vi.fn();
	const closed = vi.fn();
	const host = mountApp(MkWidgetPicker, {
		widgets: ['profile', 'instanceInfo', 'memo', 'todo', 'pomodoro', 'countdown'], returnFocusTo: anchor,
		selectedWidgets: [{ name: 'memo', id: 'memo', data: {} }, { name: 'todo', id: 'todo', data: {} }], canReset: true,
		onChoose: choose, onClosed: closed,
	});
	await nextTick();
	await document.fonts.ready;
	await expect.poll(() => host.querySelector('[role="dialog"]')?.getBoundingClientRect().height).toBeGreaterThan(100);
	return { root: host.querySelector<HTMLElement>('[role="dialog"]')!, choose, closed };
}

beforeEach(() => { originalStyle = document.documentElement.style.cssText; });
afterEach(() => {
	for (const { app, host } of fixtures.splice(0).reverse()) { app.unmount(); host.remove(); }
	document.documentElement.style.cssText = originalStyle;
});

test.each([{ mobile: false, dark: false }, { mobile: false, dark: true }, { mobile: true, dark: false }, { mobile: true, dark: true }])('uses card surfaces and fits the viewport (mobile=$mobile, dark=$dark)', async ({ mobile, dark }) => {
	await page.viewport(mobile ? 375 : 1000, 800);
	const { root } = await mountPicker(dark);
	const rect = root.getBoundingClientRect();
	expect(rect.left).toBeGreaterThanOrEqual(0);
	expect(rect.top).toBeGreaterThanOrEqual(0);
	expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
	expect(root.scrollWidth).toBe(root.clientWidth);
	if (mobile) {
		expect(rect.width).toBe(window.innerWidth);
		expect(rect.bottom).toBe(window.innerHeight);
		await expect.poll(() => document.activeElement).toBe(root);
	} else {
		expect(rect.width).toBe(520);
		expect((rect.left + rect.right) / 2).toBe(window.innerWidth / 2);
		expect((rect.top + rect.bottom) / 2).toBe(window.innerHeight / 2);
		await expect.poll(() => document.activeElement).toBe(root.querySelector('input'));
	}
	const color = dark ? 'rgb(43, 47, 53)' : 'rgb(255, 255, 255)';
	expect(getComputedStyle(root).backgroundColor).toBe(color);
	const description = root.querySelector('[data-widget] span span:last-child')!;
	expect(getComputedStyle(description).color).toBe(dark ? 'rgb(144, 153, 168)' : 'rgb(138, 145, 159)');
	await page.screenshot({ path: `../e2e/artifacts/component-browser/widget-picker-${mobile ? 'mobile' : 'desktop'}-${dark ? 'dark' : 'light'}.png` });
});

test('searches descriptions and allows full-row selection with focus restored', async () => {
	await page.viewport(1000, 800);
	const { root, choose, closed } = await mountPicker();
	await page.getByRole('textbox').fill('专注');
	expect(root.querySelectorAll('[data-widget]').length).toBe(1);
	const row = root.querySelector<HTMLElement>('[data-widget="pomodoro"]')!;
	await page.elementLocator(row).click({ position: { x: row.clientWidth - 12, y: row.clientHeight / 2 } });
	expect(choose).toHaveBeenCalledExactlyOnceWith('pomodoro');
	await expect.poll(() => closed.mock.calls.length).toBe(1);
	expect(document.activeElement).toBe(anchor);
});

test('supports Tab/Enter selection', async () => {
	await page.viewport(1000, 800);
	const { choose } = await mountPicker();
	await page.getByRole('textbox').fill('memo');
	await page.getByRole('textbox').click();
	await userEvent.keyboard('{Tab}');
	expect(document.activeElement?.getAttribute('data-widget')).toBe('memo');
	await userEvent.keyboard('{Enter}');
	expect(choose).toHaveBeenCalledExactlyOnceWith('memo');
});

test('cancels on Escape and stays usable after resizing to a short mobile viewport', async () => {
	await page.viewport(1000, 800);
	const { root, choose, closed } = await mountPicker();
	await page.viewport(320, 360);
	await expect.poll(() => root.getBoundingClientRect().width).toBe(320);
	expect(root.scrollWidth).toBe(root.clientWidth);
	const results = root.querySelector('[data-widget]')!.parentElement!;
	expect(results.scrollHeight).toBeGreaterThan(results.clientHeight);
	await page.getByRole('textbox').click();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => closed.mock.calls.length).toBe(1);
	expect(choose).not.toHaveBeenCalled();
	expect(document.activeElement).toBe(anchor);
});
