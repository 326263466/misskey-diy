/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkWidgetPicker from '@/components/MkWidgetPicker.vue';
import MkWidgets from '@/components/MkWidgets.vue';
import { widgets } from '@/widgets/index.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({ popup: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/instance.js', async () => ({ instance: (await import('vue')).reactive({ federation: 'all' }) }));
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		setup(_props, { emit, slots, expose }) {
			expose({ close() { emit('closed'); } });
			return () => h('div', slots.default?.());
		},
	}) };
});
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkDraggable.vue', () => ({ default: { props: ['modelValue'], template: '<div><slot v-for="(item, index) in modelValue" :item="item" :index="index"/></div>' } }));

afterEach(cleanup);

describe('widget picker', () => {
	test('searches names, descriptions and identifiers without selecting on Enter', async () => {
		const view = render(MkWidgetPicker, { props: { widgets } });
		const input = view.getByRole('textbox');
		await fireEvent.update(input, '  CLOCK  ');
		expect(view.container.querySelectorAll('[data-widget]').length).toBe(3);
		await fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(view.emitted().choose).toBeUndefined();
		await fireEvent.update(input, 'RSS');
		expect(view.container.querySelectorAll('[data-widget]').length).toBe(2);
		await fireEvent.update(input, '___missing_widget___');
		expect(view.getByRole('status')).toBeTruthy();
		await fireEvent.update(input, '');
		expect(view.container.querySelectorAll('[data-widget]').length).toBe(widgets.length);
	});

	test('adds by clicking the row description exactly once, then closes', async () => {
		const view = render(MkWidgetPicker, { props: { widgets: ['clock'] } });
		const option = view.container.querySelector('[data-widget="clock"]')!;
		await fireEvent.click(option.querySelector('span span:last-child')!);
		await fireEvent.click(option);
		expect(view.emitted().choose).toEqual([['clock']]);
		expect(view.emitted().closed).toHaveLength(1);
	});

	test('cancel closes without adding anything', async () => {
		const view = render(MkWidgetPicker, { props: { widgets } });
		await fireEvent.click(view.container.querySelector('header button')!);
		expect(view.emitted().choose).toBeUndefined();
		expect(view.emitted().closed).toHaveLength(1);
	});

	test('Escape from search closes the picker only after IME composition finishes', async () => {
		const view = render(MkWidgetPicker, { props: { widgets } });
		await fireEvent.keyDown(view.getByRole('textbox'), { key: 'Escape', isComposing: true });
		expect(view.emitted().closed).toBeUndefined();
		await fireEvent.keyDown(view.getByRole('textbox'), { key: 'Escape' });
		expect(view.emitted().closed).toHaveLength(1);
		expect(view.emitted().choose).toBeUndefined();
	});
});

describe('direct widget editing', () => {
	const dispose = vi.fn();
	const popup = vi.mocked(os.popup<typeof MkWidgetPicker>);
	beforeEach(() => { vi.clearAllMocks(); instance.federation = 'all'; popup.mockReturnValue({ dispose }); });

	test.each([{ edit: false }, { edit: true, readOnly: true }])('does not open when %o', props => {
		render(MkWidgets, { props: { widgets: [], ...props } });
		expect(os.popup).not.toHaveBeenCalled();
	});

	test('opens immediately when editing starts, adds once and exits when closed', async () => {
		const view = render(MkWidgets, { props: { widgets: [], edit: false } });
		await view.rerender({ edit: true });
		expect(view.container.querySelector('header')).toBeNull();
		expect(os.popup).toHaveBeenCalledTimes(1);
		const events = popup.mock.calls[0][2]!;
		events.choose!('memo');
		events.choose!('memo');
		expect(view.emitted().addWidget).toEqual([[{ name: 'memo', id: expect.any(String), data: {} }]]);
		events.closed!();
		expect(view.emitted().exit).toHaveLength(1);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	test('filters federation options and rejects unavailable selections', () => {
		instance.federation = 'none';
		const view = render(MkWidgets, { props: { widgets: [], edit: true } });
		const [, props, events] = popup.mock.calls[0];
		expect(props.widgets).not.toContain('federation');
		expect(props.widgets).not.toContain('instanceCloud');
		events!.choose!('federation');
		expect(view.emitted().addWidget).toBeUndefined();
	});

	test.each([{ edit: false }, { readOnly: true }])('disposes picker and rejects stale additions when %o', async props => {
		const view = render(MkWidgets, { props: { widgets: [], edit: true } });
		const events = popup.mock.calls[0][2]!;
		await view.rerender(props);
		expect(dispose).toHaveBeenCalledTimes(1);
		events.choose!('memo');
		expect(view.emitted().addWidget).toBeUndefined();
	});

	test('shows a card while an async widget is loading', async () => {
		const { defineAsyncComponent, defineComponent } = await import('vue');
		let resolve!: (value: ReturnType<typeof defineComponent>) => void;
		const widget = defineAsyncComponent(() => new Promise<ReturnType<typeof defineComponent>>(r => { resolve = r; }));
		const view = render(MkWidgets, {
			props: { widgets: [{ name: 'memo', id: 'memo', data: {} }], edit: false },
			global: { components: { WidgetMemo: widget } },
		});
		expect(view.container.querySelector('[aria-busy="true"]')).not.toBeNull();
		resolve(defineComponent({ template: '<div data-testid="loaded-widget"/>' }));
		await waitFor(() => expect(view.getByTestId('loaded-widget')).toBeTruthy());
		expect(view.container.querySelector('[aria-busy="true"]')).toBeNull();
	});
});
