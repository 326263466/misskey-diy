/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkPollEditorDialog from '@/components/MkPollEditorDialog.vue';
import type { PollEditorModelValue } from '@/components/MkPollEditor.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ close: vi.fn() }));

vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		emits: ['close', 'closed'],
		setup(_props, { slots, expose, emit }) {
			expose({ close: () => { mocks.close(); emit('closed'); } });
			return () => h('section', [slots.header?.(), slots.default?.(), slots.footer?.(), h('button', { onClick: () => emit('close') }, 'Close window')]);
		},
	}) };
});

vi.mock('@/components/MkButton.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		props: { disabled: Boolean },
		emits: ['click'],
		setup(props, { slots, emit }) {
			return () => h('button', { type: 'button', disabled: props.disabled, onClick: () => emit('click') }, slots.default?.());
		},
	}) };
});

vi.mock('@/components/MkInput.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		props: ['modelValue', 'type'],
		emits: ['update:modelValue'],
		setup(props, { slots, emit }) {
			return () => h('label', [slots.label?.(), h('input', {
				type: props.type ?? 'text', value: props.modelValue,
				onInput: (event: Event) => emit('update:modelValue', props.type === 'number' ? (event.target as HTMLInputElement).valueAsNumber : (event.target as HTMLInputElement).value),
			})]);
		},
	}) };
});

vi.mock('@/components/MkSelect.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		props: ['modelValue', 'items'],
		emits: ['update:modelValue'],
		setup(props, { slots, emit }) {
			return () => h('label', [slots.label?.(), h('select', {
				value: props.modelValue, onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
			}, props.items.map((item: { value: string; label: string }) => h('option', { value: item.value }, item.label)))]);
		},
	}) };
});

vi.mock('@/components/MkSwitch.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		props: ['modelValue'],
		emits: ['update:modelValue'],
		setup(props, { slots, emit }) {
			return () => h('label', [slots.default?.(), h('input', { type: 'checkbox', checked: props.modelValue, onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked) })]);
		},
	}) };
});

function poll(overrides: Partial<PollEditorModelValue> = {}): PollEditorModelValue {
	return { choices: ['有兴趣', '没兴趣'], multiple: false, expiresAt: null, expiredAfter: null, ...overrides };
}

function renderDialog(value: PollEditorModelValue | null = poll()) {
	const done = vi.fn();
	const view = render(MkPollEditorDialog, { props: { poll: value, onDone: done } });
	return { ...view, done, save: view.getByRole('button', { name: i18n.ts.save }) as HTMLButtonElement };
}

describe('poll editor dialog', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => { cleanup(); vi.useRealTimers(); });

	test.each(['cancel', 'close'])('leaves the saved poll unchanged on %s after editing choices and settings', async action => {
		const original = poll();
		const view = renderDialog(original);
		await fireEvent.update(view.getByLabelText(i18n.tsx._poll.choiceN({ n: 1 })), '改动');
		await fireEvent.click(view.getByRole('checkbox'));
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.remove} ${i18n.tsx._poll.choiceN({ n: 2 })}` }));
		await fireEvent.click(view.getByRole('button', { name: action === 'cancel' ? i18n.ts.cancel : 'Close window' }));
		expect(original).toEqual(poll());
		expect(view.done).not.toHaveBeenCalled();
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('saves normalized choices, multiple selection and relative expiry only on confirmation', async () => {
		const view = renderDialog(null);
		expect(view.save.disabled).toBe(true);
		await fireEvent.update(view.getByLabelText(i18n.tsx._poll.choiceN({ n: 1 })), '  有兴趣  ');
		await fireEvent.update(view.getByLabelText(i18n.tsx._poll.choiceN({ n: 2 })), '没兴趣');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.add }));
		await fireEvent.click(view.getByRole('checkbox'));
		await fireEvent.update(view.getByLabelText(i18n.ts._poll.expiration), 'after');
		await fireEvent.update(view.getByLabelText(i18n.ts._poll.duration), '2');
		await fireEvent.update(view.getByLabelText(i18n.ts._poll.durationUnit), 'hour');
		expect(view.done).not.toHaveBeenCalled();
		await fireEvent.click(view.save);
		expect(view.done).toHaveBeenCalledExactlyOnceWith(poll({ multiple: true, expiredAfter: 7200000 }));
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('rejects blank, duplicate and oversized options while accepting 50 Unicode characters', async () => {
		const view = renderDialog();
		const first = view.getByLabelText(i18n.tsx._poll.choiceN({ n: 1 }));
		for (const invalid of ['  ', ' 没兴趣 ', '🎵'.repeat(51)]) {
			await fireEvent.update(first, invalid);
			expect(view.save.disabled).toBe(true);
			await fireEvent.click(view.save);
		}
		expect(view.done).not.toHaveBeenCalled();
		await fireEvent.update(first, '🎵'.repeat(50));
		expect(view.save.disabled).toBe(false);
		await fireEvent.click(view.save);
		expect(view.done).toHaveBeenCalledExactlyOnceWith(poll({ choices: ['🎵'.repeat(50), '没兴趣'] }));
	});

	test.each([0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER])('rejects invalid relative expiry %s', async expiredAfter => {
		const view = renderDialog(poll({ expiredAfter }));
		expect(view.save.disabled).toBe(true);
		await fireEvent.click(view.save);
		expect(view.done).not.toHaveBeenCalled();
	});

	test('rechecks an absolute deadline at save time and allows correcting the expired deadline', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
		const original = poll({ expiresAt: Date.now() + 60000 });
		const view = renderDialog(original);
		expect(view.save.disabled).toBe(false);
		vi.setSystemTime(new Date(Date.now() + 120000));
		await fireEvent.click(view.save);
		expect(view.done).not.toHaveBeenCalled();
		expect(view.save.disabled).toBe(true);
		await fireEvent.update(view.getByLabelText(i18n.ts._poll.expiration), 'infinite');
		expect(view.save.disabled).toBe(false);
		await fireEvent.click(view.save);
		expect(view.done).toHaveBeenCalledExactlyOnceWith(poll());
		expect(original.expiresAt).not.toBeNull();
	});

	test('removes an existing poll explicitly', async () => {
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.removePoll }));
		expect(view.done).toHaveBeenCalledExactlyOnceWith(null);
		expect(mocks.close).toHaveBeenCalledOnce();
	});
});
