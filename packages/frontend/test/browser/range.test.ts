/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkRange from '@/components/MkRange.vue';

vi.mock('@/os.js', () => ({ popup: () => ({ dispose: vi.fn() }) }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false }));

let app: App | undefined;
let host: HTMLElement | undefined;

afterEach(() => { app?.unmount(); host?.remove(); });

async function mountRange(zoom = 1, disabled = false) {
	await page.viewport(800, 400);
	host = document.createElement('div');
	host.style.cssText = `width:400px;margin:20px;zoom:${zoom};--MI_THEME-panel:#fff;--MI_THEME-bg:#f2f3f5;--MI_THEME-inputBorder:#ddd;--MI_THEME-accent:#1682ff;`;
	document.body.append(host);
	const value = ref(.5);
	const ended = vi.fn();
	app = createApp({ render: () => h(MkRange, {
		modelValue: value.value, 'onUpdate:modelValue': (next: number) => value.value = next,
		min: 0, max: 1, step: .05, disabled, onDragEnded: ended,
	}, { label: () => '主音量' }) });
	app.directive('adaptive-border', () => {});
	app.mount(host);
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	const container = host.querySelector<HTMLElement>('.container')!;
	const thumb = host.querySelector<HTMLElement>('[role="slider"]')!;
	const point = (ratio: number) => {
		const bounds = container.getBoundingClientRect();
		const thumbWidth = thumb.getBoundingClientRect().width;
		return { x: thumbWidth / 2 + (bounds.width - thumbWidth) * ratio, y: bounds.height / 2 };
	};
	return { container, thumb, value, ended, point };
}

test.each([1, 1.25])('sets volume by clicking the track and still drags at %s zoom', async zoom => {
	const { container, value, ended, point } = await mountRange(zoom);
	await page.elementLocator(container).click({ position: point(.75) });
	expect(value.value).toBeCloseTo(.75);
	expect(ended).toHaveBeenLastCalledWith(.75);
	const bounds = container.getBoundingClientRect();
	const start = point(.25);
	container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: bounds.left + start.x, clientY: bounds.top + start.y }));
	window.dispatchEvent(new MouseEvent('mousemove', { clientX: bounds.left + point(.9).x }));
	window.dispatchEvent(new MouseEvent('mouseup'));
	expect(value.value).toBeCloseTo(.9);
});

test('supports touch track taps and keyboard volume changes', async () => {
	const { container, thumb, value, point } = await mountRange();
	const bounds = container.getBoundingClientRect();
	const tap = new Touch({ identifier: 1, target: container, clientX: bounds.left + point(.25).x, clientY: bounds.top + point(.25).y });
	container.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [tap] }));
	window.dispatchEvent(new TouchEvent('touchend'));
	expect(value.value).toBeCloseTo(.25);
	thumb.focus();
	await userEvent.keyboard('{ArrowRight}');
	expect(value.value).toBeCloseTo(.3);
	await userEvent.keyboard('{End}');
	expect(value.value).toBe(1);
	await userEvent.keyboard('{Home}');
	expect(value.value).toBe(0);
});

test('ignores disabled input and removes drag-wide styles on unmount', async () => {
	const { container, value, point } = await mountRange(1, true);
	container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: container.getBoundingClientRect().left + point(.75).x }));
	window.dispatchEvent(new MouseEvent('mouseup'));
	expect(value.value).toBe(.5);
	app!.unmount(); host!.remove();
	const active = await mountRange();
	active.container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: active.container.getBoundingClientRect().left }));
	expect(document.head.textContent).toContain('cursor: grabbing');
	app!.unmount(); app = undefined;
	expect(document.head.textContent).not.toContain('cursor: grabbing');
});
