/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import type { WidgetComponentExpose } from '@/widgets/widget.js';
import WidgetPomodoro from '@/widgets/WidgetPomodoro.vue';
import MkWidgetSettingsDialog from '@/components/MkWidgetSettingsDialog.vue';

const mocks = vi.hoisted(() => ({ popup: vi.fn(), alert: vi.fn(), confetti: vi.fn(), playMisskeySfx: vi.fn() }));
vi.mock('@/os.js', () => ({ popup: mocks.popup, alert: mocks.alert }));
vi.mock('@/utility/confetti.js', () => ({ confetti: mocks.confetti }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: mocks.playMisskeySfx }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	preview: 'Preview',
	_widgets: { pomodoro: 'Pomodoro' },
	_widgetOptions: { showHeader: 'Show header' },
	_widgetPomodoro: {
		focus: 'Focus', rest: 'Rest', focusDuration: 'Focus duration', restDuration: 'Rest duration',
		start: 'Start', pause: 'Pause', resume: 'Resume', reset: 'Reset', completed: 'Completed',
		readyFocus: 'Ready to focus', readyRest: 'Time for a break', focusing: 'Stay focused', resting: 'Taking a break', paused: 'Paused',
	},
} } }));
vi.mock('@/components/MkContainer.vue', () => ({ default: {
	template: '<section><slot name="header"/><slot/></section>',
} }));
vi.mock('@/components/MkModalWindow.vue', () => ({ default: {
	emits: ['close', 'ok'],
	setup: (_props: unknown, { expose }: { expose: (value: unknown) => void }) => { expose({ close: () => {} }); },
	template: '<section><slot/><button @click="$emit(\'close\')">Cancel settings</button><button @click="$emit(\'ok\')">Save settings</button></section>',
} }));
vi.mock('@/components/MkPreviewWithControls.vue', () => ({ default: {
	template: '<div><slot name="preview"/><slot name="controls"/></div>',
} }));
vi.mock('@/components/MkForm.vue', () => ({ default: {
	props: ['modelValue'], emits: ['update:modelValue'],
	template: '<label>Rest minutes<input type="number" :value="modelValue.restDuration" @input="$emit(\'update:modelValue\', { ...modelValue, restDuration: Number($event.target.value) })"/></label>',
} }));

function renderTimer(data: Record<string, unknown> = {}, id = 'pomodoro') {
	const widget = ref({ id, data });
	const instance = ref<WidgetComponentExpose>();
	const saved: Record<string, any>[] = [];
	const view = render(defineComponent({
		setup: () => () => h(WidgetPomodoro, {
			ref: instance,
			widget: widget.value,
			onUpdateProps: settings => saved.push(JSON.parse(JSON.stringify(settings))),
		}),
	}), { global: { directives: { tooltip: () => {} } } });
	return { ...view, saved, widget, configure: () => instance.value!.configure(), queries: within(view.container as HTMLElement) };
}

describe('pomodoro widget', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-25T01:00:00Z'));
		mocks.popup.mockReset();
		mocks.popup.mockImplementation((_component, _props, events) => {
			events.canceled();
			return { dispose: vi.fn() };
		});
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	test('starts with 25 minutes of focus and switches to 5 minutes of rest', async () => {
		const view = renderTimer();
		expect(view.queries.getByRole('timer').textContent).toBe('25:00');
		expect(view.queries.getByRole('button', { name: 'Focus', pressed: true })).toBeTruthy();
		expect(view.queries.getByRole('status').textContent?.trim()).toBe('Ready to focus');
		await fireEvent.click(view.queries.getByRole('button', { name: 'Rest' }));
		expect(view.queries.getByRole('timer').textContent).toBe('05:00');
		expect(view.queries.getByRole('button', { name: 'Rest', pressed: true })).toBeTruthy();
		expect(view.queries.getByRole('button', { name: 'Focus', pressed: false })).toBeTruthy();
		expect(view.queries.getByRole('status').textContent?.trim()).toBe('Time for a break');
		expect(view.saved).toHaveLength(1);
		expect(view.saved[0]).toMatchObject({ state: { mode: 'rest', session: null } });
	});

	test('starts, pauses and resumes without writing each second or losing rapid operations', async () => {
		const view = renderTimer();
		await fireEvent.click(view.queries.getByRole('button', { name: 'Start' }));
		expect(view.saved[0].state.session.deadline).toBe(Date.now() + 25 * 60_000);
		expect(view.queries.getByRole('status').textContent?.trim()).toBe('Stay focused');
		await vi.advanceTimersByTimeAsync(65_000);
		expect(view.queries.getByRole('timer').textContent).toBe('23:55');
		expect(view.saved).toHaveLength(1);
		await fireEvent.click(view.queries.getByRole('button', { name: 'Pause' }));
		expect(view.saved[1].state.session).toEqual({ duration: 1_500_000, remaining: 1_435_000, deadline: null });
		expect(view.queries.getByRole('status').textContent?.trim()).toBe('Paused');
		await vi.advanceTimersByTimeAsync(600_000);
		expect(view.queries.getByRole('timer').textContent).toBe('23:55');
		await fireEvent.click(view.queries.getByRole('button', { name: 'Resume' }));
		expect(view.saved[2].state.session.deadline).toBe(Date.now() + 1_435_000);
		await fireEvent.click(view.queries.getByRole('button', { name: 'Pause' }));
		expect(view.saved).toHaveLength(4);
		expect(view.saved[3].state.session.deadline).toBeNull();
	});

	test('reloads a running timer using its deadline and a paused timer using remaining time', async () => {
		const view = renderTimer();
		await fireEvent.click(view.queries.getByRole('button', { name: 'Start' }));
		const runningState = view.saved[0];
		view.unmount();
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(125_000);
		const reloaded = renderTimer(runningState);
		expect(reloaded.queries.getByRole('timer').textContent).toBe('22:55');
		await fireEvent.click(reloaded.queries.getByRole('button', { name: 'Pause' }));
		const pausedState = reloaded.saved[0];
		reloaded.unmount();
		await vi.advanceTimersByTimeAsync(600_000);
		const paused = renderTimer(pausedState);
		expect(paused.queries.getByRole('timer').textContent).toBe('22:55');
		expect(paused.queries.getByRole('button', { name: 'Resume' })).toBeTruthy();
		expect(vi.getTimerCount()).toBe(0);
	});

	test('catches up after background suspension and stops at completion without starting another stage', async () => {
		const view = renderTimer();
		await fireEvent.click(view.queries.getByRole('button', { name: 'Start' }));
		vi.setSystemTime(Date.now() + 30 * 60_000);
		await vi.advanceTimersByTimeAsync(250);
		expect(view.queries.getByRole('timer').textContent).toBe('00:00');
		expect(view.queries.getByRole('status').textContent).toBe('Completed');
		expect(view.queries.getByRole('progressbar').getAttribute('aria-label')).toBe('Focus');
		expect(view.queries.getByRole('progressbar').getAttribute('value')).toBe('1');
		expect(view.saved).toHaveLength(2);
		expect(view.saved[1].state.session).toEqual({ duration: 1_500_000, remaining: 0, deadline: null });
		expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'success', title: 'Completed', text: 'Focus' });
		expect(mocks.confetti).toHaveBeenCalledExactlyOnceWith({ duration: 3000 });
		expect(mocks.playMisskeySfx).toHaveBeenCalledExactlyOnceWith('notification');
		expect(vi.getTimerCount()).toBe(0);
		view.unmount();
		const reloaded = renderTimer(view.saved[1]);
		expect(reloaded.queries.getByRole('timer').textContent).toBe('00:00');
		expect(reloaded.queries.getByRole('status').textContent).toBe('Completed');
		await fireEvent.focus(window);
		await fireEvent(document, new Event('visibilitychange'));
		expect(reloaded.saved).toHaveLength(0);
		expect(mocks.alert).toHaveBeenCalledTimes(1);
		expect(mocks.playMisskeySfx).toHaveBeenCalledTimes(1);
	});

	test.each(['focus', 'rest'])('notifies an overdue saved %s session once and allows a new session to complete', async mode => {
		const view = renderTimer({ focusDuration: 1, restDuration: 1, state: { mode, session: { duration: 60_000, remaining: 60_000, deadline: Date.now() - 1000 } } });
		expect(view.queries.getByRole('timer').textContent).toBe('00:00');
		expect(view.saved).toHaveLength(1);
		expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'success', title: 'Completed', text: mode === 'focus' ? 'Focus' : 'Rest' });
		await fireEvent.focus(window);
		await fireEvent(document, new Event('visibilitychange'));
		expect(mocks.alert).toHaveBeenCalledTimes(1);
		await fireEvent.click(view.queries.getByRole('button', { name: 'Start' }));
		expect(view.queries.getByRole('timer').textContent).toBe('01:00');
		await vi.advanceTimersByTimeAsync(60_000);
		expect(view.queries.getByRole('timer').textContent).toBe('00:00');
		expect(mocks.alert).toHaveBeenCalledTimes(2);
		expect(mocks.playMisskeySfx).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('resets and switches modes without leaving old timers active', async () => {
		const view = renderTimer({ focusDuration: 40, restDuration: 10 });
		await fireEvent.click(view.queries.getByRole('button', { name: 'Start' }));
		await vi.advanceTimersByTimeAsync(1000);
		await fireEvent.click(view.queries.getByRole('button', { name: 'Reset' }));
		expect(view.queries.getByRole('timer').textContent).toBe('40:00');
		expect(vi.getTimerCount()).toBe(0);
		await fireEvent.click(view.queries.getByRole('button', { name: 'Start' }));
		await fireEvent.click(view.queries.getByRole('button', { name: 'Rest' }));
		expect(view.queries.getByRole('timer').textContent).toBe('10:00');
		expect(view.saved.at(-1)).toMatchObject({ state: { mode: 'rest', session: null } });
		expect(vi.getTimerCount()).toBe(0);
	});

	test('keeps separate widget instances independent and accepts synced state', async () => {
		const first = renderTimer({}, 'first');
		const second = renderTimer({ focusDuration: 10 }, 'second');
		await fireEvent.click(first.queries.getByRole('button', { name: 'Start' }));
		await vi.advanceTimersByTimeAsync(1000);
		expect(first.queries.getByRole('timer').textContent).toBe('24:59');
		expect(second.queries.getByRole('timer').textContent).toBe('10:00');
		expect(second.saved).toHaveLength(0);
		second.widget.value.data = { ...first.saved[0], state: { ...first.saved[0].state, mode: 'rest' } };
		await nextTick();
		expect(second.queries.getByRole('timer').textContent).toBe('24:59');
		expect(second.queries.getByRole('progressbar').getAttribute('aria-label')).toBe('Rest');
		await fireEvent.click(second.queries.getByRole('button', { name: 'Reset' }));
		expect(first.queries.getByRole('timer').textContent).toBe('24:59');
		expect(second.queries.getByRole('timer').textContent).toBe('05:00');
	});

	test('keeps preview timer controls disabled, with no timer or saved changes', async () => {
		const view = renderTimer({ state: { mode: 'focus', session: { duration: 1_500_000, remaining: 1_500_000, deadline: Date.now() + 1_500_000 } } }, '__PREVIEW__');
		await vi.advanceTimersByTimeAsync(3000);
		expect(view.queries.getByRole('timer').textContent).toBe('25:00');
		const start = view.queries.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
		expect(start.disabled).toBe(true);
		expect((view.queries.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(start);
		expect(view.saved).toHaveLength(0);
		expect(vi.getTimerCount()).toBe(0);
		view.unmount();
		renderTimer({ state: { mode: 'focus', session: { duration: 60_000, remaining: 60_000, deadline: Date.now() - 1000 } } }, '__PREVIEW__');
		expect(mocks.alert).not.toHaveBeenCalled();
		expect(mocks.confetti).not.toHaveBeenCalled();
		expect(mocks.playMisskeySfx).not.toHaveBeenCalled();
	});

	test('switches preview modes and reflects duration changes without changing the saved session', async () => {
		const state = { mode: 'focus', session: { duration: 1_500_000, remaining: 1_500_000, deadline: Date.now() + 1_500_000 } };
		const originalState = JSON.parse(JSON.stringify(state));
		const view = renderTimer({ focusDuration: 40, restDuration: 10, state }, '__PREVIEW__');
		expect(view.queries.getByRole('timer').textContent).toBe('40:00');
		await fireEvent.click(view.queries.getByRole('button', { name: 'Rest' }));
		expect(view.queries.getByRole('timer').textContent).toBe('10:00');
		view.widget.value.data = { focusDuration: 45, restDuration: 15, state };
		await nextTick();
		expect(view.queries.getByRole('timer').textContent).toBe('15:00');
		await fireEvent.click(view.queries.getByRole('button', { name: 'Focus' }));
		expect(view.queries.getByRole('timer').textContent).toBe('45:00');
		expect(view.queries.getByRole('progressbar').getAttribute('value')).toBe('0');
		expect(state).toEqual(originalState);
		expect(view.saved).toHaveLength(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	function renderSettings(currentSettings: Record<string, unknown>, widgetName: 'pomodoro' | 'clock' = 'pomodoro') {
		vi.stubGlobal('ResizeObserver', class {
			observe() {}
			disconnect() {}
		});
		const view = render(MkWidgetSettingsDialog, {
			props: { widgetName, form: {}, currentSettings },
			global: {
				components: { 'widget-pomodoro': WidgetPomodoro, 'widget-clock': { template: '<button>Clock preview</button>' } },
				directives: { tooltip: () => {} },
			},
		});
		return { ...view, queries: within(view.container as HTMLElement) };
	}

	test('the settings dialog permits only pomodoro preview interactions and saves configuration without the preview mode', async () => {
		const state = { mode: 'focus', session: { duration: 1_500_000, remaining: 1_500_000, deadline: Date.now() + 1_500_000 } };
		const original = { focusDuration: 25, restDuration: 5, state };
		const view = renderSettings(original);
		const rest = view.queries.getByRole('button', { name: 'Rest' });
		expect(rest.closest('[inert]')).toBeNull();
		await fireEvent.click(rest);
		expect(view.queries.getByRole('timer').textContent).toBe('05:00');
		await fireEvent.update(view.queries.getByLabelText('Rest minutes'), '12');
		expect(view.queries.getByRole('timer').textContent).toBe('12:00');
		await fireEvent.click(view.queries.getByRole('button', { name: 'Save settings' }));
		expect(view.emitted().saved).toEqual([[{ ...original, restDuration: 12 }]]);
		expect(state.mode).toBe('focus');
		expect(vi.getTimerCount()).toBe(0);
		view.unmount();
		const clock = renderSettings({}, 'clock');
		expect(clock.queries.getByRole('button', { name: 'Clock preview' }).closest('[inert]')).not.toBeNull();
	});

	test('canceling after preview mode and duration changes does not affect the running widget', async () => {
		const current = renderTimer();
		await fireEvent.click(current.queries.getByRole('button', { name: 'Start' }));
		await vi.advanceTimersByTimeAsync(60_000);
		const view = renderSettings(current.saved[0]);
		await fireEvent.click(view.queries.getByRole('button', { name: 'Rest' }));
		await fireEvent.update(view.queries.getByLabelText('Rest minutes'), '12');
		await fireEvent.click(view.queries.getByRole('button', { name: 'Cancel settings' }));
		expect(view.emitted().canceled).toHaveLength(1);
		expect(view.emitted().saved).toBeUndefined();
		view.unmount();
		expect(current.queries.getByRole('timer').textContent).toBe('24:00');
		expect(current.queries.getByRole('progressbar').getAttribute('aria-label')).toBe('Focus');
		expect(current.saved).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(current.queries.getByRole('timer').textContent).toBe('23:59');
	});

	test('exposes bounded duration settings while keeping timer state out of the settings form', async () => {
		const view = renderTimer();
		view.configure();
		await nextTick();
		const { form } = mocks.popup.mock.calls[0][1];
		expect(form.focusDuration).toMatchObject({ type: 'range', default: 25, min: 1, max: 180, step: 1 });
		expect(form.restDuration).toMatchObject({ type: 'range', default: 5, min: 1, max: 60, step: 1 });
		expect(form.state.hidden).toBe(true);
	});

	test('leaves a running timer unchanged when settings are canceled', async () => {
		const view = renderTimer();
		await fireEvent.click(view.queries.getByRole('button', { name: 'Start' }));
		await vi.advanceTimersByTimeAsync(60_000);
		view.configure();
		await nextTick();
		expect(view.queries.getByRole('timer').textContent).toBe('24:00');
		expect(view.queries.getByRole('button', { name: 'Pause' })).toBeTruthy();
		expect(view.saved).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(view.queries.getByRole('timer').textContent).toBe('23:59');
	});

	test.each(['focus', 'visibilitychange'])('catches up immediately on %s without writing state and removes its listener on unmount', async eventName => {
		const target = eventName === 'focus' ? window : window.document;
		const addListener = vi.spyOn(target, 'addEventListener');
		const removeListener = vi.spyOn(target, 'removeEventListener');
		const view = renderTimer();
		const listener = addListener.mock.calls.find(([type]) => type === eventName)![1];
		await fireEvent.click(view.queries.getByRole('button', { name: 'Start' }));
		vi.setSystemTime(Date.now() + 20 * 60_000);
		target.dispatchEvent(new Event(eventName));
		await nextTick();
		expect(view.queries.getByRole('timer').textContent).toBe('05:00');
		expect(view.saved).toHaveLength(1);
		view.unmount();
		expect(removeListener).toHaveBeenCalledWith(eventName, listener);
		expect(vi.getTimerCount()).toBe(0);
	});

	test.each([
		[{ focusDuration: -2 }, '01:00'],
		[{ focusDuration: 1000 }, '180:00'],
		[{ state: { mode: 'rest', session: null }, restDuration: 1000 }, '60:00'],
	])('bounds saved duration values: %j', (data, expected) => {
		const view = renderTimer(data);
		expect(view.queries.getByRole('timer').textContent).toBe(expected);
	});
});
