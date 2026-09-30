/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, reactive } from 'vue';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import type { Widget } from '@/widgets/widget.js';
import { deepClone } from '@/utility/clone.js';
import { useWidgetPropsManager } from '@/widgets/widget.js';

const mocks = vi.hoisted(() => ({ popup: vi.fn() }));
vi.mock('@/os.js', () => ({ popup: mocks.popup }));

const clockPropsDef = {
	transparent: { type: 'boolean', default: false },
	size: { type: 'string', default: 'medium' },
	fadeGraduations: { type: 'boolean', default: true },
} satisfies FormWithDefault;

type ClockProps = GetFormResultType<typeof clockPropsDef>;

describe('widget props', () => {
	test.each<Partial<ClockProps>>([
		{},
		{ size: 'small', fadeGraduations: false },
	])('preserves clock defaults and saved options when another widget changes: %j', async (data) => {
		const state = reactive({
			widgets: [
				{ id: 'clock', data },
				{ id: 'onlineUsers', data: { transparent: true } },
			] as Widget<ClockProps>[],
		});
		const scope = effectScope();
		const { widgetProps } = scope.run(() => useWidgetPropsManager('clock', clockPropsDef, {
			get widget() { return state.widgets[0]; },
		}, vi.fn()))!;
		const expected = { transparent: false, size: 'medium', fadeGraduations: true, ...data };

		try {
			expect(widgetProps).toEqual(expected);
			const widgets = deepClone(state.widgets);
			widgets[1].data.transparent = false;
			state.widgets = widgets;
			await nextTick();
			expect(widgetProps).toEqual(expected);
		} finally {
			scope.stop();
		}
	});

	test('preserves false, zero and null while restoring defaults for removed options', async () => {
		const propsDef = {
			enabled: { type: 'boolean', default: true },
			offset: { type: 'number', default: 60 },
			label: { type: 'string', default: 'Clock', required: false },
		} satisfies FormWithDefault;
		const props = reactive({ widget: { id: 'clock', data: {} } as Widget<GetFormResultType<typeof propsDef>> });
		const scope = effectScope();
		const { widgetProps } = scope.run(() => useWidgetPropsManager('clock', propsDef, props, vi.fn()))!;

		try {
			props.widget.data = { enabled: false, offset: 0, label: null };
			await nextTick();
			expect(widgetProps).toEqual({ enabled: false, offset: 0, label: null });

			delete props.widget.data.offset;
			await nextTick();
			expect(widgetProps).toEqual({ enabled: false, offset: 60, label: null });
		} finally {
			scope.stop();
		}
	});

	test('opens settings with factory defaults and preserves live data when saving', async () => {
		const propsDef = {
			showHeader: { type: 'boolean', default: true },
			focusDuration: { type: 'number', default: 25 },
			state: { type: 'object', hidden: true, default: { remaining: 0 } },
		} satisfies FormWithDefault;
		const scope = effectScope();
		const emit = vi.fn();
		const { widgetProps, configure } = scope.run(() => useWidgetPropsManager('pomodoro', propsDef, {
			widget: { id: 'timer', data: { showHeader: false, focusDuration: 40, state: { remaining: 1200 } } },
		}, emit))!;
		mocks.popup.mockReset();
		mocks.popup.mockReturnValue({ dispose: vi.fn() });

		try {
			configure();
			const [, dialogProps, events] = mocks.popup.mock.calls[0];
			expect(dialogProps.form.focusDuration.default).toBe(25);
			expect(dialogProps.currentSettings.focusDuration).toBe(40);
			expect(widgetProps.focusDuration).toBe(40);
			widgetProps.state = { remaining: 0 };
			events.saved({ showHeader: true, focusDuration: 25, state: { remaining: 1200 } });
			await nextTick();
			expect(widgetProps).toEqual({ showHeader: true, focusDuration: 25, state: { remaining: 0 } });
			expect(emit).toHaveBeenCalledExactlyOnceWith('updateProps', widgetProps);
		} finally {
			scope.stop();
		}
	});

	test('keeps the configured values when the settings dialog is canceled', async () => {
		const scope = effectScope();
		const emit = vi.fn();
		const { widgetProps, configure } = scope.run(() => useWidgetPropsManager('clock', clockPropsDef, {
			widget: { id: 'clock', data: { transparent: true, size: 'large' } },
		}, emit))!;
		mocks.popup.mockReset();
		mocks.popup.mockReturnValue({ dispose: vi.fn() });

		try {
			configure();
			mocks.popup.mock.calls[0][2].canceled();
			await nextTick();
			expect(widgetProps).toEqual({ transparent: true, size: 'large', fadeGraduations: true });
			expect(emit).not.toHaveBeenCalled();
		} finally {
			scope.stop();
		}
	});
});
