/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import type { entities } from 'misskey-js';
import AdminCheckin from '@/pages/admin/checkin.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), popup: vi.fn(), alert: vi.fn(), confirm: vi.fn(), toast: vi.fn(), dispose: vi.fn(), stats: vi.fn(), history: vi.fn(), showUser: vi.fn(), grant: vi.fn(), revoke: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ popup: mocks.popup, alert: mocks.alert, confirm: mocks.confirm, toast: mocks.toast }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/MkButton.vue', () => ({ default: {
	props: ['type', 'disabled', 'wait'],
	template: '<button :type="type ?? \'button\'" :disabled="disabled || wait"><slot/></button>',
} }));
vi.mock('@/components/MkInput.vue', () => ({ default: {
	props: ['modelValue', 'disabled', 'min', 'max', 'step', 'required'],
	emits: ['update:modelValue'],
	template: '<label><slot name="label"/><input type="number" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', Number($event.target.value))"/></label>',
} }));
vi.mock('@/components/MkKeyValue.vue', () => ({ default: { template: '<div><slot name="key"/>: <slot name="value"/></div>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkUserCardMini.vue', () => ({ default: { props: ['user', 'withChart'], template: '<div data-testid="recipient" :data-with-chart="withChart">@{{ user.username }}</div>' } }));

const overview = { grantedCards: 120, grantCount: 9, grantedUsers: 4, usedCards: 30, usedUsers: 6, exchangedCards: 12, availableCards: 105 };

function record(overrides = {}) {
	return { id: 'record-1', userId: 'alice-id', user: recipient(), operator: recipient({ id: 'admin-id', username: 'admin' }), recipientUsername: 'alice', amount: 5, before: 3, after: 8, createdAt: '2026-09-29T03:00:00.000Z', date: null, pointsSpent: null, batchId: 'batch-1', usageStatus: 'partial', used: 2, remaining: 3, revoked: 0, ...overrides };
}

function recipient(overrides = {}): entities.UserDetailed {
	return { id: 'alice-id', username: 'alice', host: null, isSuspended: false, movedTo: null, ...overrides } as entities.UserDetailed;
}

function renderPage() {
	return render(AdminCheckin, { global: { stubs: {
		PageWithHeader: { template: '<main><slot/></main>' },
		MkLoading: { template: '<div role="status">Loading</div>' },
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		MkTime: { props: ['time'], template: '<time>{{ time }}</time>' },
	} } });
}

async function choose(view: ReturnType<typeof renderPage>, user = recipient()) {
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.selectUser }));
	const callbacks = mocks.popup.mock.lastCall![2];
	callbacks.ok(user);
	callbacks.closed();
}

describe('standalone administrator check-in grants', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.popup.mockReturnValue({ dispose: mocks.dispose });
		mocks.stats.mockResolvedValue(overview);
		mocks.history.mockResolvedValue({ total: 1, items: [record()] });
		mocks.showUser.mockResolvedValue({ checkinPoints: 42, checkinMakeupCards: 3, isSuspended: false });
		mocks.grant.mockResolvedValue({ makeupCards: 8 });
		mocks.confirm.mockResolvedValue({ canceled: false });
		mocks.revoke.mockResolvedValue({ batchId: 'batch-1', revokedCards: 3, makeupCards: 0 });
		mocks.api.mockImplementation((endpoint, params) => {
			if (endpoint === 'admin/checkin/stats') return mocks.stats(params);
			if (endpoint === 'admin/checkin/history') return mocks.history(params);
			if (endpoint === 'admin/show-user') return mocks.showUser(params);
			if (endpoint === 'admin/checkin/grant-cards') return mocks.grant(params);
			if (endpoint === 'admin/checkin/revoke-cards') return mocks.revoke(params);
			throw new Error(`Unexpected endpoint: ${endpoint}`);
		});
	});
	afterEach(cleanup);

	test('opens a local user picker without issuing cards and allows canceled selection to reopen', async () => {
		const view = renderPage();
		expect(view.getByText(i18n.ts._checkin.grantDescription)).toBeTruthy();
		expect(view.queryByRole('spinbutton')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.selectUser }));
		expect(mocks.popup.mock.lastCall![1]).toEqual({ includeSelf: true, localOnly: true });
		expect(view.getByRole('button', { name: i18n.ts.selectUser })).toHaveProperty('disabled', true);
		mocks.popup.mock.lastCall![2].closed();
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts.selectUser })).toHaveProperty('disabled', false));
		expect(mocks.dispose).toHaveBeenCalledOnce();
		expect(mocks.showUser).not.toHaveBeenCalled();
		expect(mocks.grant).not.toHaveBeenCalled();
	});

	test('immediately displays the selected user and grant form and updates the balance on success', async () => {
		const view = renderPage();
		await choose(view);
		const input = await view.findByRole('spinbutton', { name: i18n.ts._checkin.grantAmount });
		expect(view.getByTestId('recipient').textContent).toBe('@alice');
		expect(mocks.showUser).toHaveBeenCalledExactlyOnceWith({ userId: 'alice-id' });
		expect(view.getByText(`${i18n.ts._checkin.points}: 42`)).toBeTruthy();
		await fireEvent.update(input, '5');
		await fireEvent.submit(view.container.querySelector('form')!);
		await waitFor(() => expect(view.getByText(`${i18n.ts._checkin.makeupCards}: 8`)).toBeTruthy());
		expect(mocks.grant).toHaveBeenCalledExactlyOnceWith({ userId: 'alice-id', amount: 5 });
		expect(mocks.stats).toHaveBeenCalledTimes(2);
		expect(mocks.history).toHaveBeenCalledTimes(2);
	});

	test('keeps the recipient fixed while a grant is pending and resets amount when switching users', async () => {
		const view = renderPage();
		await choose(view);
		const input = await view.findByRole('spinbutton');
		await fireEvent.update(input, '5');
		const pending = Promise.withResolvers<{ makeupCards: number }>();
		mocks.grant.mockReturnValueOnce(pending.promise);
		await fireEvent.submit(view.container.querySelector('form')!);
		expect(view.getByRole('button', { name: i18n.ts.selectUser })).toHaveProperty('disabled', true);
		pending.resolve({ makeupCards: 8 });
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts.selectUser })).toHaveProperty('disabled', false));
		await choose(view, recipient({ id: 'bob-id', username: 'bob' }));
		await waitFor(() => expect(view.getByRole('spinbutton')).toHaveProperty('value', '1'));
		expect(view.getByTestId('recipient').textContent).toBe('@bob');
	});

	test('shows retry on balance read failures without leaving an old grant form visible', async () => {
		const view = renderPage();
		await choose(view);
		await view.findByRole('spinbutton');
		mocks.showUser.mockRejectedValueOnce(new Error('Network unavailable'));
		await choose(view, recipient({ id: 'bob-id', username: 'bob' }));
		await view.findByRole('alert');
		expect(view.getByText(i18n.ts._checkin.grantLoadFailed)).toBeTruthy();
		expect(view.queryByRole('spinbutton')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await view.findByRole('spinbutton');
		expect(mocks.showUser).toHaveBeenLastCalledWith({ userId: 'bob-id' });
	});

	test.each([
		{ host: 'remote.example' },
		{ username: 'system.actor' },
		{ isSuspended: true },
		{ movedTo: 'https://remote.example/users/moved' },
	])('rejects ineligible selected accounts %j before showing a grant form', async overrides => {
		const view = renderPage();
		await choose(view, recipient(overrides));
		await waitFor(() => expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'warning', text: i18n.ts._checkin.grantNotAllowed }));
		expect(mocks.showUser).not.toHaveBeenCalled();
		expect(mocks.grant).not.toHaveBeenCalled();
		expect(view.queryByRole('spinbutton')).toBeNull();
	});

	test('rejects an account suspended after the user picker result was fetched', async () => {
		mocks.showUser.mockResolvedValueOnce({ checkinPoints: 42, checkinMakeupCards: 3, isSuspended: true });
		const view = renderPage();
		await choose(view);
		await waitFor(() => expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'warning', text: i18n.ts._checkin.grantNotAllowed }));
		expect(view.queryByRole('spinbutton')).toBeNull();
	});

	test('shows global totals, usage explanation and recipient/operator history links on entry', async () => {
		const view = renderPage();
		await view.findByTestId('checkin-admin-stats');
		expect(view.getByTestId('checkin-admin-grantedCards').textContent).toBe('120');
		expect(view.getByTestId('checkin-admin-usedCards').textContent).toBe('30');
		expect(view.getByTestId('checkin-admin-availableCards').textContent).toBe('105');
		expect(view.getByText(i18n.ts._checkin.cardsUsageDescription)).toBeTruthy();
		const table = within(view.getByRole('table'));
		expect(table.getByRole('link', { name: '@alice' }).getAttribute('href')).toBe('/admin/user/alice-id');
		expect(table.getByRole('link', { name: '@admin' }).getAttribute('href')).toBe('/admin/user/admin-id');
		expect(table.getByText(i18n.ts._checkin.grantPartiallyUsed)).toBeTruthy();
		expect(view.queryByTestId('checkin-admin-tabs')).toBeNull();
		expect(mocks.stats).toHaveBeenCalledExactlyOnceWith({});
		expect(mocks.history).toHaveBeenCalledExactlyOnceWith({ type: 'grant', limit: 20, offset: 0 });
		expect(view.getByRole('button', { name: i18n.ts._checkin.grantScopeSelected })).toHaveProperty('disabled', true);
	});

	test('filters explicitly to a selected user and returns to global totals without granting', async () => {
		const view = renderPage();
		await choose(view);
		await view.findByRole('spinbutton');
		expect(mocks.stats).toHaveBeenCalledExactlyOnceWith({});
		expect(view.getByTestId('recipient').getAttribute('data-with-chart')).toBe('false');
		mocks.stats.mockResolvedValueOnce({ ...overview, grantedCards: 10, grantedUsers: 1 });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.grantScopeSelected }));
		await waitFor(() => expect(view.getByTestId('checkin-admin-grantedCards').textContent).toBe('10'));
		expect(mocks.stats).toHaveBeenLastCalledWith({ userId: 'alice-id' });
		expect(mocks.history).toHaveBeenLastCalledWith({ type: 'grant', userId: 'alice-id', limit: 20, offset: 0 });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.grantScopeAll }));
		await waitFor(() => expect(view.getByTestId('checkin-admin-grantedCards').textContent).toBe('120'));
		expect(mocks.stats).toHaveBeenLastCalledWith({});
		expect(mocks.grant).not.toHaveBeenCalled();
	});

	test('clears the recipient and returns both statistics and history to all users', async () => {
		const view = renderPage();
		await choose(view);
		await view.findByRole('spinbutton');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.grantScopeSelected }));
		await waitFor(() => expect(mocks.history).toHaveBeenLastCalledWith({ type: 'grant', userId: 'alice-id', limit: 20, offset: 0 }));
		const historyPanel = within(view.getByRole('region', { name: i18n.ts._checkin.grantHistory }));
		expect(historyPanel.getAllByText('@alice')).toHaveLength(2);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.clear }));
		await waitFor(() => expect(mocks.history).toHaveBeenLastCalledWith({ type: 'grant', limit: 20, offset: 0 }));
		expect(mocks.stats).toHaveBeenLastCalledWith({});
		expect(view.queryByRole('spinbutton')).toBeNull();
		expect(view.queryByTestId('recipient')).toBeNull();
		expect(document.activeElement).toBe(view.getByRole('button', { name: i18n.ts.selectUser }));
		expect(historyPanel.getByText(i18n.ts._checkin.grantScopeAll)).toBeTruthy();
		expect(mocks.grant).not.toHaveBeenCalled();
	});

	test('returns to a valid history page after the retained record count shrinks', async () => {
		mocks.history.mockResolvedValueOnce({ total: 21, items: [record()] });
		const view = renderPage();
		await view.findByRole('table');
		mocks.history.mockResolvedValueOnce({ total: 1, items: [] });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.grantNextPage }));
		await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(3));
		expect(mocks.history).toHaveBeenLastCalledWith({ type: 'grant', limit: 20, offset: 0 });
		await view.findByTestId('checkin-admin-grant-record-1');
		expect(view.getByRole('button', { name: i18n.ts._checkin.grantPreviousPage })).toHaveProperty('disabled', true);
	});

	test('paginates grant history and resets to the first page when filtering by user', async () => {
		mocks.history.mockResolvedValueOnce({ total: 21, items: [record()] });
		const view = renderPage();
		await view.findByRole('table');
		mocks.history.mockResolvedValueOnce({ total: 21, items: [record({ id: 'last-record', recipientUsername: 'deleted-user', user: null })] });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.grantNextPage }));
		await view.findByText('@deleted-user');
		expect(mocks.history).toHaveBeenLastCalledWith({ type: 'grant', limit: 20, offset: 20 });
		expect(view.queryByRole('link', { name: '@deleted-user' })).toBeNull();
		expect(view.getByRole('button', { name: i18n.ts._checkin.grantNextPage })).toHaveProperty('disabled', true);
		await choose(view);
		await view.findByRole('spinbutton');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.grantScopeSelected }));
		await waitFor(() => expect(mocks.history).toHaveBeenLastCalledWith({ type: 'grant', userId: 'alice-id', limit: 20, offset: 0 }));
		expect(view.getByRole('button', { name: i18n.ts._checkin.grantPreviousPage })).toHaveProperty('disabled', true);
	});

	test('ignores outdated scope requests after newer responses arrive', async () => {
		const oldHistory = Promise.withResolvers<unknown>();
		const oldStats = Promise.withResolvers<unknown>();
		mocks.history.mockReturnValueOnce(oldHistory.promise);
		mocks.stats.mockReturnValueOnce(oldStats.promise);
		const view = renderPage();
		await choose(view);
		await view.findByRole('spinbutton');
		mocks.stats.mockResolvedValueOnce({ ...overview, grantedCards: 10 });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.grantScopeSelected }));
		await waitFor(() => expect(view.getByTestId('checkin-admin-grantedCards').textContent).toBe('10'));
		await view.findByRole('table');
		oldStats.resolve({ ...overview, grantedCards: 999 });
		oldHistory.resolve({ total: 0, items: [] });
		await waitFor(() => expect(view.getByTestId('checkin-admin-grantedCards').textContent).toBe('10'));
		expect(view.getByRole('table')).toBeTruthy();
		expect(view.queryByText(i18n.ts._checkin.grantRecordsEmpty)).toBeNull();
	});

	test('retries independent stats and history failures and shows an empty result', async () => {
		mocks.stats.mockRejectedValueOnce(new Error('stats unavailable'));
		mocks.history.mockRejectedValueOnce(new Error('history unavailable'));
		const view = renderPage();
		await view.findByText(i18n.ts._checkin.grantDashboardLoadFailed);
		await view.findByText(i18n.ts._checkin.grantHistoryLoadFailed);
		const overviewPanel = within(view.getByRole('region', { name: i18n.ts._checkin.grantOverview }));
		await fireEvent.click(overviewPanel.getByRole('button', { name: i18n.ts.retry }));
		await view.findByTestId('checkin-admin-stats');
		expect(view.getByText(i18n.ts._checkin.grantHistoryLoadFailed)).toBeTruthy();
		mocks.history.mockResolvedValueOnce({ total: 0, items: [] });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await view.findByText(i18n.ts._checkin.grantRecordsEmpty);
		expect(view.queryByRole('table')).toBeNull();
	});

	test('does not refresh dashboard for failed grants and preserves successful grants when stats refresh fails', async () => {
		const view = renderPage();
		await choose(view);
		await view.findByRole('spinbutton');
		mocks.grant.mockRejectedValueOnce({ code: 'NETWORK_ERROR' });
		await fireEvent.submit(view.container.querySelector('form')!);
		await waitFor(() => expect(mocks.alert).toHaveBeenCalledOnce());
		expect(mocks.stats).toHaveBeenCalledOnce();
		expect(mocks.history).toHaveBeenCalledOnce();
		mocks.stats.mockRejectedValueOnce(new Error('stats unavailable'));
		await fireEvent.submit(view.container.querySelector('form')!);
		await view.findByText(i18n.ts._checkin.grantDashboardLoadFailed);
		expect(view.getByText(`${i18n.ts._checkin.makeupCards}: 8`)).toBeTruthy();
		expect(mocks.toast).toHaveBeenCalledOnce();
		expect(mocks.alert).toHaveBeenCalledOnce();
	});

	test('disposes an open selector on unmount and ignores a late selected user', async () => {
		const view = renderPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.selectUser }));
		const callbacks = mocks.popup.mock.lastCall![2];
		view.unmount();
		expect(mocks.dispose).toHaveBeenCalledOnce();
		callbacks.ok(recipient());
		expect(mocks.showUser).not.toHaveBeenCalled();
	});

	test.each([
		{ usageStatus: 'unused', used: 0, remaining: 5, revoked: 0, label: () => i18n.ts._checkin.grantUnused, revocable: true },
		{ usageStatus: 'partial', used: 2, remaining: 3, revoked: 0, label: () => i18n.ts._checkin.grantPartiallyUsed, revocable: true },
		{ usageStatus: 'used', used: 5, remaining: 0, revoked: 0, label: () => i18n.ts._checkin.grantUsed, revocable: false },
		{ usageStatus: 'revoked', used: 2, remaining: 0, revoked: 3, label: () => i18n.ts._checkin.grantRevoked, revocable: false },
		{ usageStatus: 'legacy', batchId: null, used: null, remaining: null, revoked: null, label: () => i18n.ts._checkin.grantLegacy, revocable: false },
	])('shows $usageStatus batch accounting and only permits reclaiming tracked remaining cards', async state => {
		mocks.history.mockResolvedValueOnce({ total: 1, items: [record(state)] });
		const view = renderPage();
		const row = within(await view.findByTestId('checkin-admin-grant-record-1'));
		expect(row.getByText(state.label())).toBeTruthy();
		expect(row.queryByRole('button', { name: i18n.ts._checkin.revokeCards }) != null).toBe(state.revocable);
		if (state.usageStatus === 'legacy') expect(view.getByText(i18n.ts._checkin.grantLegacyDescription)).toBeTruthy();
	});

	test('confirms the remaining amount and refreshes history, totals and selected balance after reclaim', async () => {
		const view = renderPage();
		await choose(view);
		await view.findByRole('spinbutton');
		mocks.history.mockResolvedValueOnce({ total: 1, items: [record({ usageStatus: 'revoked', remaining: 0, revoked: 3 })] });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.revokeCards }));
		await waitFor(() => expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith({ batchId: 'batch-1' }));
		expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({ type: 'warning', title: i18n.ts._checkin.revokeCards, text: i18n.tsx._checkin.revokeCardsConfirm({ username: 'alice', amount: '3' }) });
		await view.findByText(`${i18n.ts._checkin.makeupCards}: 0`);
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.tsx._checkin.revokeCardsSucceeded({ amount: '3' }));
		expect(mocks.stats).toHaveBeenCalledTimes(2);
		expect(mocks.history).toHaveBeenCalledTimes(2);
		expect(view.queryByRole('button', { name: i18n.ts._checkin.revokeCards })).toBeNull();
	});

	test('canceling a reclaim does not mutate balances or refresh the dashboard', async () => {
		mocks.confirm.mockResolvedValueOnce({ canceled: true });
		const view = renderPage();
		await fireEvent.click(await view.findByRole('button', { name: i18n.ts._checkin.revokeCards }));
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._checkin.revokeCards })).toHaveProperty('disabled', false));
		expect(mocks.revoke).not.toHaveBeenCalled();
		expect(mocks.stats).toHaveBeenCalledOnce();
		expect(mocks.history).toHaveBeenCalledOnce();
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	test('blocks repeated reclaim and grant submissions while a reclaim is pending', async () => {
		const pending = Promise.withResolvers<unknown>();
		mocks.revoke.mockReturnValueOnce(pending.promise);
		const view = renderPage();
		await choose(view);
		await view.findByRole('spinbutton');
		const revoke = view.getByRole('button', { name: i18n.ts._checkin.revokeCards });
		await fireEvent.click(revoke);
		await fireEvent.click(revoke);
		await fireEvent.submit(view.container.querySelector('form')!);
		expect(mocks.revoke).toHaveBeenCalledOnce();
		expect(mocks.grant).not.toHaveBeenCalled();
		expect(revoke).toHaveProperty('disabled', true);
		expect(view.getByRole('button', { name: i18n.ts.selectUser })).toHaveProperty('disabled', true);
		expect(view.getByRole('button', { name: i18n.ts._checkin.grantCards })).toHaveProperty('disabled', true);
		pending.resolve({ batchId: 'batch-1', revokedCards: 3, makeupCards: 0 });
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts.selectUser })).toHaveProperty('disabled', false));
	});

	test.each([
		['NETWORK_ERROR', () => i18n.ts._checkin.revokeCardsFailed],
		['NO_SUCH_CARD_BATCH', () => i18n.ts._checkin.revokeCardsUnavailable],
		['CARD_BATCH_NOT_REVOKABLE', () => i18n.ts._checkin.revokeCardsUnavailable],
	])('shows %s inline and permits retry without treating reclaim as successful', async (code, message) => {
		mocks.revoke.mockRejectedValueOnce({ code });
		const view = renderPage();
		await fireEvent.click(await view.findByRole('button', { name: i18n.ts._checkin.revokeCards }));
		await view.findByRole('alert');
		expect(view.getByRole('alert').textContent).toBe(message());
		expect(mocks.toast).not.toHaveBeenCalled();
		expect(mocks.stats).toHaveBeenCalledOnce();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.revokeCards }));
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledOnce());
		expect(mocks.revoke).toHaveBeenCalledTimes(2);
	});

	test('refreshes a batch consumed before reclaim without announcing a successful deduction', async () => {
		mocks.revoke.mockResolvedValueOnce({ batchId: 'batch-1', revokedCards: 0, makeupCards: 0 });
		const view = renderPage();
		await view.findByRole('table');
		mocks.history.mockResolvedValueOnce({ total: 1, items: [record({ usageStatus: 'used', used: 5, remaining: 0 })] });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.revokeCards }));
		await view.findByText(i18n.ts._checkin.revokeCardsUnavailable);
		expect(mocks.toast).not.toHaveBeenCalled();
		expect(view.queryByRole('button', { name: i18n.ts._checkin.revokeCards })).toBeNull();
		expect(mocks.stats).toHaveBeenCalledTimes(2);
	});

	test('does not send reclaim after leaving the page while confirmation is open', async () => {
		const pending = Promise.withResolvers<{ canceled: boolean }>();
		mocks.confirm.mockReturnValueOnce(pending.promise);
		const view = renderPage();
		await fireEvent.click(await view.findByRole('button', { name: i18n.ts._checkin.revokeCards }));
		view.unmount();
		pending.resolve({ canceled: false });
		await pending.promise;
		expect(mocks.revoke).not.toHaveBeenCalled();
	});
});
