/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import MkMediaRange from '@/components/MkMediaRange.vue';

let app: App | undefined;
let host: HTMLDivElement | undefined;

beforeEach(async () => {
	await page.viewport(480, 320);
});

afterEach(() => {
	app?.unmount();
	host?.remove();
});

async function mountRange() {
	host = document.createElement('div');
	host.style.cssText = 'position:fixed;left:0;right:0;top:60px;--MI_THEME-accent:#38a';
	document.body.append(host);
	const state = reactive<{ value: string | number }>({ value: 0.5 });
	const dragEnded = vi.fn();
	app = createApp({
		render: () => h(MkMediaRange, {
			modelValue: state.value,
			'onUpdate:modelValue': (value: string | number) => { state.value = value; },
			onDragEnded: dragEnded,
		}),
	});
	app.mount(host);
	await nextTick();
	const input = host.querySelector<HTMLInputElement>('input')!;
	return { input, state, dragEnded };
}

test('keeps native range clicks available and reports the committed value', async () => {
	const { input, state, dragEnded } = await mountRange();
	await page.elementLocator(input).click({ position: { x: 124, y: 12 } });
	expect(Number(state.value)).toBeCloseTo(0.25, 2);
	expect(dragEnded).toHaveBeenCalledOnce();
	expect(dragEnded).toHaveBeenCalledWith(Number(state.value));
});
