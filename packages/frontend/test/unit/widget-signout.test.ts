/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { signout } from '@/signout.js';

const mocks = vi.hoisted(() => ({
	flushCloudSync: vi.fn(),
	cloudBackup: vi.fn(),
	clearDatabase: vi.fn(),
	reload: vi.fn(),
	alert: vi.fn(),
	waiting: vi.fn(),
	done: vi.fn(),
	deleteDatabase: vi.fn(),
}));

vi.mock('@@/js/config.js', () => ({ apiUrl: 'https://example.com/api' }));
vi.mock('@/preferences.js', () => ({ prefer: { flushCloudSync: mocks.flushCloudSync } }));
vi.mock('@/preferences/utility.js', () => ({ cloudBackup: mocks.cloudBackup }));
vi.mock('@/store.js', () => ({ store: { s: { enablePreferencesAutoCloudBackup: false } } }));
vi.mock('@/os.js', () => ({ alert: mocks.alert, waiting: mocks.waiting }));
vi.mock('@/utility/unison-reload.js', () => ({ unisonReload: mocks.reload }));
vi.mock('@/utility/idb-proxy.js', () => ({ clear: mocks.clearDatabase }));
vi.mock('@/i.js', () => ({ $i: { id: 'account', token: 'token' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { somethingHappened: 'Something happened' } } }));

const savedPreferences = JSON.stringify({ widgets: [{ id: 'clock', name: 'clock', place: 'left', data: {} }] });

describe('widget sync before signout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		localStorage.setItem('preferences', savedPreferences);
		mocks.flushCloudSync.mockResolvedValue(undefined);
		mocks.waiting.mockReturnValue(mocks.done);
		mocks.clearDatabase.mockResolvedValue(undefined);
		mocks.deleteDatabase.mockImplementation(() => {
			const request = { onsuccess: null as (() => void) | null };
			queueMicrotask(() => request.onsuccess?.());
			return request;
		});
		vi.stubGlobal('indexedDB', { deleteDatabase: mocks.deleteDatabase });
		vi.stubGlobal('navigator', { serviceWorker: { controller: null, getRegistrations: vi.fn().mockResolvedValue([]) } });
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	test('keeps local layout until cloud sync finishes, then clears storage and reloads', async () => {
		let finishSync!: () => void;
		mocks.flushCloudSync.mockReturnValue(new Promise<void>(resolve => { finishSync = resolve; }));

		const signingOut = signout();
		await Promise.resolve();

		expect(mocks.flushCloudSync).toHaveBeenCalledOnce();
		expect(localStorage.getItem('preferences')).toBe(savedPreferences);
		expect(mocks.deleteDatabase).not.toHaveBeenCalled();
		expect(mocks.clearDatabase).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();

		finishSync();
		await signingOut;

		expect(localStorage.getItem('preferences')).toBeNull();
		expect(mocks.deleteDatabase).toHaveBeenCalledExactlyOnceWith('MisskeyClient');
		expect(mocks.clearDatabase).toHaveBeenCalledOnce();
		expect(mocks.reload).toHaveBeenCalledExactlyOnceWith('/');
		expect(mocks.alert).not.toHaveBeenCalled();
	});

	test('preserves local layout and cancels signout when cloud sync fails', async () => {
		const error = new Error('Could not save widget layout');
		mocks.flushCloudSync.mockRejectedValue(error);

		await signout();

		expect(localStorage.getItem('preferences')).toBe(savedPreferences);
		expect(mocks.deleteDatabase).not.toHaveBeenCalled();
		expect(mocks.clearDatabase).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();
		expect(mocks.done).toHaveBeenCalledOnce();
		expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'error', title: 'Something happened' });
	});
});
