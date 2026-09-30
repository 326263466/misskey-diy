/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, nextTick, ref } from 'vue';
import { publishCheckinStatus, refreshCheckinStatus, useCheckinStatus } from '@/composables/use-checkin-status.js';
import type { CheckinStatus } from '@/composables/use-checkin-status.js';
import CheckinCard from '@/ui/_common_/juejin-checkin.vue';
import { i18n } from '@/i18n.js';
import { DI } from '@/di.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), session: null as unknown as { account: { id: string } | null } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', async () => {
	const { reactive } = await import('vue');
	mocks.session = reactive({ account: { id: 'initial' } });
	return { get $i() { return mocks.session.account; } };
});

const Status = defineComponent({ setup: useCheckinStatus, template: '<div>{{ status?.today }}:{{ checkedInToday }}</div>' });
const SubscribedStatus = defineComponent({ setup: () => useCheckinStatus({ refresh: false }), template: '<div>{{ status?.today }}:{{ checkedInToday }}</div>' });
const channels: TestBroadcastChannel[] = [];
let nextAccount = 0;

class TestBroadcastChannel extends EventTarget {
	postMessage = vi.fn();
	close = vi.fn();
	constructor(public name: string) { super(); channels.push(this); }
}

function snapshot(checkedInToday = false, today = '2026-09-28'): CheckinStatus {
	return { today, checkedInToday, timeZone: 'Asia/Shanghai' };
}

function renderCard() {
	return render(CheckinCard, { global: { stubs: { MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' } } } });
}

async function settle() { await Promise.resolve(); await Promise.resolve(); await nextTick(); }

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
	vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
	vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
	mocks.session.account = { id: `account-${++nextAccount}` };
	mocks.api.mockReset().mockResolvedValue(snapshot());
	channels.length = 0;
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('shared check-in status', () => {
	test('deduplicates requests and updates every card without allowing a pending response to undo check-in', async () => {
		const pending = Promise.withResolvers<CheckinStatus>();
		mocks.api.mockReturnValue(pending.promise);
		const first = renderCard();
		const second = renderCard();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/checkin-status', {});
		publishCheckinStatus(mocks.session.account!.id, snapshot(true));
		await settle();
		expect(first.container.textContent).toContain(i18n.ts._checkin.checkedIn);
		expect(second.container.textContent).toContain(i18n.ts._checkin.checkedIn);
		pending.resolve(snapshot(false));
		await settle();
		expect(first.container.textContent).toContain(i18n.ts._checkin.checkedIn);
		expect(first.container.querySelector('a')!.getAttribute('href')).toBe('/checkin');
	});

	test('isolates accounts and ignores an earlier account response after switching or signing out', async () => {
		const old = Promise.withResolvers<CheckinStatus>();
		mocks.api.mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot());
		const view = render(Status);
		const oldId = mocks.session.account!.id;
		mocks.session.account = { id: `account-${++nextAccount}` };
		await settle();
		old.resolve(snapshot(true));
		await settle();
		expect(view.container.textContent).toBe('2026-09-28:false');
		publishCheckinStatus(oldId, snapshot(true));
		await settle();
		expect(view.container.textContent).toBe('2026-09-28:false');
		mocks.session.account = null;
		await settle();
		mocks.api.mockClear();
		window.dispatchEvent(new Event('focus'));
		await refreshCheckinStatus(oldId);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.container.textContent).toBe(':false');
	});

	test('keeps a published day when remounted and ignores older dates and unchecked snapshots', async () => {
		const id = mocks.session.account!.id;
		publishCheckinStatus(id, snapshot(true));
		const view = render(Status);
		await settle();
		publishCheckinStatus(id, snapshot(false, '2026-09-27'));
		await settle();
		expect(view.container.textContent).toBe('2026-09-28:true');
		view.unmount();
		const next = render(Status);
		await settle();
		expect(next.container.textContent).toBe('2026-09-28:true');
	});

	test('refreshes on focus and visibility while deduplicating and retries after a failure', async () => {
		const pending = Promise.withResolvers<CheckinStatus>();
		mocks.api.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(pending.promise);
		render(Status);
		await settle();
		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));
		expect(mocks.api).toHaveBeenCalledTimes(2);
		pending.resolve(snapshot(true));
		await settle();
		vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('retries failed requests when the connection returns and while the status remains stale', async () => {
		mocks.api.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(snapshot(true));
		const view = render(Status);
		await settle();
		window.dispatchEvent(new Event('online'));
		await settle();
		expect(mocks.api).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.api).toHaveBeenCalledTimes(3);
		expect(view.container.textContent).toBe('2026-09-28:true');
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.api).toHaveBeenCalledTimes(3);
	});

	test('subscribes to updates without duplicating a page-owned status request', async () => {
		const view = render(SubscribedStatus);
		window.dispatchEvent(new Event('focus'));
		window.dispatchEvent(new Event('online'));
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.api).not.toHaveBeenCalled();
		channels[0].dispatchEvent(new MessageEvent('message', { data: { accountId: mocks.session.account!.id, ...snapshot(true) } }));
		await settle();
		expect(view.container.textContent).toBe('2026-09-28:true');
	});

	test('can update local subscribers without echoing refresh responses to other tabs', async () => {
		const view = render(SubscribedStatus);
		publishCheckinStatus(mocks.session.account!.id, snapshot(true), { broadcast: false });
		await settle();
		expect(view.container.textContent).toBe('2026-09-28:true');
		expect(channels[0].postMessage).not.toHaveBeenCalled();
	});

	test('suspends refreshes for inactive stacked pages and refreshes when they become active', async () => {
		const pageActive = ref(false);
		render(Status, { global: { provide: { [DI.pageActive as symbol]: pageActive } } });
		window.dispatchEvent(new Event('focus'));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.api).not.toHaveBeenCalled();
		pageActive.value = true;
		await settle();
		expect(mocks.api).toHaveBeenCalledTimes(1);
		pageActive.value = false;
		await settle();
		window.dispatchEvent(new Event('focus'));
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('refreshes a kept-alive entry on activation and stops requesting while deactivated', async () => {
		const show = ref(true);
		const host = defineComponent({ components: { Status }, setup: () => ({ show }), template: '<KeepAlive><Status v-if="show"/></KeepAlive>' });
		render(host);
		await settle();
		expect(mocks.api).toHaveBeenCalledTimes(1);
		show.value = false;
		await settle();
		window.dispatchEvent(new Event('focus'));
		expect(mocks.api).toHaveBeenCalledTimes(1);
		show.value = true;
		await settle();
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('expires a signed day at Shanghai midnight and uses the server date rather than the device calendar', async () => {
		vi.setSystemTime(new Date('2026-10-10T15:59:50Z'));
		const nextDay = Promise.withResolvers<CheckinStatus>();
		mocks.api.mockResolvedValueOnce(snapshot(true)).mockReturnValueOnce(nextDay.promise);
		const view = render(Status);
		await settle();
		expect(view.container.textContent).toBe('2026-09-28:true');
		await vi.advanceTimersByTimeAsync(30_000);
		expect(view.container.textContent).toBe('2026-09-29:false');
		expect(mocks.api).toHaveBeenCalledTimes(2);
		nextDay.resolve(snapshot(false, '2026-09-29'));
		await settle();
		expect(view.container.textContent).toBe('2026-09-29:false');
	});

	test('revalidates an initial response that crosses midnight before showing yesterday as checked in', async () => {
		vi.setSystemTime(new Date('2026-09-28T15:59:50Z'));
		const previousDay = Promise.withResolvers<CheckinStatus>();
		const nextDay = Promise.withResolvers<CheckinStatus>();
		mocks.api.mockReturnValueOnce(previousDay.promise).mockReturnValueOnce(nextDay.promise);
		const view = render(Status);
		vi.setSystemTime(new Date('2026-09-28T16:00:01Z'));
		previousDay.resolve(snapshot(true));
		await settle();
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(view.container.textContent).toBe(':false');
		nextDay.resolve(snapshot(false, '2026-09-29'));
		await settle();
		expect(view.container.textContent).toBe('2026-09-29:false');
	});

	test('retries a failed midnight refresh without restoring yesterday or waiting for focus', async () => {
		vi.setSystemTime(new Date('2026-09-28T15:59:50Z'));
		mocks.api.mockResolvedValueOnce(snapshot(true)).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(snapshot(false, '2026-09-29'));
		const view = render(Status);
		await settle();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(view.container.textContent).toBe('2026-09-29:false');
		expect(mocks.api).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.api).toHaveBeenCalledTimes(3);
		expect(view.container.textContent).toBe('2026-09-29:false');
	});

	test('lets a server response correct a date projected from a changed device clock', async () => {
		const pending = Promise.withResolvers<CheckinStatus>();
		mocks.api.mockResolvedValueOnce(snapshot(true)).mockReturnValueOnce(pending.promise);
		const view = render(Status);
		await settle();
		vi.setSystemTime(new Date('2026-09-30T10:00:00Z'));
		window.dispatchEvent(new Event('focus'));
		await settle();
		expect(view.container.textContent).toBe('2026-09-30:false');
		publishCheckinStatus(mocks.session.account!.id, snapshot(true));
		pending.resolve(snapshot(false));
		await settle();
		expect(view.container.textContent).toBe('2026-09-28:true');
	});

	test('revalidates when the device date moves backwards without projecting the server date backwards', async () => {
		vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
		const pending = Promise.withResolvers<CheckinStatus>();
		mocks.api.mockResolvedValueOnce(snapshot(true)).mockReturnValueOnce(pending.promise);
		const view = render(Status);
		await settle();
		vi.setSystemTime(new Date('2026-09-29T10:00:00Z'));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(view.container.textContent).toBe('2026-09-28:true');
		pending.resolve(snapshot(false, '2026-09-29'));
		await settle();
		expect(view.container.textContent).toBe('2026-09-29:false');
	});

	test('accepts same-account cross-tab updates and cleans up all listeners after the last consumer', async () => {
		const removeWindowListener = vi.spyOn(window, 'removeEventListener');
		const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
		const first = render(Status);
		const second = render(Status);
		await settle();
		expect(channels).toHaveLength(1);
		const shared = channels[0];
		shared.dispatchEvent(new MessageEvent('message', { data: { accountId: 'someone-else', ...snapshot(true) } }));
		await settle();
		expect(first.container.textContent).toBe('2026-09-28:false');
		shared.dispatchEvent(new MessageEvent('message', { data: { accountId: mocks.session.account!.id, ...snapshot(true) } }));
		await settle();
		expect(first.container.textContent).toBe('2026-09-28:true');
		expect(second.container.textContent).toBe('2026-09-28:true');
		expect(shared.postMessage).not.toHaveBeenCalled();
		publishCheckinStatus(mocks.session.account!.id, snapshot(true));
		expect(shared.postMessage).toHaveBeenCalledWith({ accountId: mocks.session.account!.id, ...snapshot(true) });
		first.unmount();
		expect(shared.close).not.toHaveBeenCalled();
		second.unmount();
		expect(shared.close).toHaveBeenCalledOnce();
		expect(removeWindowListener).toHaveBeenCalledWith('focus', expect.any(Function));
		expect(removeWindowListener).toHaveBeenCalledWith('online', expect.any(Function));
		expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
		expect(vi.getTimerCount()).toBe(0);
	});

	test('ignores malformed cross-tab dates and zones', async () => {
		const view = render(Status);
		await settle();
		const accountId = mocks.session.account!.id;
		for (const data of [null, {}, { accountId, ...snapshot(true, '2026-02-30') }, { accountId, ...snapshot(true), timeZone: 'unknown' }, { accountId, ...snapshot(true), checkedInToday: 'true' }]) {
			channels[0].dispatchEvent(new MessageEvent('message', { data }));
		}
		await settle();
		expect(view.container.textContent).toBe('2026-09-28:false');
	});

	test('updates same-tab consumers when BroadcastChannel is unavailable', async () => {
		vi.stubGlobal('BroadcastChannel', undefined);
		const view = render(Status);
		await settle();
		publishCheckinStatus(mocks.session.account!.id, snapshot(true));
		await settle();
		expect(view.container.textContent).toBe('2026-09-28:true');
		expect(channels).toHaveLength(0);
	});
});

describe('check-in card greeting', () => {
	test('changes at noon while the card stays mounted', async () => {
		vi.setSystemTime(new Date(2026, 8, 28, 11, 59, 50));
		const view = renderCard();
		expect(view.container.textContent).toContain(i18n.ts._checkin.morningGreeting);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(view.container.textContent).toContain(i18n.ts._checkin.afternoonGreeting);
	});

	test('updates on focus and visibility before the next timer tick', async () => {
		vi.setSystemTime(new Date(2026, 8, 28, 11, 59, 50));
		const view = renderCard();
		vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 1));
		window.dispatchEvent(new Event('focus'));
		await settle();
		expect(view.container.textContent).toContain(i18n.ts._checkin.afternoonGreeting);
		vi.setSystemTime(new Date(2026, 8, 28, 18, 0, 1));
		document.dispatchEvent(new Event('visibilitychange'));
		await settle();
		expect(view.container.textContent).toContain(i18n.ts._checkin.eveningGreeting);
	});
});
