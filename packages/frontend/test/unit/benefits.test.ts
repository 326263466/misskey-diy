/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import Benefits from '@/pages/benefits.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), publish: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/composables/use-checkin-status.js', () => ({ publishCheckinStatus: mocks.publish }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'me' }) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/MkCommunityHub.vue', () => ({ default: { template: '<main><slot/></main>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: {
	props: ['type', 'disabled', 'wait'], template: '<button :type="type" :disabled="disabled || wait"><slot/></button>',
} }));
vi.mock('@/components/MkInput.vue', () => ({ default: {
	props: ['modelValue', 'disabled'], emits: ['update:modelValue'],
	template: '<label><slot name="label"/><input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)"/><slot name="caption"/></label>',
} }));

const validCode = '0123456789abcdef0123456789abcdef';
const initialStatus = { makeupCards: 2, points: 7, today: '2026-09-29', checkedInToday: true, timeZone: 'Asia/Shanghai' };
const earnedEntry = { id: 'gift', createdAt: '2026-09-29T04:00:00Z', source: 'admin', amount: 2, remaining: 1, used: 1, revoked: 0, date: null, pointsSpent: null };

function mount() {
	return render(Benefits, { global: { stubs: {
		PageWithHeader: { template: '<div><slot/></div>' },
		MkLoading: { template: '<span>loading</span>' },
		MkTime: { props: ['time'], template: '<time>{{ time }}</time>' },
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
	} } });
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'i/checkin-status') return initialStatus;
		if (endpoint === 'i/checkin-history') return { total: 1, items: [earnedEntry] };
		if (endpoint === 'i/checkin-redeem') return { newlyRedeemed: true, amount: 3, makeupCards: 5, points: 7 };
		throw new Error(`Unexpected endpoint ${endpoint}`);
	});
});
afterEach(cleanup);

describe('personal benefits', () => {
	test('only loads personal balances and history and links to the check-in calendar', async () => {
		const view = mount();
		await waitFor(() => expect(view.getByTestId('benefits-balance').textContent).toBe('2'));
		expect(view.getByText(i18n.ts._checkin._history.sourceAdmin)).toBeTruthy();
		expect(view.getByRole('link', { name: i18n.ts._benefits.goCheckin }).getAttribute('href')).toBe('/checkin');
		expect(view.getByRole('link', { name: i18n.ts._benefits.useCards }).getAttribute('href')).toBe('/checkin');
		expect(view.getByTestId('benefits-points').textContent).toBe('7');
		expect(view.getByText(i18n.ts._benefits.earnedHistoryDescription)).toBeTruthy();
		expect(mocks.api.mock.calls.map(([endpoint]) => endpoint)).toEqual(['i/checkin-status', 'i/checkin-history']);
		expect(view.queryByText(i18n.ts._checkin.grantCards)).toBeNull();
	});

	test('directs an empty wallet to get cards before using them', async () => {
		mocks.api.mockResolvedValueOnce({ ...initialStatus, makeupCards: 0 });
		const view = mount();
		await waitFor(() => expect(view.getByTestId('benefits-balance').textContent).toBe('0'));
		expect(view.getByRole('link', { name: i18n.ts._benefits.earnCards }).getAttribute('href')).toBe('/checkin');
		expect(view.queryByRole('link', { name: i18n.ts._benefits.useCards })).toBeNull();
	});

	test.each(['', 'short', 'g'.repeat(32), 'a'.repeat(31), 'a'.repeat(33)])('does not submit invalid code %s', async code => {
		const view = mount();
		await fireEvent.update(view.getByRole('textbox'), code);
		await fireEvent.submit(view.container.querySelector('form')!);
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/checkin-redeem')).toBe(false);
		expect(view.getByRole('alert').textContent).toBe(i18n.ts._benefits.invalidCodeFormat);
	});

	test('explains an invalid code on leaving the input and clears the message when corrected', async () => {
		const view = mount();
		await fireEvent.update(view.getByRole('textbox'), 'incorrect');
		await fireEvent.focusOut(view.getByRole('textbox'));
		expect(view.getByRole('alert').textContent).toBe(i18n.ts._benefits.invalidCodeFormat);
		await fireEvent.update(view.getByRole('textbox'), validCode);
		expect(view.queryByRole('alert')).toBeNull();
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/checkin-redeem')).toBe(false);
	});

	test('normalizes pasted codes, prevents duplicate submissions and refreshes history', async () => {
		const pending = Promise.withResolvers<unknown>();
		mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'i/checkin-redeem' ? pending.promise : endpoint === 'i/checkin-status' ? { ...initialStatus, makeupCards: 5 } : { total: 1, items: [earnedEntry] });
		const view = mount();
		await fireEvent.update(view.getByRole('textbox'), ` ${validCode} `);
		await fireEvent.submit(view.container.querySelector('form')!);
		await fireEvent.submit(view.container.querySelector('form')!);
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'i/checkin-redeem')).toEqual([['i/checkin-redeem', { code: validCode.toUpperCase() }]]);
		expect((view.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
		pending.resolve({ newlyRedeemed: true, amount: 3, makeupCards: 5, points: 7 });
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.tsx._benefits.redeemSucceeded({ amount: 3 })));
		expect(view.getByTestId('benefits-balance').textContent).toBe('5');
		expect((view.getByRole('textbox') as HTMLInputElement).value).toBe('');
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'i/checkin-history')).toHaveLength(2);
	});

	test('explains already-received codes without claiming another reward', async () => {
		const view = mount();
		await waitFor(() => expect(view.getByTestId('benefits-balance')).toBeTruthy());
		mocks.api.mockResolvedValueOnce({ newlyRedeemed: false, amount: 0, makeupCards: 2, points: 7 });
		await fireEvent.update(view.getByRole('textbox'), validCode);
		await fireEvent.submit(view.container.querySelector('form')!);
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._benefits.alreadyRedeemed));
	});

	test.each([
		['NO_SUCH_REDEMPTION_CODE', 'invalidCode'],
		['REDEMPTION_CODE_DISABLED', 'codeUnavailable'],
		['REDEMPTION_CODE_EXPIRED', 'codeExpired'],
		['REDEMPTION_CODE_EXHAUSTED', 'codeExhausted'],
		['NETWORK_ERROR', 'redeemFailed'],
	] as const)('keeps the code and balance when redemption fails with %s', async (code, key) => {
		const view = mount();
		await waitFor(() => expect(view.getByTestId('benefits-balance')).toBeTruthy());
		mocks.api.mockRejectedValueOnce({ code });
		await fireEvent.update(view.getByRole('textbox'), validCode);
		await fireEvent.submit(view.container.querySelector('form')!);
		await waitFor(() => expect(view.getByRole('alert').textContent).toBe(i18n.ts._benefits[key]));
		expect((view.getByRole('textbox') as HTMLInputElement).value).toBe(validCode);
		expect(view.getByTestId('benefits-balance').textContent).toBe('2');
		await fireEvent.update(view.getByRole('textbox'), 'f'.repeat(32));
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('ignores an older history request after switching record type', async () => {
		const pending = Promise.withResolvers<unknown>();
		const view = mount();
		await waitFor(() => expect(view.getByTestId('benefits-history')).toBeTruthy());
		mocks.api.mockReturnValueOnce(pending.promise);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin._history.sourceExchange }));
		expect(view.getByText(i18n.ts._benefits.exchangeHistoryDescription)).toBeTruthy();
		mocks.api.mockResolvedValueOnce({ total: 1, items: [{ ...earnedEntry, id: 'use', amount: 1, date: '2026-09-28' }] });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin._history.use }));
		await waitFor(() => expect(view.getByText(i18n.tsx._checkin.makeupDate({ date: '2026-09-28' }))).toBeTruthy());
		pending.resolve({ total: 0, items: [] });
		await Promise.resolve();
		expect(view.getByText(i18n.tsx._checkin.makeupDate({ date: '2026-09-28' }))).toBeTruthy();
	});

	test('returns to the last available history page after records are removed', async () => {
		let total = 11;
		mocks.api.mockImplementation(async (endpoint: string, params: { offset?: number }) => endpoint === 'i/checkin-status' ? initialStatus : {
			total,
			items: total > (params.offset ?? 0) ? [{ ...earnedEntry, id: String(params.offset) }] : [],
		});
		const view = mount();
		await waitFor(() => expect(view.getByTestId('benefits-history')).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.grantNextPage }));
		await waitFor(() => expect(view.getByText(i18n.tsx._checkin._history.page({ current: 2, total: 2 }))).toBeTruthy());
		total = 9;
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.reload }));
		await waitFor(() => expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-history', { type: 'earned', limit: 10, offset: 0 }));
		await waitFor(() => expect(view.getByTestId('benefits-history')).toBeTruthy());
		expect(view.queryByRole('button', { name: i18n.ts._checkin.grantNextPage })).toBeNull();
	});

	test('retries a failed balance without hiding the independent history', async () => {
		mocks.api.mockRejectedValueOnce(new Error('Offline'));
		const view = mount();
		await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
		expect(view.queryByTestId('benefits-balance')).toBeNull();
		expect(view.getByTestId('benefits-history')).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByTestId('benefits-balance').textContent).toBe('2'));
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('retains the wallet when history fails and shows an empty state after retry', async () => {
		mocks.api.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'i/checkin-status') return initialStatus;
			throw new Error('Offline');
		});
		const view = mount();
		await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
		expect(view.getByTestId('benefits-balance').textContent).toBe('2');
		mocks.api.mockResolvedValueOnce({ total: 0, items: [] });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByText(i18n.ts._checkin._history.empty)).toBeTruthy());
		expect(view.getByText(i18n.ts._benefits.earnedHistoryDescription)).toBeTruthy();
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('refreshes the personal wallet after the window regains focus', async () => {
		const view = mount();
		await waitFor(() => expect(view.getByTestId('benefits-balance').textContent).toBe('2'));
		mocks.api.mockResolvedValueOnce({ ...initialStatus, makeupCards: 9 });
		await fireEvent(window, new Event('focus'));
		await waitFor(() => expect(view.getByTestId('benefits-balance').textContent).toBe('9'));
	});
});
