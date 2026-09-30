/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { effectScope, onActivated, onDeactivated, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import { globalEvents } from '@/events.js';
import { $i } from '@/i.js';
import { store } from '@/store.js';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const accountFields = ['notesCount', 'followingCount', 'followersCount', 'onlineStatus', 'customStatus'] as const;
const statisticFields = [...accountFields, 'isFollowing', 'isFollowed', 'hasPendingFollowRequestFromYou', 'followingVisibility', 'followersVisibility'] as const;
const BATCH_DELAY = 50;
const BATCH_SIZE = 30;
const MAX_SUBSCRIPTIONS = 100;
const POLLING_INTERVAL = 30_000;

type Statistics = Partial<Pick<Misskey.entities.UserDetailed, typeof statisticFields[number]>>;
export type UserStatisticsPatch = Pick<Misskey.entities.UserDetailed, 'id'> & Statistics;
type MainConnection = Misskey.IChannelConnection<Misskey.Channels['main']>;
type RefreshJob = {
	revision: number;
	dirty: boolean;
	inFlight: boolean;
	waiters: { resolve: () => void; reject: (reason: unknown) => void }[];
};

const subscriptions = new Map<string, Set<(statistics: Statistics) => void>>();
const activeReferences = new Map<string, number>();
const refreshJobs = new Map<string, RefreshJob>();
const lastRefreshed = new Map<string, number>();
const streamSubscriptions = new Set<string>();
let batchTimer: number | null = null;
let pollingTimer: number | null = null;
let batchInFlight = false;
let initialized = false;
let mainConnection: MainConnection | undefined;
let stream: Misskey.IStream | null = null;
let refreshSequence = 0;

function isVisible(): boolean {
	return window.document.visibilityState === 'visible';
}

function activeUserIds(): string[] {
	return [...new Set([...($i ? [$i.id] : []), ...activeReferences.keys()])];
}

function isActive(id: string): boolean {
	return id === $i?.id || activeReferences.has(id);
}

function discardUnusedJob(id: string, job: RefreshJob): void {
	if (!job.inFlight && job.waiters.length === 0 && (!job.dirty || !isActive(id))) refreshJobs.delete(id);
}

function scheduleBatch(): void {
	if (!isVisible() || batchTimer != null) return;
	batchTimer = window.setTimeout(flushBatch, BATCH_DELAY);
}

function queueRefresh(id: string, invalidateInFlight = false): RefreshJob {
	let job = refreshJobs.get(id);
	if (job == null) {
		job = { revision: 0, dirty: false, inFlight: false, waiters: [] };
		refreshJobs.set(id, job);
	}
	// Pushes request another snapshot without starving an in-flight response.
	// Local mutations and explicit refreshes must instead reject older snapshots.
	if (invalidateInFlight) job.revision++;
	job.dirty = true;
	scheduleBatch();
	return job;
}

function refreshActiveInBackground(ids: string[]): void {
	for (const id of new Set(ids)) {
		if (isActive(id)) queueRefresh(id);
	}
}

function syncStreamSubscriptions(): void {
	if (stream == null || stream.state !== 'connected') return;
	const desired = new Set(isVisible() ? activeUserIds().slice(0, MAX_SUBSCRIPTIONS) : []);
	for (const id of streamSubscriptions) {
		if (desired.has(id)) continue;
		stream.send('unsubUser', { id });
		streamSubscriptions.delete(id);
	}
	for (const id of desired) {
		if (streamSubscriptions.has(id)) continue;
		stream.send('subUser', { id });
		streamSubscriptions.add(id);
	}
}

function applyStatistics(user: UserStatisticsPatch): void {
	const statistics = Object.fromEntries(statisticFields
		.filter(field => user[field] !== undefined)
		.map(field => [field, user[field]])) as Statistics;
	if (Object.keys(statistics).length === 0) return;
	const me = $i;
	if (me?.id === user.id) {
		const account = Object.fromEntries(accountFields
			.filter(field => statistics[field] !== undefined && statistics[field] !== me[field])
			.map(field => [field, statistics[field]]));
		if (Object.keys(account).length > 0) updateCurrentAccountPartial(account);
	}
	for (const update of subscriptions.get(user.id) ?? []) update(statistics);
}

async function flushBatch(): Promise<void> {
	batchTimer = null;
	if (!isVisible()) return;
	syncStreamSubscriptions();
	if (batchInFlight) return;
	const batch: { id: string; job: RefreshJob; revision: number }[] = [];
	for (const [id, job] of refreshJobs) {
		if (!job.dirty || (!isActive(id) && job.waiters.length === 0)) {
			discardUnusedJob(id, job);
			continue;
		}
		job.dirty = false;
		job.inFlight = true;
		batch.push({ id, job, revision: job.revision });
		if (batch.length >= BATCH_SIZE) break;
	}
	if (batch.length === 0) return;
	// Repeatedly invalidated users wait behind users not served by this batch.
	for (const { id, job } of batch) {
		refreshJobs.delete(id);
		refreshJobs.set(id, job);
	}
	batchInFlight = true;
	try {
		const users = await misskeyApi('users/show-partial-bulk', { userIds: batch.map(entry => entry.id) });
		const results = new Map(users.map(user => [user.id, user]));
		for (const { id, job, revision } of batch) {
			if (job.revision !== revision) continue;
			const user = results.get(id);
			if (user) applyStatistics(user);
			if (isActive(id)) lastRefreshed.set(id, ++refreshSequence);
			for (const waiter of job.waiters.splice(0)) waiter.resolve();
		}
	} catch (error) {
		for (const { job, revision } of batch) {
			if (job.revision !== revision) continue;
			for (const waiter of job.waiters.splice(0)) waiter.reject(error);
		}
	} finally {
		batchInFlight = false;
		for (const { id, job } of batch) {
			job.inFlight = false;
			discardUnusedJob(id, job);
		}
		if ([...refreshJobs.values()].some(job => job.dirty)) scheduleBatch();
	}
}

function onStatisticsUpdated({ userIds }: { userIds: string[] }): void {
	refreshActiveInBackground(userIds);
}

function onConnected(): void {
	streamSubscriptions.clear();
	refreshActiveInBackground(activeUserIds());
	scheduleBatch();
}

function onDisconnected(): void {
	streamSubscriptions.clear();
}

function syncRealtimeMode(): void {
	if (store.s.realtimeMode) {
		if (stream != null) return;
		stream = useStream();
		stream.on('userStatsUpdated', onStatisticsUpdated);
		stream.on('_connected_', onConnected);
		stream.on('_disconnected_', onDisconnected);
		scheduleBatch();
	} else if (stream != null) {
		if (stream.state === 'connected') {
			for (const id of streamSubscriptions) stream.send('unsubUser', { id });
		}
		streamSubscriptions.clear();
		stream.off('userStatsUpdated', onStatisticsUpdated);
		stream.off('_connected_', onConnected);
		stream.off('_disconnected_', onDisconnected);
		stream = null;
	}
}

function pollStatistics(): void {
	if (!isVisible()) return;
	const ids = activeUserIds()
		.filter(id => !refreshJobs.has(id))
		.sort((a, b) => (lastRefreshed.get(a) ?? 0) - (lastRefreshed.get(b) ?? 0))
		.slice(0, BATCH_SIZE);
	refreshActiveInBackground(ids);
}

function onVisibilityChange(): void {
	if (!isVisible()) {
		if (batchTimer != null) window.clearTimeout(batchTimer);
		if (pollingTimer != null) window.clearInterval(pollingTimer);
		batchTimer = null;
		pollingTimer = null;
		syncStreamSubscriptions();
		return;
	}
	if (pollingTimer == null) pollingTimer = window.setInterval(pollStatistics, POLLING_INTERVAL);
	refreshActiveInBackground(activeUserIds());
	scheduleBatch();
}

function ensureInitialized(): void {
	if (initialized) return;
	initialized = true;
	window.document.addEventListener('visibilitychange', onVisibilityChange);
	globalEvents.on('notePosted', note => refreshActiveInBackground([note.userId]));
	globalEvents.on('noteDeleted', () => refreshActiveInBackground(activeUserIds()));
	// This watcher belongs to the application, not the component initializing it.
	effectScope(true).run(() => watch(store.r.realtimeMode, syncRealtimeMode, { immediate: true }));
	onVisibilityChange();
}

export function useUserStatistics(user: Ref<Misskey.entities.UserDetailed | null>, options: {
	active?: Readonly<Ref<boolean>>;
} = {}): void {
	ensureInitialized();
	const activated = ref(true);
	onActivated(() => { activated.value = true; });
	onDeactivated(() => { activated.value = false; });
	watch(() => user.value?.id, (id, _previousId, onCleanup) => {
		if (id == null) return;
		const update = (statistics: Statistics) => {
			if (user.value?.id === id) user.value = { ...user.value, ...statistics };
		};
		let listeners = subscriptions.get(id);
		if (listeners == null) {
			listeners = new Set();
			subscriptions.set(id, listeners);
		}
		listeners.add(update);
		onCleanup(() => {
			listeners.delete(update);
			if (listeners.size === 0) subscriptions.delete(id);
		});
	}, { immediate: true, flush: 'sync' });
	watch(() => activated.value && (options.active?.value ?? true) ? user.value?.id : undefined, (id, _previousId, onCleanup) => {
		if (id == null) return;
		const references = activeReferences.get(id) ?? 0;
		activeReferences.set(id, references + 1);
		queueRefresh(id);
		onCleanup(() => {
			const remaining = (activeReferences.get(id) ?? 1) - 1;
			if (remaining === 0) {
				activeReferences.delete(id);
				if (id !== $i?.id) lastRefreshed.delete(id);
				const job = refreshJobs.get(id);
				if (job) discardUnusedJob(id, job);
				scheduleBatch();
			} else {
				activeReferences.set(id, remaining);
			}
		});
	}, { immediate: true, flush: 'sync' });
}

export function publishUserStatistics(user: UserStatisticsPatch): void {
	if (!statisticFields.some(field => user[field] !== undefined)) return;
	const job = refreshJobs.get(user.id);
	if (job?.inFlight) queueRefresh(user.id, true);
	applyStatistics(user);
}

export function refreshUserStatistics(userIds: string[]): Promise<void> {
	ensureInitialized();
	return Promise.all([...new Set(userIds)].map(id => new Promise<void>((resolve, reject) => {
		queueRefresh(id, true).waiters.push({ resolve, reject });
	}))).then(() => undefined);
}

export function refreshVisibleUserStatistics(): Promise<void> {
	return refreshUserStatistics(isVisible() ? activeUserIds() : []);
}

function onFollowed(user: Misskey.entities.UserLite): void {
	refreshActiveInBackground([user.id, ...($i ? [$i.id] : [])]);
}

export function initializeUserStatisticsSync(main?: MainConnection): void {
	ensureInitialized();
	if (main == null || main === mainConnection) return;
	mainConnection?.off('follow', publishUserStatistics);
	mainConnection?.off('unfollow', publishUserStatistics);
	mainConnection?.off('meUpdated', publishUserStatistics);
	mainConnection?.off('followed', onFollowed);
	mainConnection = main;
	main.on('follow', publishUserStatistics);
	main.on('unfollow', publishUserStatistics);
	main.on('meUpdated', publishUserStatistics);
	main.on('followed', onFollowed);
}
