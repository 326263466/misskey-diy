/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import Wallet from '@/pages/admin/wallet.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), selectUser: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, selectUser: mocks.selectUser, toast: vi.fn() }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'admin' }), $i: { id: 'admin' } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled'], template: '<button type="button" :disabled="disabled"><slot/></button>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkUserCardMini.vue', () => ({ default: { template: '<div>Selected user</div>' } }));

const global = { stubs: { PageWithHeader: { template: '<main><slot/></main>' }, MkLoading: true } };
beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.selectUser.mockResolvedValue({ id: 'selected', username: 'alice', host: null });
	mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'admin/wallet/show-settings'
		? { exchangeEnabled: true, exchangeRate: 1 }
		: { balance: 10000, adjusted: true });
});
afterEach(cleanup);

async function form(amount: number, reason = '') {
	const view = render(Wallet, { global });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.selectUser }));
	await waitFor(() => expect(view.getByText('Selected user')).toBeTruthy());
	await fireEvent.update(view.getByLabelText(i18n.ts._wallet.amount), String(amount));
	await fireEvent.update(view.getByLabelText(i18n.ts._wallet.reason), reason);
	return view;
}

test.each([10000, -10000])('confirms a %i change with only its direction and absolute amount, without requiring a reason', async amount => {
	const view = await form(amount);
	const action = amount < 0 ? i18n.ts._wallet.decrease : i18n.ts._wallet.increase;
	await fireEvent.click(view.getByRole('button', { name: action }));
	await waitFor(() => expect(view.getByRole('status')).toBeTruthy());
	expect(mocks.confirm).toHaveBeenCalledWith({
		type: 'warning', title: action, okText: action,
		text: amount < 0 ? i18n.tsx._wallet.decreaseConfirm({ amount: '10,000' }) : i18n.tsx._wallet.increaseConfirm({ amount: '10,000' }),
	});
	expect(mocks.api).toHaveBeenCalledWith('admin/wallet/adjust', { userId: 'selected', amount, reason: '', requestId: expect.any(String) });
	expect(localStorage.getItem('wallet-adjust:admin')).toBeNull();
});

test('keeps an optional reason in the request but out of the dialog', async () => {
	const view = await form(10, '  Thank you  ');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._wallet.increase }));
	await waitFor(() => expect(view.getByRole('status')).toBeTruthy());
	expect(mocks.api).toHaveBeenCalledWith('admin/wallet/adjust', expect.objectContaining({ reason: 'Thank you' }));
	expect(JSON.stringify(mocks.confirm.mock.lastCall)).not.toContain('Thank you');
	expect(JSON.stringify(mocks.confirm.mock.lastCall)).not.toContain('alice');
});

test('canceling does not send or persist an adjustment', async () => {
	mocks.confirm.mockResolvedValue({ canceled: true });
	const view = await form(-10);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._wallet.decrease }));
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'admin/wallet/adjust')).toBe(false);
	expect(localStorage.getItem('wallet-adjust:admin')).toBeNull();
});

test('an uncertain adjustment with no reason reuses the same request after reopening', async () => {
	const requests: unknown[] = [];
	mocks.api.mockImplementation(async (endpoint: string, data: unknown) => {
		if (endpoint === 'admin/wallet/show-settings') return { exchangeEnabled: true, exchangeRate: 1 };
		requests.push(data);
		if (requests.length === 1) throw new Error('response lost');
		return { balance: 10, adjusted: false };
	});
	const first = await form(10, ' \n ');
	await fireEvent.click(first.getByRole('button', { name: i18n.ts._wallet.increase }));
	await waitFor(() => expect(first.getByRole('alert').textContent).toBe(i18n.ts._wallet.operationFailed));
	first.unmount();
	const second = render(Wallet, { global });
	expect((second.getByLabelText(i18n.ts._wallet.amount) as HTMLInputElement).disabled).toBe(true);
	await fireEvent.click(second.getByRole('button', { name: i18n.ts.retry }));
	await waitFor(() => expect(second.getByRole('status')).toBeTruthy());
	expect(requests[1]).toEqual(requests[0]);
	expect(requests[0]).toMatchObject({ reason: '' });
	expect(mocks.confirm).toHaveBeenCalledOnce();
	expect(localStorage.getItem('wallet-adjust:admin')).toBeNull();
});

test.each([{ amount: 0, reason: '' }, { amount: 1.5, reason: '' }, { amount: 2000000001, reason: '' }, { amount: 1, reason: 'a'.repeat(501) }])('rejects invalid adjustment input (%#)', async ({ amount, reason }) => {
	const view = await form(amount, reason);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._wallet.increase }));
	await waitFor(() => expect(view.getByRole('alert').textContent).toBe(i18n.ts._wallet.invalidAdjustment));
	expect(mocks.confirm).not.toHaveBeenCalled();
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'admin/wallet/adjust')).toBe(false);
});
