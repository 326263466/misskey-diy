/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';
import { refreshCurrentAccount, updateCurrentAccount, updateCurrentAccountPartial } from '@/accounts.js';
import { useUserProfile } from '@/composables/use-user-profile.js';

const mocks = vi.hoisted(() => ({
	account: {} as Record<string, unknown>,
	setAccountInfo: vi.fn(),
	setLocalStorage: vi.fn(),
}));

vi.mock('@@/js/config.js', () => ({ apiUrl: 'https://example.test/api', host: 'example.test' }));
vi.mock('@/utility/show-suspended-dialog.js', () => ({ showSuspendedDialog: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {} } }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { setItem: mocks.setLocalStorage } }));
vi.mock('@/os.js', () => ({ waiting: vi.fn(), popup: vi.fn(), popupMenu: vi.fn(), success: vi.fn(), alert: vi.fn(), confirm: vi.fn() }));
vi.mock('@/utility/unison-reload.js', () => ({ unisonReload: vi.fn(), reloadChannel: {} }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { accounts: [] } } }));
vi.mock('@/store.js', () => ({ store: { s: { accountInfos: {} }, set: mocks.setAccountInfo } }));
vi.mock('@/i.js', () => ({ $i: mocks.account }));
vi.mock('@/signout.js', () => ({ signout: vi.fn() }));
vi.mock('@/utility/online-status.js', () => ({ getOnlineStatusMenu: vi.fn() }));

let sequence = 0;
afterEach(() => vi.unstubAllGlobals());

describe('account updates synchronize public profile consumers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const key of Object.keys(mocks.account)) delete mocks.account[key];
		Object.assign(mocks.account, { id: `account-profile-${++sequence}`, username: 'alice', name: 'Old name', token: 'account-token' });
	});

	test('full streaming updates reach existing snapshots and pages opened later', () => {
		const snapshot = { id: mocks.account.id as string, name: 'Old name', company: 'Old company' };
		const profile = useUserProfile(snapshot);
		expect(profile.value.name).toBe('Old name');

		updateCurrentAccount({ id: snapshot.id, username: 'alice', name: 'New name', company: 'New company', jobTitle: 'Engineer', email: 'private@example.test' } as Misskey.entities.MeDetailed);

		for (const user of [profile.value, useUserProfile({ ...snapshot }).value]) {
			expect(user).toMatchObject({ name: 'New name', company: 'New company', jobTitle: 'Engineer' });
			expect(user).not.toHaveProperty('email');
			expect(user).not.toHaveProperty('token');
		}
		expect(snapshot.name).toBe('Old name');
		expect(mocks.account.token).toBe('account-token');
		expect(JSON.parse(mocks.setLocalStorage.mock.lastCall![1])).toMatchObject({ name: 'New name', token: 'account-token' });
	});

	test('partial save responses merge edits and propagate cleared values', () => {
		const profile = useUserProfile({ id: mocks.account.id as string, name: 'Old name', company: 'Old company', jobTitle: 'Old job' });
		updateCurrentAccountPartial({ name: 'New name', company: 'New company', jobTitle: 'Engineer' });
		updateCurrentAccountPartial({ company: null, fields: [] });

		expect(profile.value).toMatchObject({ name: 'New name', company: null, jobTitle: 'Engineer', fields: [] });
		expect(mocks.account).toMatchObject({ name: 'New name', company: null, token: 'account-token' });
		expect(mocks.setAccountInfo).toHaveBeenLastCalledWith('accountInfos', {
			[`example.test/${mocks.account.id}`]: mocks.account,
		});
	});

	test('unchanged partial updates skip persistence while still seeding public snapshots', () => {
		const profile = useUserProfile({ id: mocks.account.id as string, name: 'Stale name' });
		updateCurrentAccountPartial({ name: 'Old name' });
		expect(profile.value.name).toBe('Old name');
		expect(mocks.setLocalStorage).not.toHaveBeenCalled();
		expect(mocks.setAccountInfo).not.toHaveBeenCalled();
		updateCurrentAccountPartial({ name: undefined });
		expect(mocks.account.name).toBe('Old name');
	});

	test('a late refresh preserves newer saved fields and refreshes untouched fields', async () => {
		let complete!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = resolve; })));
		const refresh = refreshCurrentAccount();
		updateCurrentAccountPartial({ name: 'Saved name', company: null });
		complete(new Response(JSON.stringify({ id: mocks.account.id, name: 'Stale name', company: 'Stale company', jobTitle: 'Refreshed job' }), { status: 200 }));
		await refresh;
		expect(mocks.account).toMatchObject({ name: 'Saved name', company: null, jobTitle: 'Refreshed job' });
		expect(useUserProfile({ id: mocks.account.id as string }).value).toMatchObject({ name: 'Saved name', company: null, jobTitle: 'Refreshed job' });
	});

	test('identical JSON echoes retain nested references and skip persistence', () => {
		const fields = [{ name: 'Website', value: 'example.test' }];
		updateCurrentAccountPartial({ fields });
		vi.clearAllMocks();
		updateCurrentAccountPartial({ fields: [{ ...fields[0] }] }, { fromStream: true });
		expect(mocks.account.fields).toBe(fields);
		expect(mocks.setLocalStorage).not.toHaveBeenCalled();
		expect(mocks.setAccountInfo).not.toHaveBeenCalled();
		updateCurrentAccount({ id: mocks.account.id, username: 'alice', name: 'Old name', fields: [{ ...fields[0] }] } as Misskey.entities.MeDetailed);
		expect(mocks.account.fields).toBe(fields);
		expect(mocks.setLocalStorage).not.toHaveBeenCalled();
	});

	test('unchanged fields in a streaming snapshot do not block a pending refresh', async () => {
		let complete!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = resolve; })));
		const refresh = refreshCurrentAccount();
		updateCurrentAccountPartial({ name: 'Old name', company: 'Stream company' }, { fromStream: true });
		complete(new Response(JSON.stringify({ id: mocks.account.id, name: 'Refreshed name', company: 'Stale company' }), { status: 200 }));
		await refresh;
		expect(mocks.account).toMatchObject({ name: 'Refreshed name', company: 'Stream company' });
	});

	test('explicit same-value saves remain protected against stale refreshes', async () => {
		let complete!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = resolve; })));
		const refresh = refreshCurrentAccount();
		updateCurrentAccountPartial({ name: 'Old name' });
		complete(new Response(JSON.stringify({ id: mocks.account.id, name: 'Stale name' }), { status: 200 }));
		await refresh;
		expect(mocks.account.name).toBe('Old name');
	});

	test('reconnect callers can observe failures without changing legacy refresh behavior', async () => {
		const failure = new Error('offline');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));
		await expect(refreshCurrentAccount({ throwOnError: true })).rejects.toBe(failure);
		await expect(refreshCurrentAccount()).resolves.toBeUndefined();
	});

	test.each(['full', 'partial'] as const)('%s updates cannot overwrite a different account', (kind) => {
		const current = useUserProfile({ id: mocks.account.id as string, name: 'Old name' });
		const other = useUserProfile({ id: `other-${sequence}`, name: 'Other name' });
		const response = { id: other.value.id, name: 'Wrong name' };
		if (kind === 'full') updateCurrentAccount(response as Misskey.entities.MeDetailed);
		else updateCurrentAccountPartial(response);

		expect(current.value.name).toBe('Old name');
		expect(other.value.name).toBe('Other name');
		expect(mocks.account.name).toBe('Old name');
		expect(mocks.setAccountInfo).not.toHaveBeenCalled();
		expect(mocks.setLocalStorage).not.toHaveBeenCalled();
	});
});
