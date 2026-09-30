/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import type { FormWithDefault } from '@/utility/form.js';
import MkWidgetSettingsDialog from '@/components/MkWidgetSettingsDialog.vue';
import { i18n } from '@/i18n.js';

vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: vi.fn() }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkRange.vue', () => ({ default: {
	props: ['modelValue', 'min', 'max'], emits: ['update:modelValue'],
	template: '<label><slot name="label"/><input type="range" :value="modelValue" :min="min" :max="max" @input="$emit(\'update:modelValue\', Number($event.target.value))"/></label>',
} }));
vi.mock('@/components/MkRadios.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkForm.file.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkModalWindow.vue', () => ({ default: {
	props: ['okButtonDisabled'], emits: ['close', 'ok'],
	setup: (_props: unknown, { expose }: { expose: (value: unknown) => void }) => { expose({ close: () => {} }); },
	template: '<section><slot/><button @click="$emit(\'close\')">Cancel settings</button><button :disabled="okButtonDisabled" @click="$emit(\'ok\')">Save settings</button></section>',
} }));
vi.mock('@/components/MkPreviewWithControls.vue', () => ({ default: {
	template: '<div><slot name="preview"/><slot name="controls"/></div>',
} }));

const form = {
	label: { type: 'string', default: 'Timer', manualSave: true },
	offset: { type: 'number', default: 0 },
	enabled: { type: 'boolean', default: false },
	timezone: { type: 'string', default: null, required: false },
	thickness: { type: 'number', default: 0.2, hidden: values => !values.enabled },
	items: { type: 'array', default: [], hidden: true },
	state: { type: 'object', default: {}, hidden: true },
} satisfies FormWithDefault;

const currentSettings = {
	label: 'Customized', offset: 90, enabled: true, timezone: 'Asia/Shanghai', thickness: 0.3,
	items: [{ text: 'Keep this task', done: false }], state: { deadline: 12345 },
};

function renderSettings(current: Record<string, unknown> = currentSettings, settingsForm: FormWithDefault = form, widgetName: 'clock' | 'pomodoro' = 'clock') {
	return render(MkWidgetSettingsDialog, {
		props: { widgetName, form: settingsForm, currentSettings: current },
		global: {
			components: {
				'widget-clock': { props: ['widget'], template: '<output data-testid="preview">{{ JSON.stringify(widget.data) }}</output>' },
				'widget-pomodoro': { props: ['widget'], template: '<output data-testid="preview">{{ JSON.stringify(widget.data) }}</output>' },
				MkResult: { template: '<div/>' },
			},
			directives: { 'adaptive-border': () => {} },
		},
	});
}

describe('widget settings defaults', () => {
	beforeEach(() => {
		vi.stubGlobal('ResizeObserver', class {
			observe() {}
			disconnect() {}
		});
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	test('previews and saves original defaults without removing hidden content or timer state', async () => {
		const original = JSON.stringify(currentSettings);
		const view = renderSettings();
		expect(view.getByDisplayValue('Customized')).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.resetToDefaultValue }));
		const expected = { ...currentSettings, label: 'Timer', offset: 0, enabled: false, timezone: null, thickness: 0.2 };
		expect(JSON.parse(view.getByTestId('preview').textContent!)).toEqual(expected);
		expect(view.emitted().saved).toBeUndefined();
		expect(JSON.stringify(currentSettings)).toBe(original);
		await fireEvent.click(view.getByRole('button', { name: 'Save settings' }));
		expect(view.emitted().saved).toEqual([[expected]]);
	});

	test('canceling a reset leaves the saved configuration and content unchanged', async () => {
		const original = JSON.stringify(currentSettings);
		const view = renderSettings();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.resetToDefaultValue }));
		await fireEvent.click(view.getByRole('button', { name: 'Cancel settings' }));
		expect(view.emitted().canceled).toHaveLength(1);
		expect(view.emitted().saved).toBeUndefined();
		expect(JSON.stringify(currentSettings)).toBe(original);
	});

	test('discards an unsaved manual input even when the stored value already equals its default', async () => {
		const view = renderSettings({ ...currentSettings, label: 'Timer' });
		await fireEvent.update(view.getByDisplayValue('Timer'), 'Unsaved draft');
		expect((view.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.resetToDefaultValue }));
		expect(view.queryByDisplayValue('Unsaved draft')).toBeNull();
		expect(view.getByDisplayValue('Timer')).toBeTruthy();
		expect((view.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(false);
	});

	test('does not offer to reset widgets without configurable fields', () => {
		const view = renderSettings({ state: { remaining: 120 } }, { state: form.state });
		expect(view.queryByRole('button', { name: i18n.ts.resetToDefaultValue })).toBeNull();
	});

	test('offers reset before the pomodoro settings and restores both durations while preserving the running session', async () => {
		const state = { mode: 'rest', session: { deadline: 12345, duration: 600_000, remaining: 300_000 } };
		const current = { focusDuration: 45, restDuration: 10, state };
		const view = renderSettings(current, {
			focusDuration: { type: 'range', label: i18n.ts._widgetPomodoro.focusDuration, default: 25, min: 1, max: 180 },
			restDuration: { type: 'range', label: i18n.ts._widgetPomodoro.restDuration, default: 5, min: 1, max: 60 },
			state: { type: 'object', hidden: true, default: {} },
		}, 'pomodoro');
		const reset = view.getByRole('button', { name: i18n.ts.resetToDefaultValue });
		const focus = view.getByRole('slider', { name: i18n.ts._widgetPomodoro.focusDuration });
		expect(reset.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		await fireEvent.click(reset);
		expect((view.getByRole('slider', { name: i18n.ts._widgetPomodoro.focusDuration }) as HTMLInputElement).value).toBe('25');
		expect((view.getByRole('slider', { name: i18n.ts._widgetPomodoro.restDuration }) as HTMLInputElement).value).toBe('5');
		const expected = { focusDuration: 25, restDuration: 5, state };
		expect(JSON.parse(view.getByTestId('preview').textContent!)).toEqual(expected);
		expect(current).toEqual({ focusDuration: 45, restDuration: 10, state });
		expect(view.emitted().saved).toBeUndefined();
		await fireEvent.click(view.getByRole('button', { name: 'Save settings' }));
		expect(view.emitted().saved).toEqual([[expected]]);
	});
});
