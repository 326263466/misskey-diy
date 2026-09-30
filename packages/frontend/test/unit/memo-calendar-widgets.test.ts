/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import WidgetMemo from '@/widgets/WidgetMemo.vue';
import WidgetCalendar from '@/widgets/WidgetCalendar.vue';
import { store } from '@/store.js';
import { useLowresTime } from '@/composables/use-lowres-time.js';
import { i18n } from '@/i18n.js';

vi.mock('@/os.js', () => ({ popup: vi.fn() }));
vi.mock('@/components/MkContainer.vue', () => ({ default: { template: '<section><slot name="header"/><slot/></section>' } }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	const memo = ref<string | null>('Saved memo');
	return { store: {
		s: { memo: 'Saved memo' },
		r: { memo },
		set: vi.fn((_key: string, value: string | null) => { memo.value = value; }),
	} };
});
vi.mock('@/composables/use-lowres-time.js', async () => {
	const { ref } = await import('vue');
	const time = ref(0);
	return { useLowresTime: () => time, TIME_UPDATE_INTERVAL: 10000 };
});

beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('memo saving', () => {
	test('saves pending text on unmount without a later duplicate write', async () => {
		const view = render(WidgetMemo);
		await fireEvent.update(view.getByRole('textbox'), 'Latest draft');
		view.unmount();
		expect(store.set).toHaveBeenCalledExactlyOnceWith('memo', 'Latest draft');
		await vi.advanceTimersByTimeAsync(1500);
		expect(store.set).toHaveBeenCalledOnce();
	});

	test('manual save cancels the pending automatic save', async () => {
		const view = render(WidgetMemo);
		await fireEvent.update(view.getByRole('textbox'), 'Manual draft');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		await vi.advanceTimersByTimeAsync(1500);
		expect(store.set).toHaveBeenCalledExactlyOnceWith('memo', 'Manual draft');
	});

	test('receives synchronized text without replacing an active draft', async () => {
		const view = render(WidgetMemo);
		const input = view.getByRole('textbox') as HTMLTextAreaElement;
		store.r.memo.value = 'Synced text';
		await nextTick();
		expect(input.value).toBe('Synced text');
		await fireEvent.update(input, 'Local draft');
		store.r.memo.value = 'Another synced text';
		await nextTick();
		expect(input.value).toBe('Local draft');
	});
});

describe('calendar date boundaries', () => {
	function setTime(date: Date) {
		vi.setSystemTime(date);
		(useLowresTime() as { value: number }).value = date.getTime();
	}

	test('updates at midnight before the next shared clock tick', async () => {
		setTime(new Date(2026, 8, 24, 23, 59, 55));
		const view = render(WidgetCalendar);
		expect(view.getByText(i18n.tsx.dayX({ day: 24 }))).toBeTruthy();
		await vi.advanceTimersByTimeAsync(5000);
		expect(view.getByText(i18n.tsx.dayX({ day: 25 }))).toBeTruthy();
		expect(view.container.querySelector('b')?.textContent).toBe('0.0%');
	});

	test('uses the actual next midnight after resuming several days later', async () => {
		setTime(new Date(2026, 8, 24, 12));
		const view = render(WidgetCalendar);
		setTime(new Date(2026, 8, 28, 23, 59, 55));
		await nextTick();
		expect(view.getByText(i18n.tsx.dayX({ day: 28 }))).toBeTruthy();
		await vi.advanceTimersByTimeAsync(5000);
		expect(view.getByText(i18n.tsx.dayX({ day: 29 }))).toBeTruthy();
		expect(view.container.querySelector('b')?.textContent).toBe('0.0%');
	});

	test('cleans up the scheduled midnight update on unmount', () => {
		setTime(new Date(2026, 8, 24, 23, 59, 55));
		const baselineTimers = vi.getTimerCount();
		const view = render(WidgetCalendar);
		expect(vi.getTimerCount()).toBe(baselineTimers + 1);
		view.unmount();
		expect(vi.getTimerCount()).toBe(baselineTimers);
	});
});
