/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, inject, onActivated, onDeactivated, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import { DI } from '@/di.js';
import { $i } from '@/i.js';
import { checkinDateInZone } from '@/utility/checkin.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type CheckinStatus = Pick<entities.ICheckinStatusResponse, 'today' | 'checkedInToday' | 'timeZone'>;
type AccountState = {
	status: ReturnType<typeof shallowRef<CheckinStatus | null>>;
	observedLocalDate: string;
	revision: number;
	pending: Promise<void> | null;
	refreshAgain: boolean;
	projected: boolean;
	needsRefresh: boolean;
};
type Consumer = { accountId: string | undefined; active: boolean; refresh: boolean };

const states = new Map<string, AccountState>();
const consumers = new Set<Consumer>();
const channelName = 'misskey:checkin-status';
let channel: BroadcastChannel | null = null;
let timer: number | undefined;

function accountState(accountId: string): AccountState {
	let state = states.get(accountId);
	if (!state) {
		state = { status: shallowRef(null), observedLocalDate: '', revision: 0, pending: null, refreshAgain: false, projected: false, needsRefresh: true };
		states.set(accountId, state);
	}
	return state;
}

function applyStatus(accountId: string, incoming: CheckinStatus, allowEarlier = false): void {
	const state = accountState(accountId);
	const previous = state.status.value;
	if (previous && previous.today > incoming.today && !allowEarlier) return;
	state.revision++;
	state.projected = false;
	state.needsRefresh = false;
	state.status.value = {
		today: incoming.today,
		timeZone: incoming.timeZone,
		// A completed day cannot become unchecked because an older request finished later.
		checkedInToday: incoming.checkedInToday || (previous?.today === incoming.today && previous.checkedInToday),
	};
	state.observedLocalDate = checkinDateInZone(new Date(), incoming.timeZone);
}

/** Publish a server response without storing account credentials or the user's calendar. */
export function publishCheckinStatus(accountId: string, status: CheckinStatus, options: { broadcast?: boolean } = {}): void {
	applyStatus(accountId, status, accountState(accountId).projected);
	if (options.broadcast === false || typeof window.BroadcastChannel === 'undefined') return;
	try {
		const target = channel ?? new window.BroadcastChannel(channelName);
		target.postMessage({ accountId, ...accountState(accountId).status.value });
		if (target !== channel) target.close();
	} catch {
		// Cross-tab notification is optional; a completed check-in remains successful.
	}
}

function expirePreviousDay(accountId: string): boolean {
	const state = accountState(accountId);
	const status = state.status.value;
	if (!status) return false;
	const localDate = checkinDateInZone(new Date(), status.timeZone);
	if (localDate === state.observedLocalDate) return false;
	if (localDate < state.observedLocalDate) {
		// A corrected device clock invalidates our local date anchor, not the server's day.
		state.observedLocalDate = localDate;
		state.refreshAgain = true;
		state.needsRefresh = true;
		return true;
	}
	// Anchor to the server's date, even when the client's calendar is offset.
	const elapsed = Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${state.observedLocalDate}T00:00:00Z`);
	const today = new Date(Date.parse(`${status.today}T00:00:00Z`) + elapsed).toISOString().slice(0, 10);
	applyStatus(accountId, { ...status, today, checkedInToday: false });
	state.refreshAgain = true;
	state.projected = true;
	state.needsRefresh = true;
	return true;
}

export function refreshCheckinStatus(accountId = $i?.id): Promise<void> {
	if (!accountId || accountId !== $i?.id) return Promise.resolve();
	const state = accountState(accountId);
	expirePreviousDay(accountId);
	if (state.pending) return state.pending;
	state.pending = (async () => {
		do {
			state.refreshAgain = false;
			const revision = state.revision;
			const requestedAt = new Date();
			const result = await misskeyApi('i/checkin-status', {});
			if (accountId !== $i?.id) return;
			if (checkinDateInZone(requestedAt, result.timeZone) !== checkinDateInZone(new Date(), result.timeZone)) {
				// A response requested before midnight may describe the previous day.
				expirePreviousDay(accountId);
				state.refreshAgain = true;
			} else if (revision === state.revision) {
				applyStatus(accountId, result, state.projected);
			}
		} while (state.refreshAgain && accountId === $i?.id);
	})().catch(error => {
		state.needsRefresh = true;
		throw error;
	}).finally(() => { state.pending = null; });
	return state.pending;
}

function activeAccounts(): string[] {
	return [...new Set([...consumers].filter(consumer => consumer.active && consumer.refresh && consumer.accountId === $i?.id).map(consumer => consumer.accountId).filter((id): id is string => id != null))];
}

function refreshVisible(): void {
	if (window.document.visibilityState === 'hidden') return;
	for (const accountId of activeAccounts()) void refreshCheckinStatus(accountId).catch(() => {});
}

function receiveStatus(event: MessageEvent<unknown>): void {
	const message = event.data;
	if (typeof message !== 'object' || message === null) return;
	const value = message as Record<string, unknown>;
	if (typeof value.accountId !== 'string' || value.accountId !== $i?.id ||
		typeof value.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.today) ||
		typeof value.checkedInToday !== 'boolean' || typeof value.timeZone !== 'string') return;
	try {
		if (new Date(`${value.today}T00:00:00Z`).toISOString().slice(0, 10) !== value.today) return;
		checkinDateInZone(new Date(), value.timeZone);
		applyStatus(value.accountId, { today: value.today, checkedInToday: value.checkedInToday, timeZone: value.timeZone });
	} catch {
		// Ignore malformed cross-tab messages, including an unsupported time zone.
	}
}

function start(): void {
	window.addEventListener('focus', refreshVisible);
	window.addEventListener('online', refreshVisible);
	window.document.addEventListener('visibilitychange', refreshVisible);
	timer = window.setInterval(() => {
		if (window.document.visibilityState === 'hidden') return;
		for (const accountId of activeAccounts()) {
			if (expirePreviousDay(accountId) || accountState(accountId).needsRefresh) void refreshCheckinStatus(accountId).catch(() => {});
		}
	}, 30_000);
	if (typeof window.BroadcastChannel !== 'undefined') {
		try {
			channel = new window.BroadcastChannel(channelName);
			channel.addEventListener('message', receiveStatus);
		} catch {
			channel = null;
		}
	}
}

function stop(): void {
	window.removeEventListener('focus', refreshVisible);
	window.removeEventListener('online', refreshVisible);
	window.document.removeEventListener('visibilitychange', refreshVisible);
	window.clearInterval(timer);
	channel?.removeEventListener('message', receiveStatus);
	channel?.close();
	channel = null;
}

/** Shared, account-scoped state for check-in entry points. */
export function useCheckinStatus(options: { refresh?: boolean } = {}) {
	const accountId = computed(() => $i?.id);
	const pageActive = inject(DI.pageActive, shallowRef(true));
	const consumer: Consumer = { accountId: accountId.value, active: pageActive.value, refresh: options.refresh !== false };
	let mounted = false;
	let activated = true;
	const status = computed(() => accountId.value ? accountState(accountId.value).status.value : null);
	const checkedInToday = computed(() => status.value?.checkedInToday === true);
	const refresh = () => refreshCheckinStatus(accountId.value);
	const refreshInBackground = () => { if (mounted && consumer.active && consumer.refresh && window.document.visibilityState !== 'hidden') void refresh().catch(() => {}); };
	watch(accountId, id => { consumer.accountId = id; refreshInBackground(); });
	watch(pageActive, value => { consumer.active = activated && value; refreshInBackground(); });
	onMounted(() => {
		mounted = true;
		consumers.add(consumer);
		if (consumers.size === 1) start();
		refreshInBackground();
	});
	onActivated(() => { activated = true; consumer.active = pageActive.value; refreshInBackground(); });
	onDeactivated(() => { activated = false; consumer.active = false; });
	onUnmounted(() => {
		mounted = false;
		consumers.delete(consumer);
		if (consumers.size === 0) stop();
	});
	return { status, checkedInToday, refresh };
}
