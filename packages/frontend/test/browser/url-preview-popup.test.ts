/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkUrlPreviewPopup from '@/components/MkUrlPreviewPopup.vue';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/components/MkUrlPreview.vue', async () => {
	const { h } = await import('vue');
	return { default: {
		render: () => h('article', { style: 'height:160px;box-sizing:border-box;padding:20px;background:#fff;color:#35404a;' }, [
			h('h2', { style: 'margin:0 0 12px;' }, 'Link preview'),
			h('p', 'Preview metadata appears below the link, aligned with its left edge.'),
			h('p', 'example.test'),
		]),
	} };
});

let app: App | undefined;
let host: HTMLElement | undefined;
let anchor: HTMLElement | undefined;
let originalStyle = '';

beforeEach(() => {
	originalStyle = document.documentElement.style.cssText;
	document.documentElement.style.cssText = '--MI_THEME-popup:#fff;--MI_THEME-shadow:#283b4b26;--MI-radius:12px;background:#f2f3f5;';
});

afterEach(() => {
	app?.unmount();
	host?.remove();
	anchor?.remove();
	document.documentElement.style.cssText = originalStyle;
});

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

test.each([
	{ width: 1000, x: 260, y: 140, name: 'left' },
	{ width: 1000, x: 700, y: 600, name: 'flipped' },
	{ width: 390, x: 200, y: 140, name: 'mobile' },
])('prefers the link left edge while keeping the $name preview visible', async ({ width, x, y, name }) => {
	await page.viewport(width, 760);
	anchor = document.createElement('a');
	anchor.textContent = 'https://example.test/article';
	anchor.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:160px;display:block;overflow-wrap:anywhere;`;
	document.body.append(anchor);
	host = document.createElement('div');
	document.body.append(host);
	app = createApp({ render: () => h(MkUrlPreviewPopup, { showing: true, url: 'https://example.test/article', anchorElement: anchor! }) });
	app.mount(host);
	await settle();
	const popup = host.firstElementChild as HTMLElement;
	let rect = popup.getBoundingClientRect();
	let trigger = anchor.getBoundingClientRect();
	expect(rect.left).toBeCloseTo(Math.max(0, Math.min(trigger.left, width - rect.width - 1)), 1);
	expect(rect.right).toBeLessThanOrEqual(width);
	expect(rect.top).toBeGreaterThanOrEqual(0);
	expect(rect.bottom).toBeLessThanOrEqual(760);
	if (name === 'flipped') expect(trigger.top - rect.bottom).toBeCloseTo(8, 1);
	else expect(rect.top - trigger.bottom).toBeCloseTo(8, 1);
	await page.screenshot({ path: `../e2e/artifacts/component-browser/url-preview-${name}.png` });
	anchor.style.left = '20px';
	document.dispatchEvent(new Event('scroll'));
	await settle();
	rect = popup.getBoundingClientRect();
	trigger = anchor.getBoundingClientRect();
	expect(rect.left).toBeCloseTo(trigger.left, 1);
	const preview = popup.querySelector('article')!;
	preview.style.height = '300px';
	await settle();
	rect = popup.getBoundingClientRect();
	expect(rect.bottom).toBeLessThanOrEqual(760);
});
