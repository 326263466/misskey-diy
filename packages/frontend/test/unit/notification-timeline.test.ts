/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, nextTick, shallowRef } from 'vue';
import type { NotificationType } from '@/utility/notification-types.js';
import type { IPaginator } from '@/utility/paginator.js';
import MkStreamingNotificationsTimeline from '@/components/MkStreamingNotificationsTimeline.vue';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	realtime: true,
	on: vi.fn(),
	send: vi.fn(),
	dispose: vi.fn(),
	poll: null as (() => Promise<void>) | null,
	appear: null as (() => Promise<void>) | null,
}));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/store.js', () => ({ store: { s: { get realtimeMode() { return mocks.realtime; } } } }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ send: mocks.send, useChannel: () => ({ on: mocks.on, dispose: mocks.dispose }) }) }));
vi.mock('@@/js/use-interval.js', () => ({ useInterval: (callback: () => Promise<void>) => { mocks.poll = callback; } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { useGroupedNotifications: false, animation: false, enablePullToRefresh: false, pollingInterval: 3 } } }));
vi.mock('@/components/MkNotification.vue', () => ({ default: { props: ['notification'], template: '<div data-testid="notification">{{ notification.id }}</div>' } }));
vi.mock('@/components/MkNote.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkPullToRefresh.vue', () => ({ default: { template: '<div><slot/></div>' } }));

const start = Date.parse('2026-09-28T00:00:00Z');
const notifications = Array.from({ length: 30 }, (_, i) => ({
	id: String(i + 1).padStart(3, '0'),
	createdAt: new Date(start + (i + 1) * 1000).toISOString(),
	type: 'system',
	message: 'welcome',
}));

async function renderTimeline(excludeTypes?: NotificationType[]) {
	const timeline = shallowRef<{ paginator: IPaginator } | null>(null);
	const host = defineComponent({
		components: { MkStreamingNotificationsTimeline },
		setup: () => ({ timeline, excludeTypes }),
		template: '<MkStreamingNotificationsTimeline ref="timeline" :excludeTypes="excludeTypes"/>',
	});
	const view = render(host, { global: {
		stubs: { MkLoading: true, MkError: true, MkResult: true },
		directives: { appear: {
			mounted(_el, binding) { mocks.appear = binding.value; },
			updated(_el, binding) { mocks.appear = binding.value; },
		} },
	} });
	await vi.waitFor(() => expect(view.getAllByTestId('notification')).toHaveLength(20));
	return { ...view, paginator: timeline.value!.paginator };
}

function emitNotification(type = 'system') {
	const handler = mocks.on.mock.calls.find(([event]) => event === 'notification')![1];
	handler({ id: '031', createdAt: new Date(start + 31_000).toISOString(), type, message: 'welcome' });
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.realtime = true;
	mocks.poll = null;
	mocks.appear = null;
	mocks.api.mockImplementation(async (_endpoint: string, params: { limit: number; sinceId?: string; untilId?: string; sinceDate?: number; untilDate?: number }) => {
		const filtered = notifications.filter(item =>
			(!params.sinceId || item.id > params.sinceId) &&
			(!params.untilId || item.id < params.untilId) &&
			(!params.sinceDate || Date.parse(item.createdAt) > params.sinceDate) &&
			(!params.untilDate || Date.parse(item.createdAt) < params.untilDate));
		if (!(params.sinceId || params.sinceDate)) filtered.reverse();
		return filtered.slice(0, params.limit).map(item => ({ ...item }));
	});
});

afterEach(cleanup);

describe('notification timeline controls', () => {
	test('does not clear hidden categories when fetching or receiving notifications in a filtered view', async () => {
		const view = await renderTimeline(['follow']);
		expect(mocks.api.mock.calls.every(([, params]) => params.markAsRead === false)).toBe(true);
		emitNotification('follow');
		await nextTick();
		expect(view.queryByText('031')).toBeNull();
		expect(mocks.send).not.toHaveBeenCalled();
		emitNotification();
		await nextTick();
		expect(view.getByText('031')).toBeTruthy();
		expect(mocks.send).not.toHaveBeenCalled();
	});

	test('continues to mark the unfiltered live timeline as read', async () => {
		await renderTimeline();
		expect(mocks.api).toHaveBeenCalledWith('i/notifications', expect.objectContaining({ markAsRead: true }));
		emitNotification();
		expect(mocks.send).toHaveBeenCalledWith('readNotification');
	});

	test('applies the same excluded types to grouped live notifications', async () => {
		const view = await renderTimeline(['reaction', 'renote']);
		for (const type of ['reaction:grouped', 'renote:grouped']) {
			emitNotification(type);
			await nextTick();
			expect(view.queryByText('031')).toBeNull();
		}
		expect(mocks.send).not.toHaveBeenCalled();
	});

	test('starts oldest-first at retained history and loads subsequent pages in ascending order', async () => {
		const view = await renderTimeline();
		view.paginator.order.value = 'oldest';
		await view.paginator.reload();
		await nextTick();
		expect(mocks.api).toHaveBeenCalledWith('i/notifications', expect.objectContaining({ sinceDate: 1, markAsRead: false }));
		expect(view.paginator.initialDate).toBeNull();
		expect(view.getAllByTestId('notification').map(item => item.textContent)).toEqual(notifications.slice(0, 20).map(item => item.id));
		await mocks.appear!();
		await nextTick();
		expect(view.getAllByTestId('notification').map(item => item.textContent)).toEqual(notifications.map(item => item.id));
		emitNotification();
		await nextTick();
		expect(view.queryByText('031')).toBeNull();
		expect(mocks.send).not.toHaveBeenCalled();
	});

	test('preserves historical date results against new stream messages and sorts date-based oldest queries', async () => {
		const view = await renderTimeline();
		view.paginator.initialDate = start + 10_000;
		mocks.api.mockClear();
		await view.paginator.reload();
		await nextTick();
		expect(mocks.api.mock.calls.every(([, params]) => params.markAsRead === false)).toBe(true);
		expect(view.getAllByTestId('notification').map(item => item.textContent)).toEqual(notifications.slice(0, 9).toReversed().map(item => item.id));
		emitNotification();
		await nextTick();
		expect(view.queryByText('031')).toBeNull();
		expect(mocks.send).not.toHaveBeenCalled();
		view.paginator.order.value = 'oldest';
		await view.paginator.reload();
		await nextTick();
		expect(view.getAllByTestId('notification').map(item => item.textContent)).toEqual(notifications.slice(10).map(item => item.id));
	});

	test('polls only the live newest view and resumes when date filtering is cleared', async () => {
		mocks.realtime = false;
		const view = await renderTimeline();
		view.paginator.initialDate = start + 10_000;
		mocks.api.mockClear();
		await mocks.poll!();
		expect(mocks.api).not.toHaveBeenCalled();
		view.paginator.initialDate = null;
		view.paginator.order.value = 'oldest';
		await mocks.poll!();
		expect(mocks.api).not.toHaveBeenCalled();
		view.paginator.order.value = 'newest';
		await mocks.poll!();
		expect(mocks.api).toHaveBeenCalledWith('i/notifications', expect.objectContaining({ sinceId: '030' }));
	});
});
