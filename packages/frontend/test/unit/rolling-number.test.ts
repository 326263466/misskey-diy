/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkRollingNumber from '@/components/MkRollingNumber.vue';
import { prefer } from '@/preferences.js';

vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ animation: true }) } };
});
vi.mock('@/filters/number.js', () => ({ default: (value: number) => new Intl.NumberFormat('en-US').format(value) }));
vi.mock('@@/js/intl-const.js', () => ({ numberFormat: new Intl.NumberFormat('en-US') }));

let media: EventTarget & { matches: boolean };

function renderNumber(value: number) {
	const view = render(MkRollingNumber, {
		props: { value },
		global: { stubs: { transition: false } },
	});
	return {
		...view,
		root: view.container.firstElementChild as HTMLElement,
		labels: () => Array.from(view.container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')),
		accessible: view.container.querySelector('[aria-live="polite"]')!,
	};
}

describe('rolling number', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		prefer.s.animation = true;
		media = Object.assign(new EventTarget(), { matches: false });
		vi.spyOn(window, 'matchMedia').mockReturnValue(media as MediaQueryList);
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({
			transitionDelay: '0s',
			transitionDuration: '0.3s',
			transitionProperty: 'transform',
			animationDelay: '0s',
			animationDuration: '0s',
		} as CSSStyleDeclaration);
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	test('keeps zero visually blank and exposes one complete accessible value', async () => {
		const view = renderNumber(0);
		expect(view.labels().map(element => element.textContent)).toEqual(['']);
		expect(view.accessible.textContent).toBe('0');
		expect(view.accessible.getAttribute('aria-atomic')).toBe('true');
		await view.rerender({ value: 1 });
		expect(view.accessible.textContent).toBe('1');
		await vi.advanceTimersByTimeAsync(400);
		await view.rerender({ value: 0 });
		await vi.advanceTimersByTimeAsync(400);
		expect(view.labels().map(element => element.textContent)).toEqual(['']);
		expect(view.root.style.minWidth).toBe('1ch');
	});

	test.each([
		[9, 10, 'fromBelow', 'toAbove'],
		[10, 9, 'fromAbove', 'toBelow'],
	])('rolls %i to %i in the correct direction', async (previous, value, entering, leaving) => {
		const view = renderNumber(previous);
		await view.rerender({ value });
		expect(view.labels()).toHaveLength(2);
		expect(view.labels().find(element => element.textContent === String(value))?.className).toContain(entering);
		await vi.advanceTimersByTimeAsync(50);
		expect(view.labels().find(element => element.textContent === String(previous))?.className).toContain(leaving);
		await vi.advanceTimersByTimeAsync(400);
		expect(view.labels().map(element => element.textContent)).toEqual([String(value)]);
	});

	test('coalesces rapid changes without accumulating outgoing labels', async () => {
		const view = renderNumber(1);
		await view.rerender({ value: 2 });
		await vi.advanceTimersByTimeAsync(50);
		await view.rerender({ value: 3 });
		await view.rerender({ value: 4 });
		await view.rerender({ value: 5 });
		expect(view.accessible.textContent).toBe('5');
		expect(view.labels().map(element => element.textContent)).toEqual(['1', '2']);
		await vi.advanceTimersByTimeAsync(350);
		expect(view.labels().map(element => element.textContent)).toEqual(['2', '5']);
		await view.rerender({ value: 1 });
		expect(view.labels()).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(800);
		expect(view.labels().map(element => element.textContent)).toEqual(['1']);
	});

	test('preserves enough width when the formatted label grows and shrinks', async () => {
		const view = renderNumber(999);
		expect(view.root.style.minWidth).toBe('3ch');
		await view.rerender({ value: 1200 });
		expect(view.root.style.minWidth).toBe('4ch');
		await vi.advanceTimersByTimeAsync(400);
		expect(view.labels().map(element => element.textContent)).toEqual(['1.2K']);
		expect(view.accessible.textContent).toBe('1,200');
		await view.rerender({ value: 9 });
		await vi.advanceTimersByTimeAsync(400);
		expect(view.labels().map(element => element.textContent)).toEqual(['9']);
		expect(view.root.style.minWidth).toBe('4ch');
	});

	test('immediately shows the latest value when animations are disabled mid-roll', async () => {
		const view = renderNumber(1);
		await view.rerender({ value: 2 });
		await view.rerender({ value: 3 });
		prefer.s.animation = false;
		await nextTick();
		expect(view.labels().map(element => element.textContent)).toEqual(['3']);
		await view.rerender({ value: 4 });
		expect(view.labels().map(element => element.textContent)).toEqual(['4']);
		prefer.s.animation = true;
		await nextTick();
		await view.rerender({ value: 5 });
		await vi.advanceTimersByTimeAsync(400);
		expect(view.labels().map(element => element.textContent)).toEqual(['5']);
	});

	test('respects reduced motion changes and removes its media listener on unmount', async () => {
		media.matches = true;
		const removeListener = vi.spyOn(media, 'removeEventListener');
		const view = renderNumber(1);
		await view.rerender({ value: 2 });
		expect(view.labels().map(element => element.textContent)).toEqual(['2']);
		media.matches = false;
		media.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
		await nextTick();
		await view.rerender({ value: 3 });
		expect(view.labels()).toHaveLength(2);
		media.matches = true;
		media.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
		await nextTick();
		expect(view.labels().map(element => element.textContent)).toEqual(['3']);
		view.unmount();
		expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function));
	});
});
