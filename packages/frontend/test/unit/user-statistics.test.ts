/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, nextTick, ref, shallowRef } from 'vue';
import { EventEmitter } from 'eventemitter3';
import type * as Misskey from 'misskey-js';
import { initializeUserStatisticsSync, publishUserStatistics, refreshUserStatistics, refreshVisibleUserStatistics, useUserStatistics } from '@/composables/use-user-statistics.js';
import { globalEvents } from '@/events.js';
import { store } from '@/store.js';
import { useStream } from '@/stream.js';
import type { CustomStatus } from '@/utility/status-icons.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	updateAccount: vi.fn(),
	account: {
		current: null as {
			id: string; token: string; notesCount: number; followingCount: number; followersCount: number; autoAcceptFollowed: boolean;
			customStatus?: CustomStatus | null; hideOnlineStatus?: boolean; onlineStatusOverride?: 'online' | 'away' | 'busy';
		} | null,
	},
}));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.updateAccount }));
vi.mock('@/i.js', () => ({ get $i() { return mocks.account.current; } }));
vi.mock('@/store.js', async () => {
	const { ref: vueRef } = await import('vue');
	const realtimeMode = vueRef(true);
	return { store: { s: { get realtimeMode() { return realtimeMode.value; } }, r: { realtimeMode } } };
});
vi.mock('@/stream.js', async () => {
	const { EventEmitter: Emitter } = await import('eventemitter3');
	const stream = Object.assign(new Emitter(), { state: 'connected', send: vi.fn() });
	return { useStream: () => stream };
});

const stream = useStream();
let documentVisibility: DocumentVisibilityState = 'visible';

function makeUser(id: string, fields: Partial<Misskey.entities.UserDetailed> = {}) {
	return {
		id, name: id, username: id, host: null, notesCount: 7, followingCount: 8, followersCount: 9,
		followingVisibility: 'public', followersVisibility: 'public', ...fields,
	} as Misskey.entities.UserDetailedNotMe;
}

function mountStatistics(initial: Misskey.entities.UserDetailed | null, initiallyActive = true) {
	const user = shallowRef(initial);
	const active = ref(initiallyActive);
	const view = render(defineComponent({
		setup() {
			useUserStatistics(user, { active });
			return { user };
		},
		template: '<p>{{ user?.notesCount }}</p>',
	}));
	return { ...view, user, active };
}

function deferredUsers() {
	let resolve!: (users: Misskey.entities.UserDetailed[]) => void;
	const promise = new Promise<Misskey.entities.UserDetailed[]>(resolvePromise => { resolve = resolvePromise; });
	return { promise, resolve };
}

function createMain() {
	return new EventEmitter<Misskey.Channels['main']['events']>() as Misskey.IChannelConnection<Misskey.Channels['main']>;
}

function setVisibility(visibility: DocumentVisibilityState) {
	documentVisibility = visibility;
	window.document.dispatchEvent(new Event('visibilitychange'));
}

async function flush(milliseconds = 50) {
	await vi.advanceTimersByTimeAsync(milliseconds);
	await nextTick();
}

function sentIds(type: 'subUser' | 'unsubUser') {
	return vi.mocked(stream.send).mock.calls
		.filter(call => call[0] === type)
		.map(call => (call[1] as { id: string }).id);
}

describe('shared user statistics', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.spyOn(window.document, 'visibilityState', 'get').mockImplementation(() => documentVisibility);
		mocks.api.mockReset().mockResolvedValue([]);
		mocks.account.current = { id: 'self', token: 'keep-token', notesCount: 3, followingCount: 4, followersCount: 5, autoAcceptFollowed: true };
		mocks.updateAccount.mockReset().mockImplementation(patch => Object.assign(mocks.account.current!, patch));
		stream.state = 'connected';
		store.r.realtimeMode.value = true;
		await nextTick();
		setVisibility('visible');
		initializeUserStatisticsSync();
		await flush();
		mocks.api.mockClear();
		mocks.updateAccount.mockClear();
		vi.mocked(stream.send).mockClear();
	});

	afterEach(async () => {
		cleanup();
		setVisibility('hidden');
		await Promise.resolve();
		await nextTick();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test('broadcasts only defined statistics to matching views without mutating source objects', () => {
		const source = makeUser('alice', { isFollowing: false, isFollowed: true, hasPendingFollowRequestFromYou: true });
		const first = mountStatistics(source);
		const second = mountStatistics(source);
		const other = mountStatistics(makeUser('bob'));
		publishUserStatistics({ ...makeUser('alice', { name: 'Unrelated profile change', notesCount: 25 }), followingCount: undefined, isFollowing: true, hasPendingFollowRequestFromYou: false });

		for (const view of [first, second]) {
			expect(view.user.value).toMatchObject({ name: 'alice', notesCount: 25, followingCount: 8, isFollowing: true, isFollowed: true, hasPendingFollowRequestFromYou: false });
			expect(view.user.value).not.toBe(source);
		}
		expect(first.user.value).not.toBe(second.user.value);
		expect(source).toMatchObject({ notesCount: 7, isFollowing: false, hasPendingFollowRequestFromYou: true });
		expect(other.user.value?.notesCount).toBe(7);
	});

	test('refreshes visible online indicators when another user changes presence or goes invisible', async () => {
		const view = mountStatistics(makeUser('alice', { onlineStatus: 'online' }));
		await flush();
		mocks.api.mockResolvedValue([{ id: 'alice', onlineStatus: 'busy' }]);
		stream.emit('userStatsUpdated', { userIds: ['alice'] });
		await flush();
		expect(view.user.value?.onlineStatus).toBe('busy');
		mocks.api.mockResolvedValue([{ id: 'alice', onlineStatus: 'unknown' }]);
		stream.emit('userStatsUpdated', { userIds: ['alice'] });
		await flush();
		expect(view.user.value?.onlineStatus).toBe('unknown');
	});

	test('refreshes custom status text and removes it when the public snapshot becomes offline', async () => {
		const original = { icon: 'coffee', text: 'Taking a break' } as const;
		const source = makeUser('alice', { onlineStatus: 'online', customStatus: original });
		const view = mountStatistics(source);
		await flush();
		const changed = { icon: 'music', text: 'Listening' } as const;
		mocks.api.mockResolvedValueOnce([{ id: 'alice', onlineStatus: 'online', customStatus: changed }]);
		stream.emit('userStatsUpdated', { userIds: ['alice'] });
		await flush();
		expect(view.user.value).toMatchObject({ onlineStatus: 'online', customStatus: changed });
		publishUserStatistics({ id: 'alice', notesCount: 8 });
		expect(view.user.value?.customStatus).toEqual(changed);
		mocks.api.mockResolvedValueOnce([{ id: 'alice', onlineStatus: 'offline', customStatus: null }]);
		stream.emit('userStatsUpdated', { userIds: ['alice'] });
		await flush();
		expect(view.user.value).toMatchObject({ onlineStatus: 'offline', customStatus: null });
		expect(source.customStatus).toEqual(original);
		expect(mocks.updateAccount).not.toHaveBeenCalled();
	});

	test('applies self custom status edits and removal without changing invisible preferences', () => {
		const main = createMain();
		initializeUserStatisticsSync(main);
		Object.assign(mocks.account.current!, { hideOnlineStatus: true, onlineStatusOverride: 'busy' });
		const customStatus = { icon: 'book', text: 'Reading' } as const;
		main.emit('meUpdated', { id: 'self', customStatus } as Misskey.entities.MeDetailed);
		expect(mocks.updateAccount).toHaveBeenCalledExactlyOnceWith({ customStatus });
		expect(mocks.account.current).toMatchObject({ customStatus, hideOnlineStatus: true, onlineStatusOverride: 'busy', token: 'keep-token' });
		main.emit('meUpdated', { id: 'self', customStatus: null } as Misskey.entities.MeDetailed);
		expect(mocks.updateAccount).toHaveBeenLastCalledWith({ customStatus: null });
		expect(mocks.account.current).toMatchObject({ customStatus: null, hideOnlineStatus: true, onlineStatusOverride: 'busy', token: 'keep-token' });
	});

	test('merges only changed self counts while preserving token and settings', () => {
		publishUserStatistics({ ...makeUser('self', { notesCount: 10, followingCount: 4, followersCount: 5 }), isFollowing: true });
		expect(mocks.updateAccount).toHaveBeenCalledExactlyOnceWith({ notesCount: 10 });
		expect(mocks.account.current).toMatchObject({ token: 'keep-token', autoAcceptFollowed: true, notesCount: 10, followingCount: 4, followersCount: 5 });
		expect(mocks.account.current).not.toHaveProperty('isFollowing');
		publishUserStatistics({ id: 'self', notesCount: 10, followingCount: undefined });
		expect(mocks.updateAccount).toHaveBeenCalledOnce();
	});

	test('deduplicates network subscriptions across views and releases only the last active reference', async () => {
		const first = mountStatistics(makeUser('alice'));
		const second = mountStatistics(makeUser('alice'));
		await flush();
		expect(sentIds('subUser')).toEqual(['alice']);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show-partial-bulk', { userIds: ['alice'] });
		first.unmount();
		await flush();
		expect(sentIds('unsubUser')).toEqual([]);
		second.active.value = false;
		await flush();
		expect(sentIds('unsubUser')).toEqual(['alice']);

		// A mounted inactive view can still receive local authoritative updates.
		publishUserStatistics({ id: 'alice', notesCount: 19 });
		expect(second.user.value?.notesCount).toBe(19);
		second.unmount();
		publishUserStatistics({ id: 'alice', notesCount: 20 });
		expect(second.user.value?.notesCount).toBe(19);
	});

	test('switches reused component IDs immediately and ignores stale pending captures', async () => {
		const view = mountStatistics(makeUser('alice'));
		view.user.value = makeUser('bob');
		await flush();
		expect(sentIds('subUser')).toEqual(['bob']);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show-partial-bulk', { userIds: ['bob'] });
		publishUserStatistics({ id: 'alice', notesCount: 30 });
		expect(view.user.value.notesCount).toBe(7);
		publishUserStatistics({ id: 'bob', notesCount: 31 });
		expect(view.user.value.notesCount).toBe(31);
		view.user.value = null;
		await flush();
		expect(sentIds('unsubUser')).toEqual(['bob']);
	});

	test('refreshes a newly mounted stale snapshot even while another view already captures the same user', async () => {
		const first = mountStatistics(makeUser('alice'));
		mocks.api.mockResolvedValueOnce([makeUser('alice', { notesCount: 20 })]);
		await flush();
		expect(first.user.value?.notesCount).toBe(20);
		mocks.api.mockClear().mockResolvedValueOnce([makeUser('alice', { notesCount: 21 })]);
		const second = mountStatistics(makeUser('alice'));
		expect(second.user.value?.notesCount).toBe(7);
		await flush();
		expect(first.user.value?.notesCount).toBe(21);
		expect(second.user.value?.notesCount).toBe(21);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show-partial-bulk', { userIds: ['alice'] });
		expect(sentIds('subUser')).toEqual(['alice']);
		await flush(500);
		expect(mocks.api).toHaveBeenCalledOnce();
	});

	test('merges refreshes within 50ms, including explicit requests for an unmounted target', async () => {
		const alice = mountStatistics(makeUser('alice'));
		mocks.api.mockResolvedValueOnce([makeUser('alice', { notesCount: 15 }), makeUser('bob')]);
		const first = refreshUserStatistics(['alice', 'alice']);
		const second = refreshUserStatistics(['bob', 'alice']);
		await flush(49);
		expect(mocks.api).not.toHaveBeenCalled();
		await flush(1);
		await Promise.all([first, second]);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show-partial-bulk', { userIds: ['alice', 'bob'] });
		expect(alice.user.value?.notesCount).toBe(15);
		await refreshUserStatistics([]);
		expect(mocks.api).toHaveBeenCalledOnce();
	});

	test('splits large refreshes into batches of 30 with at most one batch in flight', async () => {
		const ids = Array.from({ length: 65 }, (_, index) => 'user-' + index);
		const firstBatch = deferredUsers();
		mocks.api.mockReturnValueOnce(firstBatch.promise);
		const refresh = refreshUserStatistics(ids);
		await flush();
		await flush(500);
		expect(mocks.api).toHaveBeenCalledOnce();
		expect(mocks.api.mock.calls[0][1].userIds).toHaveLength(30);
		firstBatch.resolve([]);
		await Promise.resolve();
		await flush(100);
		await refresh;
		expect(mocks.api.mock.calls.map(call => call[1].userIds.length)).toEqual([30, 30, 5]);
		expect(mocks.api.mock.calls.flatMap(call => call[1].userIds)).toEqual(ids);
	});

	test('caps streaming at 100 unique users including self and promotes overflow when space opens', async () => {
		const views = Array.from({ length: 103 }, (_, index) => mountStatistics(makeUser('user-' + index)));
		await flush(200);
		expect(sentIds('subUser')).toHaveLength(99);
		expect(sentIds('subUser')).not.toContain('user-99');
		expect(mocks.api.mock.calls.flatMap(call => call[1].userIds)).toHaveLength(103);
		views[0].unmount();
		await flush();
		expect(sentIds('unsubUser')).toEqual(['user-0']);
		expect(sentIds('subUser')).toContain('user-99');
	});

	test('pauses network work in the background and resubscribes with one refresh on return', async () => {
		mountStatistics(makeUser('alice'));
		await flush();
		mocks.api.mockClear();
		vi.mocked(stream.send).mockClear();
		setVisibility('hidden');
		expect(sentIds('unsubUser')).toEqual(['self', 'alice']);
		stream.emit('userStatsUpdated', { userIds: ['alice', 'self'] });
		globalEvents.emit('notePosted', { userId: 'self' } as Misskey.entities.Note);
		await flush(90_000);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(sentIds('subUser')).toEqual([]);
		setVisibility('visible');
		await flush();
		expect(sentIds('subUser')).toEqual(['self', 'alice']);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show-partial-bulk', { userIds: ['alice', 'self'] });
	});

	test('resubscribes and refreshes active users once after stream reconnects', async () => {
		mountStatistics(makeUser('alice'));
		mountStatistics(makeUser('alice'));
		mountStatistics(makeUser('inactive'), false);
		await flush();
		mocks.api.mockClear();
		vi.mocked(stream.send).mockClear();
		stream.state = 'reconnecting';
		stream.emit('_disconnected_');
		stream.state = 'connected';
		stream.emit('_connected_');
		expect(sentIds('subUser')).toEqual([]);
		await flush();
		expect(sentIds('subUser')).toEqual(['self', 'alice']);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show-partial-bulk', { userIds: ['self', 'alice'] });
	});

	test('applies an in-flight snapshot and completes its waiter while pushes schedule one follow-up', async () => {
		const alice = mountStatistics(makeUser('alice'));
		await flush();
		const old = deferredUsers();
		mocks.api.mockClear().mockReturnValueOnce(old.promise).mockResolvedValueOnce([makeUser('alice', { notesCount: 21 })]);
		const refresh = refreshUserStatistics(['alice']);
		const resolved = vi.fn();
		void refresh.then(resolved);
		await flush();
		stream.emit('userStatsUpdated', { userIds: ['alice'] });
		await flush();
		expect(mocks.api).toHaveBeenCalledOnce();
		old.resolve([makeUser('alice', { notesCount: 10 })]);
		await refresh;
		expect(alice.user.value?.notesCount).toBe(10);
		expect(resolved).toHaveBeenCalledOnce();
		await flush();
		expect(alice.user.value?.notesCount).toBe(21);
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('keeps displaying progress and completes explicit refreshes during continuous 250ms pushes and slow HTTP', async () => {
		const alice = mountStatistics(makeUser('alice'));
		await flush();
		const firstResponse = deferredUsers();
		const secondResponse = deferredUsers();
		mocks.api.mockClear().mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(secondResponse.promise);
		const refresh = refreshUserStatistics(['alice']);
		await flush();
		for (let push = 0; push < 4; push++) {
			stream.emit('userStatsUpdated', { userIds: ['alice'] });
			await flush(250);
		}
		expect(mocks.api).toHaveBeenCalledOnce();
		firstResponse.resolve([makeUser('alice', { notesCount: 10 })]);
		await refresh;
		expect(alice.user.value?.notesCount).toBe(10);
		await flush();
		for (let push = 0; push < 4; push++) {
			stream.emit('userStatsUpdated', { userIds: ['alice'] });
			await flush(250);
		}
		expect(mocks.api).toHaveBeenCalledTimes(2);
		secondResponse.resolve([makeUser('alice', { notesCount: 14 })]);
		await Promise.resolve();
		await nextTick();
		expect(alice.user.value?.notesCount).toBe(14);
		await flush();
		expect(mocks.api).toHaveBeenCalledTimes(3);
	});

	test('serves waiting users before continuously dirty users from the previous batch', async () => {
		const ids = Array.from({ length: 31 }, (_, index) => 'hot-' + index);
		const firstResponse = deferredUsers();
		mocks.api.mockImplementation((_endpoint: string, { userIds }: { userIds: string[] }) => Promise.resolve(userIds.map(id => makeUser(id, { notesCount: 20 }))));
		mocks.api.mockReturnValueOnce(firstResponse.promise);
		for (const id of ids) mountStatistics(makeUser(id));
		const refresh = refreshUserStatistics(ids);
		await flush();
		for (let push = 0; push < 4; push++) {
			stream.emit('userStatsUpdated', { userIds: ids.slice(0, 30) });
			await flush(250);
		}
		firstResponse.resolve(ids.slice(0, 30).map(id => makeUser(id, { notesCount: 15 })));
		await Promise.resolve();
		await flush();
		await refresh;
		expect(mocks.api.mock.calls[1][1].userIds[0]).toBe('hot-30');
		expect(mocks.api.mock.calls[1][1].userIds).toHaveLength(30);
		await flush();
		expect(mocks.api.mock.calls[2][1].userIds).toEqual(['hot-29']);
	});

	test('starts a newer explicit refresh after the current request instead of resolving it with pre-action data', async () => {
		const alice = mountStatistics(makeUser('alice'));
		await flush();
		const old = deferredUsers();
		mocks.api.mockClear().mockReturnValueOnce(old.promise).mockResolvedValueOnce([makeUser('alice', { notesCount: 22 })]);
		const first = refreshUserStatistics(['alice']);
		await flush();
		const afterAction = refreshUserStatistics(['alice']);
		const completed = vi.fn();
		void afterAction.then(completed);
		old.resolve([makeUser('alice', { notesCount: 10 })]);
		await Promise.resolve();
		await nextTick();
		expect(completed).not.toHaveBeenCalled();
		expect(alice.user.value?.notesCount).toBe(7);
		await flush();
		await Promise.all([first, afterAction]);
		expect(alice.user.value?.notesCount).toBe(22);
		expect(completed).toHaveBeenCalledOnce();
	});

	test('keeps a local relationship update while fetching fresh counts after an older request', async () => {
		const alice = mountStatistics(makeUser('alice', { isFollowing: false }));
		await flush();
		const old = deferredUsers();
		mocks.api.mockClear().mockReturnValueOnce(old.promise).mockResolvedValueOnce([makeUser('alice', { isFollowing: true, followersCount: 11 })]);
		const first = refreshUserStatistics(['alice']);
		await flush();
		publishUserStatistics({ id: 'alice', isFollowing: true });
		const afterAction = refreshUserStatistics(['alice']);
		old.resolve([makeUser('alice', { isFollowing: false, followersCount: 9 })]);
		await Promise.resolve();
		await nextTick();
		expect(alice.user.value?.isFollowing).toBe(true);
		await flush();
		await Promise.all([first, afterAction]);
		expect(alice.user.value).toMatchObject({ isFollowing: true, followersCount: 11 });
	});

	test('applies relationship and visibility fields without treating omitted fields as zero', async () => {
		const alice = mountStatistics(makeUser('alice', { isFollowing: true, isFollowed: true }));
		mocks.api.mockResolvedValueOnce([{ id: 'alice', followersCount: 0, followersVisibility: 'private', isFollowing: false, hasPendingFollowRequestFromYou: false }]);
		await flush();
		expect(alice.user.value).toMatchObject({ notesCount: 7, followingCount: 8, followersCount: 0, followersVisibility: 'private', isFollowing: false, isFollowed: true });
		mocks.api.mockResolvedValueOnce([{ id: 'alice', followersCount: 17, followersVisibility: 'public' }]);
		stream.emit('userStatsUpdated', { userIds: ['alice'] });
		await flush();
		expect(alice.user.value).toMatchObject({ followersCount: 17, followersVisibility: 'public' });
	});

	test('rejects failed explicit refreshes and allows a later retry', async () => {
		const alice = mountStatistics(makeUser('alice'));
		await flush();
		mocks.api.mockRejectedValueOnce(new Error('temporary failure'));
		const failure = expect(refreshUserStatistics(['alice'])).rejects.toThrow('temporary failure');
		await flush();
		await failure;
		expect(alice.user.value?.notesCount).toBe(7);
		mocks.api.mockResolvedValueOnce([makeUser('alice', { notesCount: 19 })]);
		const retry = refreshUserStatistics(['alice']);
		await flush();
		await retry;
		expect(alice.user.value?.notesCount).toBe(19);
	});

	test('does not invalidate a slow authoritative response just because the polling interval elapsed', async () => {
		const alice = mountStatistics(makeUser('alice'));
		await flush();
		const slow = deferredUsers();
		mocks.api.mockClear().mockReturnValueOnce(slow.promise);
		const refresh = refreshUserStatistics(['alice']);
		await flush(60_000);
		expect(mocks.api).toHaveBeenCalledOnce();
		slow.resolve([makeUser('alice', { notesCount: 24 })]);
		await refresh;
		expect(alice.user.value?.notesCount).toBe(24);
		await flush();
		expect(mocks.api.mock.calls.filter(call => call[1].userIds.includes('alice'))).toHaveLength(1);
	});

	test('uses 30-second polling without WebSocket capture when realtime mode is off', async () => {
		store.r.realtimeMode.value = false;
		await nextTick();
		vi.mocked(stream.send).mockClear();
		mountStatistics(makeUser('alice'));
		await flush();
		mocks.api.mockClear();
		await flush(29_850);
		expect(mocks.api).not.toHaveBeenCalled();
		await flush(100);
		expect(mocks.api).toHaveBeenCalledOnce();
		expect(mocks.api.mock.lastCall?.[1].userIds).toEqual(expect.arrayContaining(['self', 'alice']));
		expect(sentIds('subUser')).toEqual([]);
	});

	test('round-robins lightweight polling across all active users including streaming overflow', async () => {
		for (let index = 0; index < 105; index++) mountStatistics(makeUser('user-' + index));
		await flush(200);
		mocks.api.mockClear();
		await flush(30_000);
		await flush(30_000);
		await flush(30_000);
		await flush(30_000);
		const polled = new Set(mocks.api.mock.calls.flatMap(call => call[1].userIds));
		expect(polled.size).toBe(106);
		expect(polled.has('user-104')).toBe(true);
		expect(mocks.api.mock.calls.every(call => call[1].userIds.length <= 30)).toBe(true);
	});

	test('keeps self active, refreshes precise posted authors, and excludes inactive users from deletion recovery', async () => {
		mountStatistics(makeUser('alice'));
		mountStatistics(makeUser('inactive'), false);
		await flush();
		mocks.api.mockClear();
		globalEvents.emit('notePosted', { userId: 'self' } as Misskey.entities.Note);
		await flush();
		expect(mocks.api).toHaveBeenLastCalledWith('users/show-partial-bulk', { userIds: ['self'] });
		globalEvents.emit('noteDeleted', 'unknown-author-note');
		await flush();
		expect(mocks.api).toHaveBeenLastCalledWith('users/show-partial-bulk', { userIds: ['self', 'alice'] });
		cleanup();
		await flush();
		const refresh = refreshVisibleUserStatistics();
		await flush();
		await refresh;
		expect(mocks.api).toHaveBeenLastCalledWith('users/show-partial-bulk', { userIds: ['self'] });
	});

	test('publishes main-stream patches once and refreshes followed users without refreshing all other cards', async () => {
		const main = createMain();
		initializeUserStatisticsSync(main);
		initializeUserStatisticsSync(main);
		expect(main.listenerCount('follow')).toBe(1);
		expect(main.listenerCount('meUpdated')).toBe(1);
		const alice = mountStatistics(makeUser('alice'));
		mountStatistics(makeUser('bob'));
		await flush();
		mocks.api.mockClear();
		main.emit('follow', makeUser('alice', { isFollowing: true, followersCount: 40 }));
		expect(alice.user.value).toMatchObject({ isFollowing: true, followersCount: 40 });
		main.emit('unfollow', makeUser('alice', { isFollowing: false, followersCount: 39 }));
		expect(alice.user.value).toMatchObject({ isFollowing: false, followersCount: 39 });
		main.emit('meUpdated', makeUser('self', { notesCount: 13 }));
		await flush();
		expect(mocks.account.current?.notesCount).toBe(13);
		expect(mocks.api).not.toHaveBeenCalled();
		main.emit('followed', { id: 'alice' } as Misskey.entities.UserLite);
		await flush();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show-partial-bulk', { userIds: ['alice', 'self'] });
	});

	test('detaches previous main listeners and ignores pushes for unused users', async () => {
		const oldMain = createMain();
		const newMain = createMain();
		initializeUserStatisticsSync(oldMain);
		initializeUserStatisticsSync(newMain);
		for (const event of ['follow', 'unfollow', 'meUpdated', 'followed'] as const) {
			expect(oldMain.listenerCount(event)).toBe(0);
			expect(newMain.listenerCount(event)).toBe(1);
		}
		const alice = mountStatistics(makeUser('alice'));
		await flush();
		mocks.api.mockClear();
		oldMain.emit('follow', makeUser('alice', { notesCount: 100 }));
		expect(alice.user.value?.notesCount).toBe(7);
		stream.emit('userStatsUpdated', { userIds: ['not-mounted'] });
		await flush();
		expect(mocks.api).not.toHaveBeenCalled();
		newMain.emit('follow', makeUser('alice', { notesCount: 101 }));
		expect(alice.user.value?.notesCount).toBe(101);
	});

	test('supports signed-out visible users without inventing an account subscription', async () => {
		mocks.account.current = null;
		mountStatistics(makeUser('alice'));
		await flush();
		expect(sentIds('subUser')).toEqual(['alice']);
		expect(sentIds('unsubUser')).toEqual(['self']);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show-partial-bulk', { userIds: ['alice'] });
		expect(mocks.updateAccount).not.toHaveBeenCalled();
	});
});
