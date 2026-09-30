/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { PossiblyNonNormalizedPreferencesProfile, StorageProvider } from '@/preferences/manager.js';
import { PreferencesManager } from '@/preferences/manager.js';
import { PREF_DEF } from '@/preferences/def.js';

vi.mock('@@/js/config.js', () => ({ host: 'widgets.test', version: 'test', lang: 'en-US', prefersReducedMotion: false }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));

type CloudRecord = Parameters<StorageProvider['cloudSet']>[0];
type Widgets = PreferencesManager['s']['widgets'];

const customWidgets: Widgets = [
	{ id: 'memo', name: 'memo', place: 'right', data: { text: 'Saved text', height: 180 } },
	{ id: 'clock', name: 'clock', place: 'right', data: { size: 'small', transparent: true } },
];

function cloudKey({ key, scope }: Pick<CloudRecord, 'key' | 'scope'>) {
	return JSON.stringify([key, scope.server ?? null, scope.account ?? null, scope.device ?? null]);
}

function memoryStorage(cloud = new Map<string, any>()) {
	let local: PossiblyNonNormalizedPreferencesProfile | null = null;
	const io: StorageProvider = {
		load: () => structuredClone(local),
		save: ({ profile }) => { local = structuredClone(profile); },
		cloudGet: vi.fn(async ctx => {
			const value = cloud.get(cloudKey(ctx));
			return value === undefined ? null : { value: structuredClone(value) };
		}),
		cloudGetBulk: vi.fn(async ({ needs }: Parameters<StorageProvider['cloudGetBulk']>[0]) => {
			const values: Record<string, any> = {};
			for (const need of needs) {
				if (cloud.has(cloudKey(need))) values[need.key] = structuredClone(cloud.get(cloudKey(need)));
			}
			return values;
		}) as StorageProvider['cloudGetBulk'],
		cloudSet: vi.fn(async ctx => { cloud.set(cloudKey(ctx), structuredClone(ctx.value)); }),
	};
	return { io, cloud, clearLocal: () => { local = null; } };
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

describe('widget account sync', () => {
	test('restores widget order and options after logout clears local preferences', async () => {
		const storage = memoryStorage();
		const beforeLogout = new PreferencesManager(storage.io, { id: 'alice' });
		await beforeLogout.cloudReady;
		beforeLogout.commit('widgets', customWidgets);
		await beforeLogout.flushCloudSync();
		storage.clearLocal();

		const afterLogin = new PreferencesManager(storage.io, { id: 'alice' });
		await afterLogin.cloudReady;
		expect(afterLogin.s.widgets).toEqual(customWidgets);
		expect(afterLogin.r.widgets.value).toEqual(customWidgets);
	});

	test('keeps another account and guests separate from saved account widgets', async () => {
		const storage = memoryStorage();
		const alice = new PreferencesManager(storage.io, { id: 'alice' });
		await alice.cloudReady;
		alice.commit('widgets', customWidgets);
		await alice.flushCloudSync();

		const bob = new PreferencesManager(storage.io, { id: 'bob' });
		await bob.cloudReady;
		expect(bob.s.widgets.map(widget => widget.name)).toEqual(['clock', 'calendar', 'trends']);
		bob.commit('widgets', []);
		await bob.flushCloudSync();
		vi.mocked(storage.io.cloudSet).mockClear();
		vi.mocked(storage.io.cloudGetBulk).mockClear();

		const guest = new PreferencesManager(storage.io, null);
		await guest.cloudReady;
		expect(guest.isSyncEnabled('widgets')).toBe(false);
		expect(guest.s.widgets.map(widget => widget.name)).toEqual(['clock', 'calendar', 'trends']);
		guest.commit('widgets', []);
		await guest.flushCloudSync();
		expect(storage.io.cloudSet).not.toHaveBeenCalled();
		expect(storage.io.cloudGetBulk).not.toHaveBeenCalled();

		storage.clearLocal();
		const restoredAlice = new PreferencesManager(storage.io, { id: 'alice' });
		await restoredAlice.cloudReady;
		expect(restoredAlice.s.widgets).toEqual(customWidgets);
	});

	test('preserves a deliberately empty cloud widget list', async () => {
		const storage = memoryStorage();
		storage.cloud.set(cloudKey({ key: 'widgets', scope: { server: 'widgets.test', account: 'alice' } }), []);
		const manager = new PreferencesManager(storage.io, { id: 'alice' });
		await manager.flushCloudSync();
		expect(manager.s.widgets).toEqual([]);
		expect(manager.r.widgets.value).toEqual([]);
	});

	test('uploads existing local widgets when the old profile has no sync metadata or cloud value', async () => {
		const storage = memoryStorage();
		const oldProfile: PossiblyNonNormalizedPreferencesProfile = {
			id: 'old', name: '', type: 'main', version: 'old', modifiedAt: 1,
			preferences: { widgets: [[{ server: 'widgets.test', account: 'alice' }, customWidgets, {}]] },
		};
		storage.io.load = () => structuredClone(oldProfile);
		const manager = new PreferencesManager(storage.io, { id: 'alice' });
		await manager.flushCloudSync();
		expect(manager.s.widgets).toEqual(customWidgets);
		expect(storage.cloud.get(cloudKey({ key: 'widgets', scope: { server: 'widgets.test', account: 'alice' } }))).toEqual(customWidgets);
	});

	test('enables default synchronization only for widgets', async () => {
		const { io } = memoryStorage();
		const manager = new PreferencesManager(io, { id: 'alice' });
		await manager.flushCloudSync();
		const enabled = (Object.keys(PREF_DEF) as (keyof typeof PREF_DEF)[]).filter(key => manager.isSyncEnabled(key));
		expect(enabled).toEqual(['widgets']);
	});

	test('respects an explicit choice to disable widget synchronization', async () => {
		const { io } = memoryStorage();
		const manager = new PreferencesManager(io, { id: 'alice' });
		await manager.flushCloudSync();
		vi.mocked(io.cloudSet).mockClear();
		manager.disableSync('widgets');
		manager.commit('widgets', customWidgets);
		await manager.flushCloudSync();
		expect(io.cloudSet).not.toHaveBeenCalled();

		const reloaded = new PreferencesManager(io, { id: 'alice' });
		await reloaded.cloudReady;
		expect(reloaded.isSyncEnabled('widgets')).toBe(false);
		expect(reloaded.s.widgets).toEqual(customWidgets);
	});

	test('saves consecutive edits in order and waits for the final save', async () => {
		const storage = memoryStorage();
		const manager = new PreferencesManager(storage.io, { id: 'alice' });
		await manager.flushCloudSync();
		const firstSave = deferred();
		const persist = storage.io.cloudSet;
		let started = 0;
		storage.io.cloudSet = vi.fn(async ctx => {
			started++;
			if (started === 1) await firstSave.promise;
			await persist(ctx);
		});
		manager.commit('widgets', customWidgets);
		manager.commit('widgets', [...customWidgets].reverse());
		let finished = false;
		const flushed = manager.flushCloudSync().then(() => { finished = true; });
		await vi.waitFor(() => expect(started).toBe(1));
		expect(finished).toBe(false);
		firstSave.resolve();
		await flushed;
		expect(started).toBe(2);
		expect(storage.cloud.get(cloudKey({ key: 'widgets', scope: { server: 'widgets.test', account: 'alice' } }))).toEqual([...customWidgets].reverse());
	});

	test('keeps edits made while the initial cloud read is pending', async () => {
		const storage = memoryStorage();
		storage.cloud.set(cloudKey({ key: 'widgets', scope: { server: 'widgets.test', account: 'alice' } }), customWidgets);
		const cloudRead = deferred();
		const read = storage.io.cloudGetBulk;
		storage.io.cloudGetBulk = async ctx => {
			const oldValues = await read(ctx);
			await cloudRead.promise;
			return oldValues;
		};
		const manager = new PreferencesManager(storage.io, { id: 'alice' });
		manager.commit('widgets', []);
		cloudRead.resolve();
		await manager.flushCloudSync();
		expect(manager.s.widgets).toEqual([]);
		expect(storage.cloud.get(cloudKey({ key: 'widgets', scope: { server: 'widgets.test', account: 'alice' } }))).toEqual([]);
	});

	test('keeps a local edit when another tab reloads before its cloud save finishes', async () => {
		const { io } = memoryStorage();
		const firstTab = new PreferencesManager(io, { id: 'alice' });
		await firstTab.flushCloudSync();
		const secondTab = new PreferencesManager(io, { id: 'alice' });
		await secondTab.cloudReady;
		const cloudSave = deferred();
		const persist = io.cloudSet;
		io.cloudSet = async ctx => {
			await cloudSave.promise;
			await persist(ctx);
		};
		firstTab.commit('widgets', customWidgets);
		secondTab.reloadProfile();
		await secondTab.cloudReady;
		expect(secondTab.s.widgets).toEqual(customWidgets);
		cloudSave.resolve();
		await firstTab.flushCloudSync();
	});

	test('retains a failed widget save despite another successful preference save and retries after recovery', async () => {
		const storage = memoryStorage();
		const manager = new PreferencesManager(storage.io, { id: 'alice' });
		await manager.flushCloudSync();
		const persist = storage.io.cloudSet;
		let online = false;
		storage.io.cloudSet = async ctx => {
			if (ctx.key === 'widgets' && !online) throw new Error('offline');
			await persist(ctx);
		};
		const loggedError = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			manager.getMatchedRecordOf('animation')[2].sync = true;
			manager.commit('widgets', customWidgets);
			manager.commit('animation', !manager.s.animation);
			await expect(manager.flushCloudSync()).rejects.toThrow('offline');
			expect(manager.s.widgets).toEqual(customWidgets);

			online = true;
			await manager.flushCloudSync();
			expect(storage.cloud.get(cloudKey({ key: 'widgets', scope: { server: 'widgets.test', account: 'alice' } }))).toEqual(customWidgets);
		} finally {
			loggedError.mockRestore();
		}
	});
});
