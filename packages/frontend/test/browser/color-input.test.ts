/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import MkColorInput from '@/components/MkColorInput.vue';

const fixtures: { app: App; host: HTMLElement }[] = [];

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

function mountColor(initial: string | null, striped = false, disabled = false, syncModel = true) {
	const model = ref(initial);
	const update = vi.fn((value: string) => { if (syncModel) model.value = value; });
	const host = document.createElement('div');
	host.style.cssText = 'width:320px;padding:20px;--MI_THEME-panel:#fff;--MI_THEME-focus:#86b300;';
	document.body.append(host);
	const app = createApp({ render: () => h(MkColorInput, { modelValue: model.value, striped, disabled, 'onUpdate:modelValue': update }, { label: () => 'Channel color' }) });
	app.directive('adaptive-border', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	return { model, update, host, input: host.querySelector('input')! };
}

test('striped preview follows the saved color while the native input stays operable', async () => {
	const { model, input, update, host } = mountColor('#000000', true);
	const preview = host.querySelector<HTMLElement>('[aria-hidden="true"]')!;
	expect(getComputedStyle(preview).backgroundImage).toContain('repeating-linear-gradient');
	expect(input.value).toBe('#000000');
	expect(input.labels?.[0].textContent).toBe('Channel color');
	expect(getComputedStyle(preview).pointerEvents).toBe('none');
	const box = preview.getBoundingClientRect();
	expect(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)).toBe(input);
	input.focus();
	expect(document.activeElement).toBe(input);
	model.value = '#39a7d8';
	await nextTick();
	expect(input.value).toBe('#39a7d8');
	expect(input.parentElement!.style.getPropertyValue('--MI-channelColor')).toBe('#39a7d8');
	expect(update).not.toHaveBeenCalled();
	input.value = '#ff8800';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await nextTick();
	expect(model.value).toBe('#ff8800');
	expect(input.parentElement!.style.getPropertyValue('--MI-channelColor')).toBe('#ff8800');
	await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/channel-color-striped-input.png' });
});

test('keeps striped color inputs disabled and ordinary color inputs solid by default', () => {
	const striped = mountColor('#39a7d8', true, true);
	expect(striped.input.disabled).toBe(true);
	striped.input.focus();
	expect(document.activeElement).not.toBe(striped.input);
	const ordinary = mountColor('#39a7d8');
	expect(ordinary.host.querySelector('[aria-hidden="true"]')).toBeNull();
	expect(ordinary.input.value).toBe('#39a7d8');
});

test('color input follows asynchronously loaded and replaced channel colors', async () => {
	const { model, input, update } = mountColor('#86b300');
	expect(input.value).toBe('#86b300');
	model.value = '#39a7d8';
	await nextTick();
	expect(input.value).toBe('#39a7d8');
	model.value = '#ff8800';
	await nextTick();
	expect(input.value).toBe('#ff8800');
	expect(update).not.toHaveBeenCalled();
});

test.each([
	['#abc', '#aabbcc'],
	['#000', '#000000'],
	['#000000', '#000000'],
])('displays saved color %s without changing the model', (saved, expected) => {
	const { model, input, update } = mountColor(saved);
	expect(input.value).toBe(expected);
	expect(model.value).toBe(saved);
	expect(update).not.toHaveBeenCalled();
});

test('choosing a color updates the form model', async () => {
	const { model, input, update } = mountColor('#39a7d8');
	input.value = '#123456';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await nextTick();
	expect(update).toHaveBeenCalledExactlyOnceWith('#123456');
	expect(model.value).toBe('#123456');
});

test.each([true, false])('previews consecutive input events before change with parent synchronization=%s', async syncModel => {
	const { model, input, update } = mountColor('#abc', true, false, syncModel);
	expect(model.value).toBe('#abc');
	expect(update).not.toHaveBeenCalled();
	for (const value of ['#ff1100', '#22cc44', '#3366ff']) {
		input.value = value;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await nextTick();
		expect(input.parentElement!.style.getPropertyValue('--MI-channelColor')).toBe(value);
		expect(model.value).toBe(syncModel ? value : '#abc');
	}
	expect(update.mock.calls.map(([value]) => value)).toEqual(['#ff1100', '#22cc44', '#3366ff']);
	input.dispatchEvent(new Event('change', { bubbles: true }));
	expect(update).toHaveBeenCalledTimes(3);
	model.value = '#000000';
	await nextTick();
	expect(input.value).toBe('#000000');
	expect(input.parentElement!.style.getPropertyValue('--MI-channelColor')).toBe('#000000');
});
