/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkDatePicker from '@/components/MkDatePicker.vue';
import MkInput from '@/components/MkInput.vue';
import { versatileLang } from '@@/js/intl-const.js';
import { i18n } from '@/i18n.js';

vi.mock('@/os.js', () => ({}));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
afterEach(cleanup);

test('Today commits a date immediately without a second confirmation', async () => {
	const view = render(MkDatePicker, { props: { modelValue: '2024-02-01', type: 'date' } });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.today }));
	expect(view.emitted('update:modelValue')).toHaveLength(1);
	expect(view.emitted('close')).toHaveLength(1);
});

test('month and year navigation uses choices rather than opening a text input', async () => {
	const view = render(MkDatePicker, { props: { modelValue: '2024-02-01', type: 'date' } });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._datePicker.chooseMonthYear }));
	expect(view.queryByRole('textbox')).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._datePicker.chooseMonthYear }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._datePicker.next }));
	await fireEvent.click(view.getByRole('button', { name: '2028' }));
	// Resolve the localized month through the currently rendered 12-month grid.
	const choices = view.container.querySelectorAll('div[class*="choices"] button');
	expect(choices).toHaveLength(12);
	await fireEvent.click(choices[1]);
	expect(view.queryByRole('textbox')).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: new Intl.DateTimeFormat(versatileLang, { dateStyle: 'full' }).format(new Date(2028, 1, 29)) }));
	expect(view.emitted('update:modelValue')).toEqual([['2028-02-29']]);
});

test.each([
	{ modelValue: '10:00', min: '10:00:00', max: '10:00' },
	{ modelValue: '10:00:00', min: '10:00', max: '10:00:00' },
])('accepts equal bounds with different time precision: $modelValue', ({ modelValue, min, max }) => {
	const view = render(MkDatePicker, { props: { modelValue, min, max, type: 'time' } });
	expect(view.getByRole('button', { name: i18n.ts.ok })).toHaveProperty('disabled', false);
});

test('enforces minimum, maximum and step while editing time', async () => {
	const view = render(MkDatePicker, { props: { modelValue: '10:00', min: '10:00', max: '11:00', step: 900, type: 'time' } });
	await fireEvent.update(view.getByLabelText(i18n.ts._datePicker.minute), '07');
	expect(view.getByRole('button', { name: i18n.ts.ok })).toHaveProperty('disabled', true);
	await fireEvent.update(view.getByLabelText(i18n.ts._datePicker.minute), '15');
	expect(view.getByRole('button', { name: i18n.ts.ok })).toHaveProperty('disabled', false);
	await fireEvent.update(view.getByLabelText(i18n.ts._datePicker.hour), '12');
	expect(view.getByRole('button', { name: i18n.ts.ok })).toHaveProperty('disabled', true);
});

test('embedded picker updates the dialog draft and has no second confirmation button', async () => {
	const view = render(MkDatePicker, { props: { modelValue: '2026-10-01T12:00', type: 'datetime-local', embedded: true } });
	expect(view.queryByRole('button', { name: i18n.ts.ok })).toBeNull();
	expect(view.queryByRole('textbox')).toBeNull();
	await fireEvent.update(view.getByLabelText(i18n.ts._datePicker.minute), '30');
	expect(view.emitted('update:modelValue')?.at(-1)).toEqual(['2026-10-01T12:30']);
});

test('keyboard opens and dismisses the custom picker without submitting its parent', async () => {
	const enter = vi.fn();
	const view = render(MkInput, { props: { modelValue: '2026-10-01', type: 'date', onEnter: enter }, global: { directives: { 'adaptive-border': () => {} } } });
	const input = view.container.querySelector('input')!;
	expect(input.type).toBe('text');
	await fireEvent.keyDown(input, { key: 'Enter' });
	expect(view.getByRole('region', { name: i18n.ts._datePicker.title })).toBeTruthy();
	expect(enter).not.toHaveBeenCalled();
	await fireEvent.keyDown(input, { key: 'Escape' });
	expect(view.queryByRole('region')).toBeNull();
});
