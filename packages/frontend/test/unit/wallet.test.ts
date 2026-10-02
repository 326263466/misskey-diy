/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import Wallet from '@/pages/settings/wallet.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), popupMenu: vi.fn(), confirm: vi.fn(), post: vi.fn(), refreshCheckinStatus: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ popupMenu: mocks.popupMenu, confirm: mocks.confirm, post: mocks.post }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'self' }), $i: { id: 'self' } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/composables/use-checkin-status.js', () => ({ refreshCheckinStatus: mocks.refreshCheckinStatus }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled'], template: '<button type="button" :disabled="disabled"><slot/></button>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));

const balance = { balance: 5, points: 30, reservedBalance: 10, exchangeEnabled: true, exchangeRate: 2 };
const global = { stubs: { SearchMarker: { template: '<main><slot/></main>' }, MkLoading: true, MkTime: true } };
beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.refreshCheckinStatus.mockResolvedValue(undefined);
});
afterEach(cleanup);

test('persists an uncertain exchange and reuses its request after reopening the wallet', async () => {
	const requests: unknown[] = [];
	mocks.api.mockImplementation(async (endpoint: string, data: unknown) => {
		if (endpoint === 'i/wallet') return balance;
		if (endpoint === 'i/wallet/transactions' || endpoint === 'red-packets/list') return [];
		requests.push(data);
		if (requests.length === 1) throw new Error('response lost');
		return { balance: 15, points: 25, exchanged: false, amount: 10 };
	});
	const first = render(Wallet, { global });
	await waitFor(() => expect(first.getByTestId('wallet-balance').textContent).toBe('5'));
	await fireEvent.update(first.getByLabelText(i18n.ts._wallet.exchangePoints), '5');
	await fireEvent.click(first.getByRole('button', { name: i18n.ts._wallet.exchange }));
	await waitFor(() => expect(first.getByRole('alert').textContent).toBe(i18n.ts._wallet.operationFailed));
	expect(mocks.confirm).toHaveBeenCalledOnce();
	expect(localStorage.getItem('wallet-exchange:self')).not.toBeNull();
	first.unmount();
	const second = render(Wallet, { global });
	await waitFor(() => expect(second.getByRole('button', { name: i18n.ts.retry })).toBeTruthy());
	expect((second.getByLabelText(i18n.ts._wallet.exchangePoints) as HTMLInputElement).disabled).toBe(true);
	await fireEvent.click(second.getByRole('button', { name: i18n.ts.retry }));
	await waitFor(() => expect(second.getByRole('status').textContent).toBe(i18n.ts._wallet.exchangeConfirmed));
	expect(requests[1]).toEqual(requests[0]);
	expect(localStorage.getItem('wallet-exchange:self')).toBeNull();
});

test('cancelling exchange confirmation does not create a monetary request', async () => {
	mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'i/wallet' ? balance : []);
	mocks.confirm.mockResolvedValue({ canceled: true });
	const view = render(Wallet, { global });
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._wallet.exchange })).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._wallet.exchange }));
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/wallet/exchange')).toBe(false);
	expect(localStorage.getItem('wallet-exchange:self')).toBeNull();
});

test('lists issued packets independently and provides received and claimable scopes', async () => {
	const packet = { id: 'packet', senderId: 'self', kind: 'group', mode: 'equal', coverId: 'classic', message: '', totalCoins: 20, count: 2, remainingCoins: 20, remainingCount: 2, expiresAt: '2099-01-01T00:00:00.000Z', status: 'active', claimedCoins: null };
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'i/wallet') return balance;
		if (endpoint === 'red-packets/list') return [packet];
		return [];
	});
	const view = render(Wallet, { global });
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.attachToNote })).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.attachToNote }));
	expect(mocks.post).toHaveBeenCalledWith({ initialRedPacket: packet });
	expect(view.queryByRole('button', { name: i18n.ts._redPacket.cancelUnsent })).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.history }));
	mocks.popupMenu.mock.lastCall![0].find((item: { text: string }) => item.text === i18n.ts._redPacket.received).action();
	mocks.popupMenu.mock.lastCall![2].onClosing();
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/list', expect.objectContaining({ scope: 'received' })));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.history }));
	mocks.popupMenu.mock.lastCall![0].find((item: { text: string }) => item.text === i18n.ts._redPacket.claimable).action();
	mocks.popupMenu.mock.lastCall![2].onClosing();
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/list', expect.objectContaining({ scope: 'claimable' })));
});

test('claiming a packet refreshes wallet balances and transactions without replacing the expanded card', async () => {
	const packet = { id: 'claimable', senderId: 'other', kind: 'direct', audience: 'recipients', mode: 'equal', coverId: 'classic', message: '', totalCoins: 10, count: 1, remainingCoins: 10, remainingCount: 1, expiresAt: '2099-01-01T00:00:00.000Z', status: 'active', claimedCoins: null };
	let claimed = false;
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'i/wallet') return { ...balance, balance: claimed ? 15 : 5 };
		if (endpoint === 'red-packets/list') return [packet];
		if (endpoint === 'red-packets/show') return { ...packet, claims: [] };
		if (endpoint === 'red-packets/claim') { claimed = true; return { ...packet, status: 'exhausted', claimedCoins: 10, remainingCount: 0, remainingCoins: 0, claims: [] }; }
		return [];
	});
	const view = render(Wallet, { global });
	await waitFor(() => expect(view.getByTestId('wallet-balance').textContent).toBe('5'));
	await fireEvent.click(view.getAllByRole('button', { expanded: false }).find(button => !button.hasAttribute('aria-haspopup'))!);
	await waitFor(() => expect((view.getByRole('button', { name: i18n.ts._redPacket.claim }) as HTMLButtonElement).disabled).toBe(false));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
	await waitFor(() => expect(view.getByTestId('wallet-balance').textContent).toBe('15'));
	expect(view.getByRole('button', { expanded: true })).toBeTruthy();
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'red-packets/list')).toHaveLength(1);
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'i/wallet/transactions')).toHaveLength(2);
});
