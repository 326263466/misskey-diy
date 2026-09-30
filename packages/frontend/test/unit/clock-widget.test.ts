/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, ref } from 'vue';
import type { WidgetComponentExpose } from '@/widgets/widget.js';
import WidgetClock from '@/widgets/WidgetClock.vue';

const mocks = vi.hoisted(() => ({ popup: vi.fn() }));
vi.mock('@/os.js', () => ({ popup: mocks.popup }));
vi.mock('@/components/MkContainer.vue', () => ({ default: {
	props: ['naked'], template: '<section :data-naked="naked"><slot/></section>',
} }));
vi.mock('@/components/MkAnalogClock.vue', () => ({ default: {
	props: ['design', 'offset', 'thickness'], template: '<div data-testid="dial" :data-clock-design="design" :data-offset="offset" :data-thickness="thickness"/>',
} }));

const designs = ['orbit', 'hud', 'satellite', 'linear', 'digital', 'words'] as const;
const retainedSettings = { size: 'large', transparent: true, thickness: 0.3, timezone: 'asia/shanghai' };
const legacySettings = {
	...retainedSettings, graduations: 'dots', fadeGraduations: false,
	twentyFour: true, label: 'timeAndTz', sAnimation: 'none',
};

function renderClock(data: Record<string, unknown> = {}) {
	const clock = ref<WidgetComponentExpose>();
	const saved: Record<string, unknown>[] = [];
	const view = render(defineComponent({
		setup: () => () => h(WidgetClock, {
			ref: clock,
			widget: { id: 'clock', data },
			onUpdateProps: settings => saved.push(JSON.parse(JSON.stringify(settings))),
		}),
	}));
	return { ...view, saved, configure: () => clock.value!.configure() };
}

describe('clock widget designs', () => {
	beforeEach(() => {
		mocks.popup.mockReset();
		mocks.popup.mockImplementation((_component, _props, events) => {
			events.canceled();
			return { dispose: vi.fn() };
		});
	});
	afterEach(cleanup);

	test.each([{}, legacySettings, { ...legacySettings, design: 'classic' }])('renders and selects linear for missing or retired designs: %j', async data => {
		const view = renderClock(data);
		expect(view.getByTestId('dial').getAttribute('data-clock-design')).toBe('linear');
		view.configure();
		await waitFor(() => expect(mocks.popup).toHaveBeenCalledOnce());
		const { form, currentSettings } = mocks.popup.mock.calls[0][1];
		expect(form.design.default).toBe('linear');
		expect(form.design.options.map((option: { value: string }) => option.value)).toEqual(expect.arrayContaining([...designs]));
		expect(form.design.options).toHaveLength(designs.length);
		expect(currentSettings.design).toBe('linear');
		expect(Object.keys(form).sort()).toEqual(['design', 'size', 'thickness', 'timezone', 'transparent']);
	});

	test.each(designs)('preserves an explicitly saved %s design', design => {
		const view = renderClock({ ...legacySettings, design });
		expect(view.getByTestId('dial').getAttribute('data-clock-design')).toBe(design);
		expect(view.getByTestId('dial').getAttribute('data-offset')).toBe('480');
		expect(view.getByTestId('dial').getAttribute('data-thickness')).toBe('0.3');
		expect(view.getByTestId('mkw-clock').getAttribute('data-naked')).toBe('true');
		expect(view.container.textContent).toBe('');
	});

	test.each(designs)('saves and reloads %s while retaining relevant clock settings', async design => {
		mocks.popup.mockImplementation((_component, props, events) => {
			events.saved({ ...props.currentSettings, design });
			return { dispose: vi.fn() };
		});
		const view = renderClock({ ...legacySettings, design: 'classic' });
		view.configure();
		await waitFor(() => expect(view.saved).toHaveLength(1));
		expect(view.saved[0]).toMatchObject({ ...retainedSettings, design });
		expect(view.getByTestId('dial').getAttribute('data-clock-design')).toBe(design);
		view.unmount();

		const reloaded = renderClock(view.saved[0]);
		expect(reloaded.getByTestId('dial').getAttribute('data-clock-design')).toBe(design);
		expect(reloaded.getByTestId('dial').getAttribute('data-offset')).toBe('480');
		reloaded.configure();
		await waitFor(() => expect(mocks.popup).toHaveBeenCalledTimes(2));
		const { form, currentSettings } = mocks.popup.mock.calls[1][1];
		for (const [key, value] of Object.entries({ ...retainedSettings, design })) {
			expect(currentSettings[key]).toEqual(value);
		}
		expect(form.design.default).toBe('linear');
		expect(form.size.default).toBe('medium');
		expect(form.transparent.default).toBe(false);
		expect(form.thickness.hidden({ design })).toBe(design !== 'orbit' && design !== 'satellite');
		expect(form.size.hidden({ design })).toBe(design === 'linear' || design === 'digital' || design === 'words');
		for (const key of ['transparent', 'timezone']) {
			expect(form[key].hidden).toBeUndefined();
		}
	});
});
