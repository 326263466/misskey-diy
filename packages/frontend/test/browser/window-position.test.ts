/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkWindow from '@/components/MkWindow.vue';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true } } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { windowMinimize: 'Minimize', windowMaximize: 'Maximize', windowRestore: 'Restore', close: 'Close' } } }));

let app: App | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
	app?.unmount();
	host?.remove();
});

test.each([
	{ width: 1400, height: 1000, left: 200, top: 150 },
	{ width: 500, height: 400, left: 0, top: 0 },
])('缩放动画中调整视口到 $width × $height 时保留正确的窗口坐标', async ({ width, height, left, top }) => {
	await page.viewport(1200, 900);
	host = document.createElement('div');
	document.body.append(host);
	app = createApp({
		render: () => h(MkWindow, { initialWidth: 800, initialHeight: 600, canResize: true }, {
			header: () => 'Window',
			default: () => 'Content',
		}),
	});
	app.directive('tooltip', () => {});
	app.mount(host);
	await nextTick();
	const panel = host.querySelector<HTMLElement>('._shadow')!.parentElement!;
	panel.style.setProperty('transition', 'none', 'important');
	panel.style.setProperty('transform', 'scale(0.9)', 'important');
	expect([panel.style.left, panel.style.top]).toEqual(['200px', '150px']);
	expect(panel.getBoundingClientRect().left).toBeCloseTo(240, 1);
	expect(panel.getBoundingClientRect().top).toBeCloseTo(180, 1);

	await page.viewport(width, height);
	window.dispatchEvent(new Event('resize'));
	await nextTick();
	expect([panel.style.left, panel.style.top]).toEqual([`${left}px`, `${top}px`]);
	panel.style.setProperty('transform', 'none', 'important');
	const rect = panel.getBoundingClientRect();
	expect(rect.left).toBe(left);
	expect(rect.top).toBe(top);
	expect(rect.right).toBeLessThanOrEqual(width);
	expect(rect.bottom).toBeLessThanOrEqual(height);
});
