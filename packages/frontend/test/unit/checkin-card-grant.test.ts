/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkCheckinCardGrant from '@/components/MkCheckinCardGrant.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), alert: vi.fn(), toast: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ alert: mocks.alert, toast: mocks.toast }));
vi.mock('@/components/MkButton.vue', () => ({ default: {
	props: ['type', 'disabled', 'wait'],
	template: '<button :type="type" :disabled="disabled || wait"><slot/></button>',
} }));
vi.mock('@/components/MkInput.vue', () => ({ default: {
	props: ['modelValue', 'disabled', 'min', 'max', 'step', 'required'],
	emits: ['update:modelValue'],
	template: '<label><slot name="label"/><input type="number" :value="modelValue" :disabled="disabled" :min="min" :max="max" :step="step" :required="required" @input="$emit(\'update:modelValue\', $event.target.value === \'\' ? null : Number($event.target.value))"/><slot name="caption"/></label>',
} }));
vi.mock('@/components/MkKeyValue.vue', () => ({ default: {
	template: '<div><slot name="key"/>: <slot name="value"/></div>',
} }));

function renderGrant() {
	const view = render(MkCheckinCardGrant, { props: { userId: 'target-user', points: 42, makeupCards: 3 } });
	return {
		...view,
		input: view.getByRole('spinbutton', { name: new RegExp(i18n.ts._checkin.grantAmount) }) as HTMLInputElement,
		button: view.getByRole('button', { name: i18n.ts._checkin.grantCards }) as HTMLButtonElement,
		form: view.container.querySelector('form')!,
	};
}

describe('administrator check-in card grants', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockResolvedValue({ makeupCards: 4 });
		mocks.alert.mockResolvedValue(undefined);
	});
	afterEach(cleanup);

	test('shows the current points and card balance without issuing cards on mount', () => {
		const view = renderGrant();
		expect(view.getByText(`${i18n.ts._checkin.points}: 42`)).toBeTruthy();
		expect(view.getByText(`${i18n.ts._checkin.makeupCards}: 3`)).toBeTruthy();
		expect(view.input.value).toBe('1');
		expect(view.input.min).toBe('1');
		expect(view.input.max).toBe('10000');
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test.each(['', '0', '-1', '1.5', '10001'])('rejects invalid grant amount %s even if the form is submitted directly', async amount => {
		const view = renderGrant();
		await fireEvent.update(view.input, amount);
		expect(view.button.disabled).toBe(true);
		await fireEvent.submit(view.form);
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test.each([1, 10000])('accepts amount %i and updates the balance from the server response', async amount => {
		mocks.api.mockResolvedValue({ makeupCards: amount + 8 });
		const view = renderGrant();
		await fireEvent.update(view.input, String(amount));
		await fireEvent.submit(view.form);
		await waitFor(() => expect(view.emitted('update:makeupCards')).toEqual([[amount + 8]]));
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('admin/checkin/grant-cards', { userId: 'target-user', amount });
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.tsx._checkin.grantSucceeded({ amount: amount.toLocaleString() }));
		expect(mocks.alert).not.toHaveBeenCalled();
		await view.rerender({ makeupCards: amount + 8 });
		expect(view.getByText(`${i18n.ts._checkin.makeupCards}: ${(amount + 8).toLocaleString()}`)).toBeTruthy();
	});

	test('blocks duplicate submissions and amount changes while granting cards', async () => {
		const pending = Promise.withResolvers<{ makeupCards: number }>();
		mocks.api.mockReturnValue(pending.promise);
		const view = renderGrant();
		await fireEvent.submit(view.form);
		await fireEvent.submit(view.form);
		expect(mocks.api).toHaveBeenCalledOnce();
		expect(view.button.disabled).toBe(true);
		expect(view.input.disabled).toBe(true);
		expect(view.form.getAttribute('aria-busy')).toBe('true');
		expect(view.emitted('update:makeupCards')).toBeUndefined();
		pending.resolve({ makeupCards: 4 });
		await waitFor(() => expect(view.button.disabled).toBe(false));
		expect(view.input.disabled).toBe(false);
	});

	test.each([
		['NO_SUCH_USER', () => i18n.ts.noSuchUser],
		['CHECKIN_NOT_ALLOWED', () => i18n.ts._checkin.grantNotAllowed],
		['CARD_LIMIT_EXCEEDED', () => i18n.ts._checkin.cardLimitExceeded],
		['NETWORK_ERROR', () => i18n.ts._checkin.grantFailed],
	] as const)('explains %s without changing the balance and permits retry', async (code, message) => {
		mocks.api.mockRejectedValueOnce({ code });
		const view = renderGrant();
		await fireEvent.update(view.input, '5');
		await fireEvent.submit(view.form);
		await waitFor(() => expect(view.button.disabled).toBe(false));
		expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'error', text: message() });
		expect(view.emitted('update:makeupCards')).toBeUndefined();
		expect(view.input.value).toBe('5');
		expect(mocks.toast).not.toHaveBeenCalled();
		await fireEvent.submit(view.form);
		await waitFor(() => expect(view.emitted('update:makeupCards')).toEqual([[4]]));
	});
});
