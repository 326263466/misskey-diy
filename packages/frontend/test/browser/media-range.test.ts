/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import MkMediaRange from '@/components/MkMediaRange.vue';

vi.mock('@/i18n.js', () => ({ i18n: { tsx: { _mediaControls: { buffered: ({ percent }: { percent: number }) => `${percent}% buffered` } } } }));

let app: App | undefined;
let host: HTMLDivElement | undefined;

beforeEach(async () => {
	await page.viewport(480, 320);
});

afterEach(() => {
	app?.unmount();
	host?.remove();
});

async function mountRange(durationMs: number | undefined = 120000) {
	host = document.createElement('div');
	host.style.cssText = 'position:fixed;left:0;right:0;top:60px;font:14px Arial;--MI_THEME-panel:#25282e;--MI_THEME-fg:#fff;--MI_THEME-accent:#38a;--MI_THEME-shadow:#0003;--MI-radius:6px;';
	document.body.append(host);
	const state = reactive<{ value: number; durationMs: number | undefined }>({ value: 0.5, durationMs });
	const dragEnded = vi.fn();
	app = createApp({
		render: () => h('div', [
			h(MkMediaRange, {
				modelValue: state.value,
				'onUpdate:modelValue': (value: number) => state.value = value,
				durationMs: state.durationMs,
				label: 'Playback position',
				onDragEnded: dragEnded,
			}),
			h('button', { style: 'margin-top:60px' }, 'Outside'),
		]),
	});
	app.mount(host);
	await nextTick();
	const input = host.querySelector<HTMLInputElement>('input')!;
	return { input, state, dragEnded };
}

test('previews the time under the pointer using the thumb travel without seeking', async () => {
	const { input, state, dragEnded } = await mountRange();
	const slider = page.elementLocator(input);
	for (const [x, time] of [[16, '00:02'], [240, '01:00'], [464, '01:57']] as const) {
		await slider.hover({ position: { x, y: 12 } });
		await expect.element(page.getByRole('tooltip')).toHaveTextContent(time);
	}
	expect(state.value).toBe(0.5);
	expect(dragEnded).not.toHaveBeenCalled();
	await page.getByRole('button', { name: 'Outside' }).hover();
	await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument();
});

test('clamps the preview at both ends and keeps the tooltip inside the viewport', async () => {
	const { input } = await mountRange();
	for (const [x, time] of [[1, '00:00'], [479, '02:00']] as const) {
		await page.elementLocator(input).hover({ position: { x, y: 12 } });
		const tooltip = page.getByRole('tooltip');
		await expect.element(tooltip).toHaveTextContent(time);
		const bounds = tooltip.element().getBoundingClientRect();
		expect(bounds.left).toBeGreaterThanOrEqual(0);
		expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
		expect(bounds.top).toBeGreaterThanOrEqual(0);
		expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
	}
	await page.screenshot({ path: '../e2e/artifacts/component-browser/media-range-preview.png' });
	host!.style.top = '0';
	await page.elementLocator(input).hover({ position: { x: 240, y: 12 } });
	const tooltipBounds = page.getByRole('tooltip').element().getBoundingClientRect();
	expect(tooltipBounds.top).toBeGreaterThanOrEqual(input.getBoundingClientRect().bottom);
});

test('keeps native range clicks available while showing the preview', async () => {
	const { input, state, dragEnded } = await mountRange();
	const slider = page.elementLocator(input);
	await slider.hover({ position: { x: 124, y: 12 } });
	const tooltip = page.getByRole('tooltip').element();
	expect(getComputedStyle(tooltip).pointerEvents).toBe('none');
	await slider.click({ position: { x: 124, y: 12 } });
	expect(state.value).toBeCloseTo(0.25, 2);
	expect(dragEnded).toHaveBeenCalledOnce();
});

test.each([undefined, 0, -1, NaN, Infinity])('does not preview an absent or unknown duration (%s)', async durationMs => {
	const { input, state } = await mountRange();
	state.durationMs = durationMs;
	await nextTick();
	await page.elementLocator(input).hover();
	await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument();
});

test('updates the preview when media duration becomes available or changes', async () => {
	const { input, state } = await mountRange(60000);
	await page.elementLocator(input).hover({ position: { x: 240, y: 12 } });
	await expect.element(page.getByRole('tooltip')).toHaveTextContent('00:30');
	state.durationMs = 120000;
	await expect.element(page.getByRole('tooltip')).toHaveTextContent('01:00');
	state.durationMs = Infinity;
	await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument();
});
