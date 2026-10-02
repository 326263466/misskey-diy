/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';

const mocks = vi.hoisted(() => ({
	account: { id: 'alice', username: 'alice', token: 'revoked-token' },
	state: { accountTokens: {} as Record<string, string>, accountInfos: {} as Record<string, unknown> },
	preferences: { accounts: [] as [string, { id: string; username: string }][] },
	save: vi.fn(),
	commit: vi.fn(),
	alert: vi.fn(),
	suspended: vi.fn(),
	reload: vi.fn(),
	signout: vi.fn(),
	popup: vi.fn(),
}));

vi.mock('@@/js/config.js', () => ({ apiUrl: 'https://example.test/api', host: 'example.test' }));
vi.mock('@/utility/show-suspended-dialog.js', () => ({ showSuspendedDialog: mocks.suspended }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	tokenRevoked: 'Token revoked', tokenRevokedDescription: 'Please sign in again',
	accountDeleted: 'Account deleted', accountDeletedDescription: 'This account was deleted',
	failedToFetchAccountInformation: 'Failed to fetch account',
} } }));
vi.mock('@/os.js', () => ({ waiting: vi.fn(), popup: mocks.popup, popupMenu: vi.fn(), success: vi.fn(), alert: mocks.alert, confirm: vi.fn() }));
vi.mock('@/utility/unison-reload.js', () => ({ unisonReload: mocks.reload, reloadChannel: {} }));
vi.mock('@/preferences.js', () => ({ prefer: { s: mocks.preferences, commit: mocks.commit } }));
vi.mock('@/store.js', () => ({ store: { s: mocks.state, set: mocks.save } }));
vi.mock('@/i.js', () => ({ $i: mocks.account }));
vi.mock('@/signout.js', () => ({ signout: mocks.signout }));
vi.mock('@/utility/online-status.js', () => ({ getOnlineStatusMenu: vi.fn() }));
vi.mock('@/composables/use-user-profile.js', () => ({ publishUserProfileUpdate: vi.fn() }));

function respondWithError(error: Record<string, unknown>, status = 401) {
	vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error }), { status })));
}

beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
	mocks.account.token = 'revoked-token';
	localStorage.clear();
	localStorage.setItem('account', JSON.stringify(mocks.account));
	localStorage.setItem('drafts', 'unsent draft');
	localStorage.setItem('preferences', 'saved layout');
	mocks.state.accountTokens = { 'example.test/alice': 'revoked-token', 'other.test/bob': 'another-revoked-token' };
	mocks.state.accountInfos = { 'example.test/alice': mocks.account, 'other.test/bob': { id: 'bob' } };
	mocks.preferences.accounts = [['example.test', { id: 'alice', username: 'alice' }], ['other.test', { id: 'bob', username: 'bob' }]];
	mocks.save.mockImplementation(async (key: keyof typeof mocks.state, value) => { mocks.state[key] = value; });
	mocks.commit.mockImplementation((_key, value) => { mocks.preferences.accounts = value; });
	mocks.alert.mockResolvedValue(undefined);
	mocks.suspended.mockResolvedValue(undefined);
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
});

describe('session recovery from ordinary API requests', () => {
	test('public instance metadata can load with an invalid cached token so the recovery dialog can mount', async () => {
		const { fetchInstance, instance } = await import('@/instance.js');
		vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
			const data = JSON.parse(options.body);
			return data.i
				? new Response(JSON.stringify({ error: { code: 'AUTHENTICATION_FAILED' } }), { status: 401 })
				: new Response(JSON.stringify({ name: 'Test instance' }), { status: 200 });
		}));
		await expect(fetchInstance(true)).resolves.toMatchObject({ name: 'Test instance' });
		expect(instance.name).toBe('Test instance');
		expect(mocks.alert).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();
	});

	test.each([
		[{ code: 'AUTHENTICATION_FAILED' }, 401, 'Token revoked'],
		[{ id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14' }, 401, 'Token revoked'],
		[{ code: 'USER_IS_DELETED' }, 403, 'Account deleted'],
		[{ code: 'YOUR_ACCOUNT_SUSPENDED' }, 403, 'suspended'],
	])('recovers %j without keeping the failed request pending', async (error, status, title) => {
		const { misskeyApi, pendingApiRequestsCount } = await import('@/utility/misskey-api.js');
		const { isAccountSessionErrorHandled } = await import('@/utility/account-session-error.js');
		respondWithError(error, status);
		let acknowledge!: () => void;
		const dialog = title === 'suspended' ? mocks.suspended : mocks.alert;
		dialog.mockReturnValue(new Promise<void>(resolve => { acknowledge = resolve; }));

		const request = misskeyApi('notes/create', { text: 'Draft' });
		expect(pendingApiRequestsCount.value).toBe(1);
		const failure = await request.catch(err => err);
		expect(failure).toEqual(error);
		expect(isAccountSessionErrorHandled(failure)).toBe(true);
		expect(pendingApiRequestsCount.value).toBe(0);
		await vi.waitFor(() => expect(dialog).toHaveBeenCalledOnce());
		if (title !== 'suspended') expect(dialog).toHaveBeenCalledWith(expect.objectContaining({ title }));
		expect(mocks.reload).not.toHaveBeenCalled();
		acknowledge();
		await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalledExactlyOnceWith('/'));
		expect(localStorage.getItem('account')).toBeNull();
		expect(localStorage.getItem('drafts')).toBe('unsent draft');
		expect(localStorage.getItem('preferences')).toBe('saved layout');
		expect(mocks.state.accountTokens).toEqual({ 'other.test/bob': 'another-revoked-token' });
		expect(mocks.signout).not.toHaveBeenCalled();
		expect(window.fetch).toHaveBeenCalledOnce();
	});

	test('startup and concurrent API failures share one dialog and one recovery', async () => {
		const { refreshCurrentAccount } = await import('@/accounts.js');
		const { misskeyApi, pendingApiRequestsCount } = await import('@/utility/misskey-api.js');
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		let acknowledge!: () => void;
		mocks.alert.mockReturnValue(new Promise<void>(resolve => { acknowledge = resolve; }));
		const refresh = refreshCurrentAccount();
		await Promise.allSettled([misskeyApi('notes/create', { text: 'Draft' }), misskeyApi('i/notifications', {})]);
		await vi.dynamicImportSettled();
		expect(mocks.alert).toHaveBeenCalledOnce();
		expect(pendingApiRequestsCount.value).toBe(0);
		acknowledge();
		await refresh;
		expect(mocks.reload).toHaveBeenCalledOnce();
	});

	test.each([null, 'another-account-token'])('does not invalidate the session for an explicit token override: %s', async token => {
		const { misskeyApi, pendingApiRequestsCount } = await import('@/utility/misskey-api.js');
		const { isAccountSessionErrorHandled } = await import('@/utility/account-session-error.js');
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		const failure = await misskeyApi('notes/create', { text: 'Draft' }, token).catch(err => err);
		await vi.dynamicImportSettled();
		expect(isAccountSessionErrorHandled(failure)).toBe(false);
		expect(mocks.alert).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();
		expect(localStorage.getItem('account')).not.toBeNull();
		expect(pendingApiRequestsCount.value).toBe(0);
	});

	test.each([true, false])('uses the token actually sent even if request data is reused (current: %s)', async current => {
		const { misskeyApi } = await import('@/utility/misskey-api.js');
		const { isAccountSessionErrorHandled } = await import('@/utility/account-session-error.js');
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		const data = { text: 'Draft', i: undefined as string | undefined };
		const request = misskeyApi('notes/create', data, current ? undefined : 'other-token');
		data.i = current ? 'other-token' : mocks.account.token;
		const failure = await request.catch(err => err);
		await vi.dynamicImportSettled();
		expect(isAccountSessionErrorHandled(failure)).toBe(current);
		if (current) await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
		else expect(mocks.reload).not.toHaveBeenCalled();
	});

	test('a stale response cannot invalidate a replaced current token', async () => {
		const { misskeyApi } = await import('@/utility/misskey-api.js');
		const { isAccountSessionErrorHandled } = await import('@/utility/account-session-error.js');
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		const request = misskeyApi('notes/create', { text: 'Draft' });
		mocks.account.token = 'new-token';
		const failure = await request.catch(err => err);
		await vi.dynamicImportSettled();
		expect(isAccountSessionErrorHandled(failure)).toBe(false);
		expect(mocks.reload).not.toHaveBeenCalled();
	});

	test.each(['alice', 'bob'])('preserves a new login made in another tab while the dialog is open: %s', async id => {
		const { misskeyApi } = await import('@/utility/misskey-api.js');
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		let acknowledge!: () => void;
		mocks.alert.mockReturnValue(new Promise<void>(resolve => { acknowledge = resolve; }));
		await expect(misskeyApi('notes/create', { text: 'Draft' })).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
		await vi.waitFor(() => expect(mocks.alert).toHaveBeenCalledOnce());
		const newAccount = { id, token: 'new-token' };
		localStorage.setItem('account', JSON.stringify(newAccount));
		acknowledge();
		await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
		expect(JSON.parse(localStorage.getItem('account')!)).toEqual(newAccount);
		expect(mocks.save).not.toHaveBeenCalled();
	});

	test.each([
		['PERMISSION_DENIED', 403], ['RATE_LIMIT_EXCEEDED', 429], ['UNKNOWN_ERROR', 401], ['AUTHENTICATION_FAILED', 500],
	])('does not treat %s (%s) as a revoked session', async (code, status) => {
		const { misskeyApi } = await import('@/utility/misskey-api.js');
		const { isAccountSessionErrorHandled } = await import('@/utility/account-session-error.js');
		respondWithError({ code }, status);
		const failure = await misskeyApi('notes/create', { text: 'Draft' }).catch(err => err);
		await vi.dynamicImportSettled();
		expect(failure).toEqual({ code });
		expect(isAccountSessionErrorHandled(failure)).toBe(false);
		expect(mocks.reload).not.toHaveBeenCalled();
		expect(mocks.alert).not.toHaveBeenCalled();
	});

	test('unauthenticated GET failures and network failures preserve the current session', async () => {
		const { misskeyApi, misskeyApiGet, pendingApiRequestsCount } = await import('@/utility/misskey-api.js');
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		await expect(misskeyApiGet('meta', {})).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
		await expect(misskeyApi('notes/create', { text: 'Draft' })).rejects.toThrow('offline');
		await vi.dynamicImportSettled();
		expect(pendingApiRequestsCount.value).toBe(0);
		expect(mocks.reload).not.toHaveBeenCalled();
		expect(mocks.alert).not.toHaveBeenCalled();
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe('invalid account sessions', () => {
	test.each([
		[{ code: 'AUTHENTICATION_FAILED' }, 'Token revoked'],
		[{ id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14' }, 'Token revoked'],
		[{ code: 'USER_IS_DELETED' }, 'Account deleted'],
	])('returns to the guest homepage after acknowledging %j', async (error, title) => {
		const { refreshCurrentAccount } = await import('@/accounts.js');
		respondWithError(error);
		let acknowledge!: () => void;
		mocks.alert.mockReturnValue(new Promise<void>(resolve => { acknowledge = resolve; }));

		const refresh = refreshCurrentAccount();
		await vi.waitFor(() => expect(mocks.alert).toHaveBeenCalledOnce());
		expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({ title }));
		expect(mocks.reload).not.toHaveBeenCalled();
		acknowledge();
		await refresh;

		expect(localStorage.getItem('account')).toBeNull();
		expect(localStorage.getItem('drafts')).toBe('unsent draft');
		expect(localStorage.getItem('preferences')).toBe('saved layout');
		expect(mocks.state.accountTokens).toEqual({ 'other.test/bob': 'another-revoked-token' });
		expect(mocks.state.accountInfos).toEqual({ 'other.test/bob': { id: 'bob' } });
		expect(mocks.preferences.accounts).toEqual([['other.test', { id: 'bob', username: 'bob' }]]);
		expect(mocks.reload).toHaveBeenCalledExactlyOnceWith('/');
		expect(mocks.signout).not.toHaveBeenCalled();
		expect(window.fetch).toHaveBeenCalledOnce();
	});

	test('also recovers suspended accounts without invoking normal signout', async () => {
		const { refreshCurrentAccount } = await import('@/accounts.js');
		respondWithError({ code: 'YOUR_ACCOUNT_SUSPENDED' }, 403);
		await refreshCurrentAccount();
		expect(mocks.suspended).toHaveBeenCalledOnce();
		expect(mocks.reload).toHaveBeenCalledExactlyOnceWith('/');
		expect(mocks.signout).not.toHaveBeenCalled();
	});

	test('concurrent refreshes show one dialog and late account updates cannot restore invalid credentials', async () => {
		const { refreshCurrentAccount, updateCurrentAccount, updateCurrentAccountPartial } = await import('@/accounts.js');
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		let acknowledge!: () => void;
		mocks.alert.mockReturnValue(new Promise<void>(resolve => { acknowledge = resolve; }));
		const refreshes = Promise.all([refreshCurrentAccount(), refreshCurrentAccount()]);
		await vi.waitFor(() => expect(mocks.alert).toHaveBeenCalledOnce());
		acknowledge();
		await refreshes;
		updateCurrentAccount({ id: 'alice', name: 'Late response' } as Misskey.entities.MeDetailed);
		updateCurrentAccountPartial({ name: 'Late stream event' });
		await refreshCurrentAccount();
		expect(mocks.reload).toHaveBeenCalledOnce();
		expect(mocks.alert).toHaveBeenCalledOnce();
		expect(localStorage.getItem('account')).toBeNull();
		expect(window.fetch).toHaveBeenCalledTimes(2);
	});

	test.each(['blocked', 'failed'])('a %s local database cannot trap the user in an invalid session', async failure => {
		const { refreshCurrentAccount } = await import('@/accounts.js');
		vi.useFakeTimers();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		mocks.save.mockImplementation(() => failure === 'blocked' ? new Promise(() => {}) : Promise.reject(new Error('IDB unavailable')));
		const refresh = refreshCurrentAccount();
		await vi.waitFor(() => expect(mocks.save).toHaveBeenCalled());
		await vi.advanceTimersByTimeAsync(1000);
		await refresh;
		expect(localStorage.getItem('account')).toBeNull();
		expect(mocks.reload).toHaveBeenCalledExactlyOnceWith('/');
	});

	test.each([
		['RATE_LIMIT_EXCEEDED', 429], ['PERMISSION_DENIED', 403], ['INTERNAL_ERROR', 500],
	])('%s does not remove the login state', async (code, status) => {
		const { refreshCurrentAccount } = await import('@/accounts.js');
		respondWithError({ code }, status);
		await expect(refreshCurrentAccount({ throwOnError: true })).rejects.toBeDefined();
		expect(localStorage.getItem('account')).not.toBeNull();
		expect(mocks.save).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();
	});

	test('network failure preserves the session and permits a later retry', async () => {
		const { refreshCurrentAccount } = await import('@/accounts.js');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
		await refreshCurrentAccount();
		expect(localStorage.getItem('account')).not.toBeNull();
		expect(mocks.reload).not.toHaveBeenCalled();
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		await refreshCurrentAccount();
		expect(mocks.reload).toHaveBeenCalledOnce();
	});

	test('an invalid alternative login token does not sign out the current account', async () => {
		const { login } = await import('@/accounts.js');
		respondWithError({ code: 'AUTHENTICATION_FAILED' });
		await expect(login('different-token')).rejects.toBeDefined();
		expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Token revoked' }));
		expect(mocks.popup.mock.calls[0][1].showing.value).toBe(false);
		expect(localStorage.getItem('account')).not.toBeNull();
		expect(mocks.save).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();
	});
});
