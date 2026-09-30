/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import WidgetCountdown from '@/widgets/WidgetCountdown.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ alert: vi.fn(), confetti: vi.fn(), playMisskeySfx: vi.fn() }));
vi.mock('@/os.js', () => ({ alert: mocks.alert }));
vi.mock('@/utility/confetti.js', () => ({ confetti: mocks.confetti }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: mocks.playMisskeySfx }));
vi.mock('@/components/MkContainer.vue', () => ({ default: {
	template: '<section><slot name="header"/><slot/></section>',
} }));

type SavedCountdown = { title: string; target: number; notifiedTarget: number; showHeader: boolean; transparent: boolean };
const initialTime = new Date('2026-09-25T10:00:00.000Z').getTime();

function renderCountdown(settings: Partial<SavedCountdown> = {}, id = 'countdown') {
	const data = ref(settings);
	const saved: SavedCountdown[] = [];
	const view = render(defineComponent({
		setup: () => () => h(WidgetCountdown, {
			widget: { id, data: data.value },
			onUpdateProps: value => saved.push(value),
		}),
	}), { global: { directives: { 'adaptive-border': {}, tooltip: {} } } });
	return { ...view, saved, data };
}

function displayedParts(view: ReturnType<typeof renderCountdown>) {
	return [...view.getByRole('timer').children].map(part => part.firstElementChild?.textContent);
}

describe('event countdown widget', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(initialTime);
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	test('validates its local date and saves an absolute timestamp that survives reload', async () => {
		const view = renderCountdown();
		expect(view.queryByRole('timer')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetCountdown.set }));
		await fireEvent.update(view.container.querySelector('input[type="datetime-local"]')!, '');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		expect(view.getByRole('alert').textContent).toBe(i18n.ts._widgetCountdown.invalidDate);
		expect(view.saved).toHaveLength(0);
		await fireEvent.update(view.getByLabelText(i18n.ts._widgetCountdown.title), '  Launch  ');
		await fireEvent.update(view.container.querySelector('input[type="datetime-local"]')!, '2026-10-01T18:30');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		expect(view.saved).toHaveLength(1);
		expect(view.saved[0]).toMatchObject({ title: 'Launch', target: new Date('2026-10-01T18:30').getTime() });
		const saved = view.saved[0];
		view.unmount();
		const reloaded = renderCountdown(saved);
		expect(reloaded.getByText('Launch')).toBeTruthy();
		expect(reloaded.container.querySelector('time')?.getAttribute('datetime')).toBe(new Date(saved.target).toISOString());
	});

	test.each(['2026-09-25T09:59', '2026-09-25T10:00'])('rejects a past or current target: %s', async target => {
		vi.setSystemTime(new Date(2026, 8, 25, 10, 0));
		const view = renderCountdown();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetCountdown.set }));
		const input = view.getByLabelText(i18n.ts._widgetCountdown.targetDate) as HTMLInputElement;
		expect(input.min).toBe('2026-09-25T10:01');
		await fireEvent.update(input, target);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		expect(view.getByRole('alert').textContent).toBe(i18n.ts._widgetCountdown.futureDateRequired);
		expect(view.saved).toHaveLength(0);
		expect(mocks.alert).not.toHaveBeenCalled();
		expect(mocks.playMisskeySfx).not.toHaveBeenCalled();
	});

	test('accepts the next selectable minute even when it is less than a second away', async () => {
		vi.setSystemTime(new Date(2026, 8, 25, 10, 0, 59, 999));
		const view = renderCountdown();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetCountdown.set }));
		const input = view.getByLabelText(i18n.ts._widgetCountdown.targetDate) as HTMLInputElement;
		expect(input.min).toBe('2026-09-25T10:01');
		await fireEvent.update(input, '2026-09-25T10:01');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		expect(view.queryByRole('alert')).toBeNull();
		expect(view.saved).toHaveLength(1);
		expect(view.saved[0].target).toBe(new Date(2026, 8, 25, 10, 1).getTime());
		expect(displayedParts(view)).toEqual(['0', '00', '00', '01']);
		expect(mocks.alert).not.toHaveBeenCalled();
	});

	test('validates against the clock at save time even when the editor has not ticked', async () => {
		vi.setSystemTime(new Date(2026, 8, 25, 10, 0));
		const view = renderCountdown();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetCountdown.set }));
		const input = view.getByLabelText(i18n.ts._widgetCountdown.targetDate) as HTMLInputElement;
		await fireEvent.update(input, '2026-09-25T10:01');
		vi.setSystemTime(new Date(2026, 8, 25, 10, 1));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		expect(view.getByRole('alert').textContent).toBe(i18n.ts._widgetCountdown.futureDateRequired);
		expect(input.min).toBe('2026-09-25T10:02');
		expect(view.saved).toHaveLength(0);
		expect(mocks.alert).not.toHaveBeenCalled();
	});

	test('advances the native minimum while an empty countdown editor stays open and stops on cancel', async () => {
		vi.setSystemTime(new Date(2026, 8, 25, 10, 0));
		const before = vi.getTimerCount();
		const view = renderCountdown();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetCountdown.set }));
		const input = view.getByLabelText(i18n.ts._widgetCountdown.targetDate) as HTMLInputElement;
		expect(input.min).toBe('2026-09-25T10:01');
		await vi.advanceTimersByTimeAsync(60_000);
		expect(input.min).toBe('2026-09-25T10:02');
		expect(view.saved).toHaveLength(0);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
		expect(vi.getTimerCount()).toBe(before);
		expect(mocks.alert).not.toHaveBeenCalled();
	});

	test('preserves an existing expired countdown but offers a fresh target when it is edited', async () => {
		vi.setSystemTime(new Date(2026, 8, 25, 10, 0));
		const target = new Date(2026, 8, 25, 9, 59).getTime();
		const view = renderCountdown({ title: 'Previous event', target, notifiedTarget: target });
		expect(view.getByRole('status').textContent).toContain(i18n.ts._widgetCountdown.finished);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetCountdown.edit }));
		const input = view.getByLabelText(i18n.ts._widgetCountdown.targetDate) as HTMLInputElement;
		expect(input.value).toBe('2026-09-25T10:01');
		await fireEvent.update(view.getByLabelText(i18n.ts._widgetCountdown.title), 'Changed event');
		await fireEvent.update(input, '2026-09-25T09:59');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		expect(view.getByRole('alert').textContent).toBe(i18n.ts._widgetCountdown.futureDateRequired);
		expect(view.saved).toHaveLength(0);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
		expect(view.getByText('Previous event')).toBeTruthy();
		expect(view.getByRole('status').textContent).toContain(i18n.ts._widgetCountdown.finished);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetCountdown.edit }));
		await fireEvent.update(view.getByLabelText(i18n.ts._widgetCountdown.targetDate), '2026-09-25T10:02');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		expect(view.saved).toHaveLength(1);
		expect(view.saved[0]).toMatchObject({ title: 'Previous event', target: new Date(2026, 8, 25, 10, 2).getTime() });
		expect(mocks.alert).not.toHaveBeenCalled();
	});

	test('still reports an existing countdown completing while its editor is open', async () => {
		const before = vi.getTimerCount();
		const view = renderCountdown({ title: 'Event', target: initialTime + 1000 });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetCountdown.edit }));
		await vi.advanceTimersByTimeAsync(1000);
		expect(view.saved).toHaveLength(1);
		expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'success', title: i18n.ts._widgetCountdown.finished, text: 'Event' });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
		expect(view.getByRole('status').textContent).toContain(i18n.ts._widgetCountdown.finished);
		expect(vi.getTimerCount()).toBe(before);
	});

	test('uses wall-clock time after background suspension and celebrates completion only once', async () => {
		const view = renderCountdown({ title: 'Event', target: initialTime + 90061_000 });
		expect(displayedParts(view)).toEqual(['1', '01', '01', '01']);
		await vi.advanceTimersByTimeAsync(1000);
		expect(displayedParts(view)).toEqual(['1', '01', '01', '00']);
		vi.setSystemTime(initialTime + 86400_000);
		await fireEvent(document, new Event('visibilitychange'));
		expect(displayedParts(view)).toEqual(['0', '01', '01', '01']);
		expect(view.saved).toHaveLength(0);
		expect(mocks.alert).not.toHaveBeenCalled();
		vi.setSystemTime(initialTime + 90061_000);
		await fireEvent.focus(window);
		expect(view.queryByRole('timer')).toBeNull();
		expect(view.getByRole('status').textContent).toContain(i18n.ts._widgetCountdown.finished);
		await vi.advanceTimersByTimeAsync(10000);
		await fireEvent.focus(window);
		await fireEvent(document, new Event('visibilitychange'));
		expect(view.getByRole('status').textContent).toContain(i18n.ts._widgetCountdown.finished);
		expect(view.saved).toHaveLength(1);
		expect(view.saved[0].notifiedTarget).toBe(initialTime + 90061_000);
		expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'success', title: i18n.ts._widgetCountdown.finished, text: 'Event' });
		expect(mocks.confetti).toHaveBeenCalledExactlyOnceWith({ duration: 3000 });
		expect(mocks.playMisskeySfx).toHaveBeenCalledExactlyOnceWith('notification');
	});

	test('rounds partial seconds up, updates from synced props and stops its timer on unmount', async () => {
		const before = vi.getTimerCount();
		const view = renderCountdown({ target: initialTime + 1 });
		expect(displayedParts(view)).toEqual(['0', '00', '00', '01']);
		view.data.value = { target: initialTime + 7200_000, title: 'Updated remotely' };
		await nextTick();
		expect(displayedParts(view)).toEqual(['0', '02', '00', '00']);
		expect(view.getByText('Updated remotely')).toBeTruthy();
		view.unmount();
		expect(vi.getTimerCount()).toBe(before);
		expect(view.saved).toHaveLength(0);
	});

	test('notifies an overdue saved countdown once and remembers it across reloads', async () => {
		const target = initialTime - 1000;
		const view = renderCountdown({ title: 'Overdue event', target });
		expect(view.saved[0]).toMatchObject({ target, notifiedTarget: target });
		expect(mocks.alert).toHaveBeenCalledTimes(1);
		view.unmount();
		const reloaded = renderCountdown(view.saved[0]);
		await fireEvent.focus(window);
		expect(reloaded.getByRole('status').textContent).toContain(i18n.ts._widgetCountdown.finished);
		expect(reloaded.saved).toHaveLength(0);
		expect(mocks.alert).toHaveBeenCalledTimes(1);
		expect(mocks.playMisskeySfx).toHaveBeenCalledTimes(1);
	});

	test('runs a timer only for a future target and restarts when the target changes', async () => {
		const before = vi.getTimerCount();
		const view = renderCountdown();
		expect(vi.getTimerCount()).toBe(before);
		view.data.value = { target: initialTime - 1000 };
		await nextTick();
		expect(vi.getTimerCount()).toBe(before);
		view.data.value = { target: initialTime + 1000 };
		await nextTick();
		expect(vi.getTimerCount()).toBe(before + 1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(vi.getTimerCount()).toBe(before);
		expect(view.getByRole('status').textContent).toContain(i18n.ts._widgetCountdown.finished);
		view.data.value = { target: initialTime + 3000 };
		await nextTick();
		expect(vi.getTimerCount()).toBe(before + 1);
		expect(displayedParts(view)).toEqual(['0', '00', '00', '02']);
		view.data.value = {};
		await nextTick();
		expect(vi.getTimerCount()).toBe(before);
		expect(view.saved).toHaveLength(2);
		expect(mocks.alert).toHaveBeenCalledTimes(2);
	});

	test('does not start a timer or register wake-up listeners in a settings preview', async () => {
		const before = vi.getTimerCount();
		const view = renderCountdown({ target: initialTime + 10000 }, '__PREVIEW__');
		expect(vi.getTimerCount()).toBe(before);
		vi.setSystemTime(initialTime + 5000);
		await fireEvent.focus(window);
		await fireEvent(document, new Event('visibilitychange'));
		expect(displayedParts(view)).toEqual(['0', '00', '00', '10']);
		expect(view.saved).toHaveLength(0);
		view.unmount();
		renderCountdown({ target: initialTime - 1000 }, '__PREVIEW__');
		expect(mocks.alert).not.toHaveBeenCalled();
		expect(mocks.confetti).not.toHaveBeenCalled();
		expect(mocks.playMisskeySfx).not.toHaveBeenCalled();
	});

	test('cancels edits and does not affect another countdown', async () => {
		const savedA = vi.fn();
		const savedB = vi.fn();
		const view = render(defineComponent({
			setup: () => () => h('div', [
				h(WidgetCountdown, { widget: { id: 'a', data: { title: 'A', target: initialTime + 10000 } }, onUpdateProps: savedA }),
				h(WidgetCountdown, { widget: { id: 'b', data: { title: 'B', target: initialTime + 20000 } }, onUpdateProps: savedB }),
			]),
		}), { global: { directives: { 'adaptive-border': {}, tooltip: {} } } });
		const [a, b] = view.getAllByTestId('mkw-countdown').map(widget => within(widget));
		await fireEvent.click(a.getByRole('button', { name: i18n.ts._widgetCountdown.edit }));
		await fireEvent.update(a.getByLabelText(i18n.ts._widgetCountdown.title), 'Unsaved');
		await fireEvent.click(a.getByRole('button', { name: i18n.ts.cancel }));
		expect(a.getByText('A')).toBeTruthy();
		expect(b.getByText('B')).toBeTruthy();
		expect(savedA).not.toHaveBeenCalled();
		expect(savedB).not.toHaveBeenCalled();
	});
});
