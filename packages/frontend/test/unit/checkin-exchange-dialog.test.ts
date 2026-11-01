/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import CheckinExchangeDialog from '@/pages/checkin.exchange-dialog.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ close: vi.fn() }));

vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		emits: ['click', 'esc', 'closed'],
		setup(_props, { slots, emit, expose }) {
			expose({ close: () => { mocks.close(); emit('closed'); } });
			return () => h('div', [
				slots.default?.(),
				h('button', { onClick: () => emit('click') }, 'Backdrop'),
				h('button', { onClick: () => emit('esc') }, 'Escape'),
			]);
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

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

test('shows the exchange cost and approves only once after explicit confirmation', async () => {
	const view = render(CheckinExchangeDialog, { props: { cost: 60, points: 100, canConfirm: true } });
	const dialog = view.getByRole('dialog', { name: i18n.ts._checkin.exchangeCard });
	expect(view.getByText(i18n.tsx._checkin.exchangeItem({ n: 1 }))).toBeTruthy();
	expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toContain(`60 ${i18n.ts._checkin.points}`);
	expect(view.emitted().done).toBeUndefined();
	const confirm = view.getByRole('button', { name: i18n.ts._checkin.exchangeNow });
	await fireEvent.click(confirm);
	await fireEvent.click(confirm);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
	expect(view.emitted().done).toEqual([[true]]);
	expect(mocks.close).toHaveBeenCalledOnce();
});

test.each(['cancel', 'close', 'escape', 'backdrop'] as const)('%s dismisses the exchange without approval', async action => {
	const view = render(CheckinExchangeDialog, { props: { cost: 60, points: 100, canConfirm: true } });
	const name = { cancel: i18n.ts.cancel, close: i18n.ts.close, escape: 'Escape', backdrop: 'Backdrop' }[action];
	await fireEvent.click(view.getByRole('button', { name }));
	expect(view.emitted().done).toEqual([[false]]);
	expect(mocks.close).toHaveBeenCalledOnce();
});

test.each([[25, 35], [25.23, 34.77]])('insufficient points (%s) prevent approval and show the missing amount', async (points, missing) => {
	const view = render(CheckinExchangeDialog, { props: { cost: 60, points, canConfirm: false } });
	const confirm = view.getByRole('button', { name: i18n.ts._checkin.exchangeNow }) as HTMLButtonElement;
	expect(confirm.disabled).toBe(true);
	expect(view.getByText(i18n.tsx._checkin.exchangeInsufficient({ points: missing }))).toBeTruthy();
	await fireEvent.click(confirm);
	expect(view.emitted().done).toBeUndefined();
	expect(mocks.close).not.toHaveBeenCalled();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
	expect(view.emitted().done).toEqual([[false]]);
});
