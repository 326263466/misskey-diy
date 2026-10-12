/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import WalletOverview from '@/pages/user/wallet.overview.vue';
import WalletTransactions from '@/pages/user/wallet.transactions.vue';
import WalletReceipt from '@/pages/user/wallet.transaction-receipt.vue';
import WalletPackets from '@/pages/user/wallet.red-packets.vue';
import WalletTransfers from '@/pages/user/wallet.transfers.vue';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), popup: vi.fn(), confirm: vi.fn(), post: vi.fn(), toast: vi.fn(), refreshCheckinStatus: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ popupAsyncWithDialog: mocks.popup, popup: mocks.popup, confirm: mocks.confirm, post: mocks.post, toast: mocks.toast }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'self', username: 'me' }), $i: { id: 'self', username: 'me' } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { props: ['to'], template: '<a :href="to"><slot/></a>' } }));
vi.mock('@/composables/use-checkin-status.js', () => ({ refreshCheckinStatus: mocks.refreshCheckinStatus }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled'], template: '<button type="button" :disabled="disabled"><slot/></button>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: {
	props: ['modelValue', 'items', 'disabled'],
	emits: ['update:modelValue'],
	template: '<label><slot name="label"/><select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select></label>',
} }));

const initialBalance = { balance: 5, reservedBalance: 10 };
const initialPacket = { id: 'packet', senderId: 'self', kind: 'group', audience: 'public', roomId: null, mode: 'equal', coverId: 'classic', coverFileId: null, coverUrl: null, message: 'readonly packet', password: null, totalCoins: 20, count: 2, remainingCoins: 20, remainingCount: 2, expiresAt: '2099-01-01T00:00:00.000Z', startsAt: null, serverTime: '2026-10-03T00:00:00.000Z', status: 'active', claimedCoins: null };
let balance = { ...initialBalance };
const global = { stubs: { SearchMarker: { template: '<main><slot/></main>' }, MkLoading: true, MkTime: true } };
beforeEach(() => {
	balance = { ...initialBalance };
	vi.clearAllMocks();
	localStorage.clear();
	mocks.refreshCheckinStatus.mockResolvedValue(undefined);
});
afterEach(cleanup);

test('shows one points balance and no currency exchange controls', async () => {
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'i/wallet') return balance;
		return [];
	});
	const view = render(WalletOverview, { global });
	await waitFor(() => expect(view.getByTestId('wallet-balance').textContent).toBe('5'));
	expect(view.getByText(i18n.ts._wallet.reservedBalance)).toBeTruthy();
	expect(view.queryByText(i18n.ts._wallet.exchangeTitle)).toBeNull();
	expect(view.queryByLabelText(i18n.ts._wallet.exchangePoints)).toBeNull();
});

test('红包记录只读展示并仅支持发出和收到筛选', async () => {
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'i/wallet') return balance;
		if (endpoint === 'red-packets/list') return [initialPacket];
		return [];
	});
	const view = render(WalletPackets, { global });
	await waitFor(() => expect(view.getByText('readonly packet')).toBeTruthy());
	expect(view.queryByRole('button', { name: i18n.ts._redPacket.create })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts._redPacket.attachToNote })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts._redPacket.cancelUnsent })).toBeNull();
	expect(view.queryByRole('option', { name: i18n.ts._redPacket.claimableShort })).toBeNull();
	await fireEvent.click(view.getByText('readonly packet'));
	expect(mocks.popup).not.toHaveBeenCalled();
	expect(mocks.post).not.toHaveBeenCalled();
	expect(mocks.api.mock.calls.map(([endpoint]) => endpoint)).toEqual(['red-packets/list']);
	await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.history), 'received');
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/list', expect.objectContaining({ scope: 'received' })));
});

const paginationGlobal = { stubs: { ...global.stubs, WalletTransfers: true } };

test('筛选时已有请求不会覆盖刷新后的记录', async () => {
	let resolvePending!: (value: unknown[]) => void;
	const pending = new Promise<unknown[]>(resolve => { resolvePending = resolve; });
	let requests = 0;
	mocks.api.mockImplementation((endpoint: string) => {
		if (endpoint === 'red-packets/list') return ++requests === 1 ? pending : Promise.resolve([{ ...initialPacket, id: 'new-packet', message: 'new-packet' }]);
		return Promise.resolve([]);
	});
	const view = render(WalletPackets, { global: paginationGlobal });
	await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.history), 'received');
	resolvePending([{ ...initialPacket, id: 'old-packet', message: 'old-packet' }]);
	await waitFor(() => expect(view.getByText('new-packet')).toBeTruthy());
	expect(view.queryByText('old-packet')).toBeNull();
	expect(requests).toBe(2);
});

test('转账页只打开一个弹窗，完成后更新发出记录', async () => {
	const dispose = vi.fn();
	let sent = false;
	mocks.popup.mockResolvedValue({ dispose });
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'i/wallet') return { ...balance, balance: sent ? 4 : 5 };
		return [];
	});
	const view = render(WalletTransfers, { global });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('transfers/list', expect.anything()));
	expect(view.container.querySelector('form')).toBeNull();
	const sendButton = view.getByRole('button', { name: i18n.ts._transfer.title });
	await fireEvent.click(sendButton);
	await fireEvent.click(sendButton);
	expect(mocks.popup).toHaveBeenCalledTimes(1);
	expect(sendButton).toHaveProperty('disabled', true);
	sent = true;
	mocks.popup.mock.lastCall![2].sent();
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('transfers/list', expect.objectContaining({ direction: 'sent', untilId: undefined })));
	mocks.popup.mock.lastCall![2].closed();
	await waitFor(() => expect(sendButton).toHaveProperty('disabled', false));
	expect(dispose).toHaveBeenCalledOnce();
});

test.each([false, true])('离开钱包后清理转账弹窗，包括延迟加载（%s）', async delayed => {
	const dispose = vi.fn();
	let loaded!: (result: { dispose: () => void }) => void;
	mocks.popup.mockImplementation(() => delayed ? new Promise(resolve => { loaded = resolve; }) : Promise.resolve({ dispose }));
	mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'i/wallet' ? balance : []);
	const view = render(WalletTransfers, { global: paginationGlobal });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('transfers/list', expect.anything()));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._transfer.title }));
	view.unmount();
	if (delayed) loaded({ dispose });
	await waitFor(() => expect(dispose).toHaveBeenCalledOnce());
	const requestCount = mocks.api.mock.calls.length;
	mocks.popup.mock.lastCall![2].sent();
	expect(mocks.api).toHaveBeenCalledTimes(requestCount);
});

function transactionRows(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `ledger-${index}`, type: 'redPacketClaim', amount: 1, balance: index + 1,
		description: `transaction-${index}`, createdAt: '2026-10-03T00:00:00.000Z',
	}));
}

test('交易记录分别显示打赏收支与红包收支', async () => {
	const types = ['tipSend', 'tipReceive', 'redPacketSend', 'redPacketClaim'] as const;
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'i/wallet') return balance;
		if (endpoint === 'i/wallet/transactions') return types.map((type, index) => ({ id: `transaction-${index}`, type, amount: type.endsWith('Send') ? -1 : 1, balance: 5, createdAt: '2026-10-06T00:00:00.000Z' }));
		return [];
	});
	const view = render(WalletTransactions, { global: paginationGlobal });
	for (const type of types) await waitFor(() => expect(view.getByText(i18n.ts._wallet._types[type])).toBeTruthy());
});

test('交易记录显示业务字段并打开对应凭证，冻结释放不再次扣款', async () => {
	const unknownFlow = { from: 'unknown', to: 'unknown', fromUserId: null, toUserId: null, fromUser: null, toUser: null } as const;
	const entries = [
		{ id: 'points-transaction', type: 'checkinReward', currency: 'points', amount: 3, balance: 33, reservedAmount: 0, reservedBalance: 0, description: null, relatedId: null, actorId: null, pointsSpent: null, createdAt: '2026-10-06T00:00:00.000Z', flow: unknownFlow },
		{ id: 'release-transaction', type: 'transferReservationRelease', currency: 'points', amount: 0, balance: 5, reservedAmount: -1, reservedBalance: 9, description: null, relatedId: 'transfer-business-id', actorId: null, pointsSpent: null, createdAt: '2026-10-05T00:00:00.000Z', flow: unknownFlow },
	] as const;
	const dispose = vi.fn();
	mocks.popup.mockResolvedValue({ dispose });
	mocks.api.mockImplementation(async (endpoint: string) => {
		return endpoint === 'i/wallet/transactions' ? entries : [];
	});
	const view = render(WalletTransactions, { global: paginationGlobal });
	await waitFor(() => expect(view.getByText('+3.00')).toBeTruthy());
	expect(view.queryByText('transfer-business-id')).toBeNull();
	expect(view.getAllByText(i18n.ts._wallet.statusRecorded)).toHaveLength(2);
	expect(view.getByText(i18n.tsx._wallet.reservedChange({ amount: '-1' }))).toBeTruthy();
	const release = within(view.getByText(i18n.ts._wallet._types.transferReservationRelease).closest('tr')!);
	expect(release.getByText('0')).toBeTruthy();
	const detail = release.getByRole('button', { name: i18n.ts._wallet.viewDetail });
	await fireEvent.click(detail);
	await fireEvent.click(detail);
	expect(mocks.popup).toHaveBeenCalledOnce();
	expect(mocks.popup.mock.lastCall![1]).toEqual({ entry: entries[1] });
	const receipt = render(WalletReceipt, { props: { entry: entries[1] }, global: { stubs: { ...global.stubs, MkModalWindow: { template: '<div role="dialog"><slot/></div>' } } } });
	expect(receipt.getByText('0.00')).toBeTruthy();
	expect(receipt.getByText('release-transaction')).toBeTruthy();
	expect(receipt.getByText('transfer-business-id')).toBeTruthy();
	expect(receipt.getByText(i18n.ts._wallet.columnReserved).nextElementSibling?.textContent).toBe('-1');
	expect(receipt.getByText(i18n.ts._wallet.columnBalance).nextElementSibling?.textContent).toBe('5');
	expect(receipt.getByText(i18n.ts._wallet.columnReservedBalance).nextElementSibling?.textContent).toBe('9');
	expect(receipt.getByText(i18n.ts._wallet._receipt.consumer).nextElementSibling?.textContent).toBe(i18n.ts._wallet.unknownUser);
	expect(receipt.getByText(i18n.ts._wallet._receipt.provider).nextElementSibling?.textContent).toBe(i18n.ts._wallet.unknownUser);
	mocks.popup.mock.lastCall![2].closed();
	await waitFor(() => expect(detail).toHaveProperty('disabled', false));
	expect(dispose).toHaveBeenCalledOnce();
});

test('交易分类由服务端筛选，切换时重置游标且旧响应不会覆盖新分类', async () => {
	let resolvePending!: (value: unknown[]) => void;
	const pending = new Promise<unknown[]>(resolve => { resolvePending = resolve; });
	const rows = transactionRows(7);
	mocks.api.mockImplementation(async (endpoint: string, request: { category: string; untilId?: string }) => {
		if (endpoint !== 'i/wallet/transactions') return [];
		if (request.category === 'income') return pending;
		if (request.category === 'expense') return [{ ...rows[0], description: 'expense-result', amount: -2 }];
		return request.untilId ? rows.slice(5) : rows.slice(0, 6);
	});
	const view = render(WalletTransactions, { global: paginationGlobal });
	await waitFor(() => expect(view.getByText('transaction-0')).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._wallet.nextPage }));
	await waitFor(() => expect(view.getByText('transaction-5')).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._wallet._filters.income }));
	expect(mocks.api).toHaveBeenLastCalledWith('i/wallet/transactions', { category: 'income', limit: 6, untilId: undefined });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._wallet._filters.expense }));
	await waitFor(() => expect(view.getByText('expense-result')).toBeTruthy());
	resolvePending([{ ...rows[0], description: 'stale-income-result' }]);
	await pending;
	await nextTick();
	expect(view.queryByText('stale-income-result')).toBeNull();
	expect(view.queryByRole('navigation', { name: i18n.ts._wallet.history })).toBeNull();
	for (const key of ['transfer', 'online', 'all'] as const) {
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._wallet._filters[key] }));
		expect(mocks.api).toHaveBeenLastCalledWith('i/wallet/transactions', { category: key, limit: 6, untilId: undefined });
	}
});

test.each([false, true])('离开交易页清理凭证，缓存返回刷新流水（延迟加载：%s）', async delayed => {
	const dispose = vi.fn();
	let loaded!: (result: { dispose: () => void }) => void;
	mocks.popup.mockImplementation(() => delayed ? new Promise(resolve => { loaded = resolve; }) : Promise.resolve({ dispose }));
	mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'i/wallet/transactions' ? transactionRows(1) : []);
	const pageActive = ref(true);
	const view = render(WalletTransactions, { global: { ...paginationGlobal, provide: { [DI.pageActive as symbol]: pageActive } } });
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._wallet.viewDetail })).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._wallet.viewDetail }));
	pageActive.value = false;
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._wallet.viewDetail })).toHaveProperty('disabled', false));
	if (delayed) loaded({ dispose });
	await waitFor(() => expect(dispose).toHaveBeenCalledOnce());
	mocks.api.mockClear();
	pageActive.value = true;
	await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
});

test.each([0, 5, 6, 10, 11])('replaces transaction pages and stops at the last of %i records', async count => {
	const rows = transactionRows(count);
	mocks.api.mockImplementation(async (endpoint: string, request: { limit: number; untilId?: string }) => {
		if (endpoint === 'i/wallet') return balance;
		if (endpoint !== 'i/wallet/transactions') return [];
		const start = request.untilId ? rows.findIndex(row => row.id === request.untilId) + 1 : 0;
		return rows.slice(start, start + request.limit);
	});
	const view = render(WalletTransactions, { global: paginationGlobal });
	await waitFor(() => expect(view.queryAllByText(/^transaction-\d+$/)).toHaveLength(Math.min(5, count)));
	if (count <= 5) {
		if (count === 0) await waitFor(() => expect(view.getByText(i18n.ts._wallet.empty)).toBeTruthy());
		expect(view.queryByRole('navigation', { name: i18n.ts._wallet.history })).toBeNull();
		return;
	}
	for (let page = 1; page <= Math.ceil(count / 5); page++) {
		const controls = within(view.getByRole('navigation', { name: i18n.ts._wallet.history }));
		expect(controls.getByText(i18n.tsx._wallet.historyPage({ page }))).toBeTruthy();
		expect((controls.getByRole('button', { name: i18n.ts._wallet.previousPage }) as HTMLButtonElement).disabled).toBe(page === 1);
		const next = controls.getByRole('button', { name: i18n.ts._wallet.nextPage }) as HTMLButtonElement;
		expect(next.disabled).toBe(page === Math.ceil(count / 5));
		if (next.disabled) break;
		await fireEvent.click(next);
		await waitFor(() => expect(view.queryAllByText(/^transaction-\d+$/).map(element => element.textContent)).toEqual(rows.slice(page * 5, (page + 1) * 5).map(row => row.description)));
	}
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.reload }));
	await waitFor(() => expect(view.queryAllByText(/^transaction-\d+$/).map(element => element.textContent)).toEqual(rows.slice(0, 5).map(row => row.description)));
	expect(view.getByRole('navigation', { name: i18n.ts._wallet.history }).textContent).toContain(i18n.tsx._wallet.historyPage({ page: 1 }));
});

test('replaces packet pages, returns to earlier records, and resets the cursor when filtering', async () => {
	const rows = Array.from({ length: 13 }, (_, index) => ({ ...initialPacket, id: `packet-${index}`, senderId: 'other', message: `packet-${index}` }));
	mocks.api.mockImplementation(async (endpoint: string, request: { limit: number; untilId?: string; scope: string }) => {
		if (endpoint === 'i/wallet') return balance;
		if (endpoint !== 'red-packets/list') return [];
		if (request.scope === 'received') return [{ ...rows[0], message: 'received-packet' }];
		const start = request.untilId ? rows.findIndex(row => row.id === request.untilId) + 1 : 0;
		return rows.slice(start, start + request.limit);
	});
	const view = render(WalletPackets, { global: paginationGlobal });
	await waitFor(() => expect(view.queryAllByText(/^packet-\d+$/)).toHaveLength(6));
	for (const page of [2, 3]) {
		await fireEvent.click(within(view.getByRole('navigation', { name: i18n.ts._redPacket.history })).getByRole('button', { name: i18n.ts._wallet.nextPage }));
		await waitFor(() => expect(view.queryAllByText(/^packet-\d+$/).map(element => element.textContent)).toEqual(rows.slice((page - 1) * 6, page * 6).map(row => row.message)));
	}
	const controls = within(view.getByRole('navigation', { name: i18n.ts._redPacket.history }));
	expect((controls.getByRole('button', { name: i18n.ts._wallet.nextPage }) as HTMLButtonElement).disabled).toBe(true);
	await fireEvent.click(controls.getByRole('button', { name: i18n.ts._wallet.previousPage }));
	await waitFor(() => expect(view.queryAllByText(/^packet-\d+$/).map(element => element.textContent)).toEqual(rows.slice(6, 12).map(row => row.message)));
	await fireEvent.update(view.getByRole('combobox', { name: i18n.ts._redPacket.history }), 'received');
	await waitFor(() => expect(view.getByText('received-packet')).toBeTruthy());
	expect(view.queryAllByText(/^packet-\d+$/)).toHaveLength(0);
	expect(view.queryByRole('navigation', { name: i18n.ts._redPacket.history })).toBeNull();
	expect(mocks.api).toHaveBeenCalledWith('red-packets/list', expect.objectContaining({ scope: 'received', untilId: undefined }));
});

test('retries a failed transaction page without losing the displayed page', async () => {
	const rows = transactionRows(12);
	let failed = true;
	mocks.api.mockImplementation(async (endpoint: string, request: { limit: number; untilId?: string }) => {
		if (endpoint === 'i/wallet') return balance;
		if (endpoint !== 'i/wallet/transactions') return [];
		if (request.untilId && failed) throw new Error('offline');
		return request.untilId ? rows.slice(5, 10) : rows.slice(0, request.limit);
	});
	const view = render(WalletTransactions, { global: paginationGlobal });
	await waitFor(() => expect(view.queryAllByText(/^transaction-\d+$/)).toHaveLength(5));
	await fireEvent.click(within(view.getByRole('navigation', { name: i18n.ts._wallet.history })).getByRole('button', { name: i18n.ts._wallet.nextPage }));
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts.retry })).toBeTruthy());
	expect(view.queryAllByText(/^transaction-\d+$/)).toHaveLength(5);
	expect(view.getByRole('navigation', { name: i18n.ts._wallet.history }).textContent).toContain(i18n.tsx._wallet.historyPage({ page: 1 }));
	failed = false;
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
	await waitFor(() => expect(view.queryAllByText(/^transaction-\d+$/).map(element => element.textContent)).toEqual(rows.slice(5, 10).map(row => row.description)));
	expect(view.getByRole('navigation', { name: i18n.ts._wallet.history }).textContent).toContain(i18n.tsx._wallet.historyPage({ page: 2 }));
});

test('returns to the previous transaction page when the last record disappears', async () => {
	let rows = transactionRows(6);
	mocks.api.mockImplementation(async (endpoint: string, request: { limit: number; untilId?: string }) => {
		if (endpoint === 'i/wallet') return balance;
		if (endpoint !== 'i/wallet/transactions') return [];
		const start = request.untilId ? rows.findIndex(row => row.id === request.untilId) + 1 : 0;
		return rows.slice(start, start + request.limit);
	});
	const view = render(WalletTransactions, { global: paginationGlobal });
	await waitFor(() => expect(view.queryAllByText(/^transaction-\d+$/)).toHaveLength(5));
	rows = rows.slice(0, 5);
	await fireEvent.click(within(view.getByRole('navigation', { name: i18n.ts._wallet.history })).getByRole('button', { name: i18n.ts._wallet.nextPage }));
	await waitFor(() => expect(view.queryByRole('navigation', { name: i18n.ts._wallet.history })).toBeNull());
	expect(view.queryAllByText(/^transaction-\d+$/)).toHaveLength(5);
	expect(view.queryByText(i18n.ts._wallet.empty)).toBeNull();
});
