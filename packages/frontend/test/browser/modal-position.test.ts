/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkModal from '@/components/MkModal.vue';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));

let app: App | undefined;
let host: HTMLElement | undefined;
let anchor: HTMLElement | undefined;
let originalStyle = '';

beforeEach(() => {
	originalStyle = document.documentElement.style.cssText;
});

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

afterEach(() => {
	app?.unmount();
	host?.remove();
	anchor?.remove();
	document.documentElement.style.cssText = originalStyle;
});

test.each([1, 1.5])('浮起面板在缩放 %s 下跟随锚点并避开视口边缘', async zoom => {
	await page.viewport(1000, 800);
	anchor = document.createElement('button');
	anchor.style.cssText = `position:fixed;left:200px;top:200px;width:32px;height:32px;zoom:${zoom};`;
	document.body.append(anchor);
	host = document.createElement('div');
	document.body.append(host);
	app = createApp({
		render: () => h(MkModal, { anchorElement: anchor }, {
			default: ({ maxHeight }: { maxHeight?: number }) => h('div', {
				'data-testid': 'panel',
				style: { width: '240px', height: '300px', maxHeight: `${maxHeight}px`, overflow: 'auto' },
			}, [h('div', { style: { height: '300px' } }, '面板内容')]),
		}),
	});
	app.directive('hotkey', () => {});
	app.mount(host);
	await settle();
	const panel = host.querySelector<HTMLElement>('[data-testid="panel"]')!;
	let trigger = anchor.getBoundingClientRect();
	let rect = panel.getBoundingClientRect();
	expect(rect.top - trigger.bottom).toBeCloseTo(8, 1);
	expect(rect.left + rect.width / 2).toBeCloseTo(trigger.left + trigger.width / 2, 1);

	anchor.style.top = `${700 / zoom}px`;
	document.dispatchEvent(new Event('scroll'));
	await settle();
	trigger = anchor.getBoundingClientRect();
	rect = panel.getBoundingClientRect();
	expect(trigger.top - rect.bottom).toBeCloseTo(8, 1);

	await page.viewport(500, 420);
	anchor.style.left = `${430 / zoom}px`;
	anchor.style.top = `${200 / zoom}px`;
	window.dispatchEvent(new Event('resize'));
	await settle();
	rect = panel.getBoundingClientRect();
	expect(rect.left).toBeGreaterThanOrEqual(0);
	expect(rect.right).toBeLessThanOrEqual(500);
	expect(rect.top).toBeGreaterThanOrEqual(0);
	expect(rect.bottom).toBeLessThanOrEqual(420);
	expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);
	const settledTop = rect.top;
	await settle();
	expect(panel.getBoundingClientRect().top).toBe(settledTop);
});
