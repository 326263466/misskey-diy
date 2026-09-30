/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import Common from '@/ui/_common_/common.vue';
import NotificationToast from '@/ui/_common_/notification.vue';
import { globalEvents } from '@/events.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('@/i.js', () => ({ $i: { id: 'current-user' } }));
vi.mock('@/os.js', () => ({ popups: [] }));
vi.mock('@/store.js', () => ({ store: { s: { realtimeMode: false } } }));
vi.mock('@/stream.js', () => ({ useStream: vi.fn() }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));
vi.mock('@/utility/unison-reload.js', () => ({ unisonReload: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ pendingApiRequestsCount: 0 }));
vi.mock('@/ui/_common_/sw-inject.js', () => ({ swInject: vi.fn() }));
vi.mock('@/ui/_common_/navbar.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/stream-indicator.vue', () => ({ __esModule: true, default: { template: '<div/>' } }));
vi.mock('@/components/MkNotification.vue', () => ({
	default: {
		props: ['notification', 'contentVisibilityAuto', 'full'],
		setup: () => ({ navigate: mocks.navigate }),
		template: '<a :href="`/notifications/${notification.id}`" @click.prevent="navigate">{{ notification.header }}</a>',
	},
}));

async function showNotification(id: string, header: string) {
	globalEvents.emit('clientNotification', {
		id, header, type: 'app', body: 'A notification', icon: null, createdAt: new Date().toISOString(),
	} as Misskey.entities.Notification);
	await nextTick();
}

function notificationCard(view: ReturnType<typeof render>, name: string) {
	return view.getByRole('link', { name }).parentElement!;
}

describe('notification toast dismissal', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.spyOn(window.document, 'visibilityState', 'get').mockReturnValue('visible');
	});

	afterEach(() => {
		cleanup();
		globalEvents.removeAllListeners('clientNotification');
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test('closes only the selected toast without navigating or bubbling the click', async () => {
		const view = render(Common);
		await showNotification('first', 'First notification');
		await showNotification('second', 'Second notification');
		const parentClick = vi.fn();
		view.container.addEventListener('click', parentClick);
		const first = view.getByRole('link', { name: 'First notification' }).parentElement!;
		const close = within(first).getByRole('button', { name: i18n.ts.close });
		expect(close.getAttribute('type')).toBe('button');
		await fireEvent.click(close);

		expect(view.queryByRole('link', { name: 'First notification' })).toBeNull();
		expect(view.getByRole('link', { name: 'Second notification' })).toBeTruthy();
		expect(view.getAllByRole('button', { name: i18n.ts.close })).toHaveLength(1);
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(parentClick).not.toHaveBeenCalled();

		await fireEvent.click(view.getByRole('link', { name: 'Second notification' }));
		expect(mocks.navigate).toHaveBeenCalledOnce();
		expect(parentClick).toHaveBeenCalledOnce();
	});

	test('preserves the remaining toast auto-dismiss deadline after closing another toast', async () => {
		const view = render(Common);
		await showNotification('first', 'First notification');
		await vi.advanceTimersByTimeAsync(1000);
		await showNotification('second', 'Second notification');
		const first = view.getByRole('link', { name: 'First notification' }).parentElement!;
		await fireEvent.click(within(first).getByRole('button', { name: i18n.ts.close }));

		await vi.advanceTimersByTimeAsync(4000);
		expect(view.queryByRole('link', { name: 'First notification' })).toBeNull();
		expect(view.getByRole('link', { name: 'Second notification' })).toBeTruthy();
		await vi.advanceTimersByTimeAsync(1000);
		expect(view.queryByRole('link', { name: 'Second notification' })).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.close })).toBeNull();
	});

	test('automatically dismisses after exactly five seconds without interaction', async () => {
		const view = render(Common);
		await showNotification('first', 'First notification');
		await vi.advanceTimersByTimeAsync(4999);
		expect(view.queryByRole('link', { name: 'First notification' })).not.toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(view.queryByRole('link', { name: 'First notification' })).toBeNull();
	});

	test('keeps a hovered toast visible and resumes its remaining time across multiple pauses', async () => {
		const view = render(Common);
		await showNotification('first', 'First notification');
		const card = notificationCard(view, 'First notification');
		await vi.advanceTimersByTimeAsync(2000);
		await fireEvent.mouseEnter(card);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(view.queryByRole('link', { name: 'First notification' })).not.toBeNull();
		await fireEvent.mouseLeave(card);
		await vi.advanceTimersByTimeAsync(1000);
		await fireEvent.mouseEnter(card);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(view.queryByRole('link', { name: 'First notification' })).not.toBeNull();
		await fireEvent.mouseLeave(card);
		await vi.advanceTimersByTimeAsync(1999);
		expect(view.queryByRole('link', { name: 'First notification' })).not.toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(view.queryByRole('link', { name: 'First notification' })).toBeNull();
	});

	test('leaves other toast timers running while one notification is hovered', async () => {
		const view = render(Common);
		await showNotification('first', 'First notification');
		await showNotification('second', 'Second notification');
		await vi.advanceTimersByTimeAsync(2000);
		await fireEvent.mouseEnter(notificationCard(view, 'First notification'));
		await vi.advanceTimersByTimeAsync(3000);
		expect(view.queryByRole('link', { name: 'First notification' })).not.toBeNull();
		expect(view.queryByRole('link', { name: 'Second notification' })).toBeNull();
	});

	test('keeps the timer paused while either keyboard focus or the pointer remains inside', async () => {
		const view = render(Common);
		await showNotification('first', 'First notification');
		const card = notificationCard(view, 'First notification');
		const link = within(card).getByRole('link');
		const close = within(card).getByRole('button', { name: i18n.ts.close });
		await vi.advanceTimersByTimeAsync(2000);
		await fireEvent.focusIn(link);
		await fireEvent.focusOut(link, { relatedTarget: close });
		await fireEvent.focusIn(close);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(view.queryByRole('link', { name: 'First notification' })).not.toBeNull();
		await fireEvent.mouseEnter(card);
		await fireEvent.focusOut(close, { relatedTarget: window.document.body });
		await vi.advanceTimersByTimeAsync(10_000);
		expect(view.queryByRole('link', { name: 'First notification' })).not.toBeNull();
		await fireEvent.mouseLeave(card);
		await vi.advanceTimersByTimeAsync(2999);
		expect(view.queryByRole('link', { name: 'First notification' })).not.toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(view.queryByRole('link', { name: 'First notification' })).toBeNull();
	});

	test('evicts the oldest unpaused notification while preserving hovered and focused toasts', async () => {
		const view = render(Common);
		await showNotification('hovered', 'Hovered notification');
		await fireEvent.mouseEnter(notificationCard(view, 'Hovered notification'));
		await showNotification('focused', 'Focused notification');
		await fireEvent.focusIn(view.getByRole('link', { name: 'Focused notification' }));
		await showNotification('third', 'Third notification');
		await showNotification('fourth', 'Fourth notification');
		await showNotification('fifth', 'Fifth notification');
		await vi.advanceTimersByTimeAsync(500);
		expect(view.getAllByRole('button', { name: i18n.ts.close })).toHaveLength(3);
		expect(view.queryByRole('link', { name: 'Hovered notification' })).not.toBeNull();
		expect(view.queryByRole('link', { name: 'Focused notification' })).not.toBeNull();
		expect(view.queryByRole('link', { name: 'Fifth notification' })).not.toBeNull();
		expect(view.queryByRole('link', { name: 'Third notification' })).toBeNull();
		expect(view.queryByRole('link', { name: 'Fourth notification' })).toBeNull();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(view.getAllByRole('button', { name: i18n.ts.close })).toHaveLength(2);
	});

	test.each(['manual close', 'unmount'])('clears its own dismissal timer on %s', async action => {
		const close = vi.fn();
		const notification = { id: 'single', type: 'app', header: 'One notification', body: 'Body', icon: null, createdAt: new Date().toISOString() } as Misskey.entities.Notification;
		const view = render(NotificationToast, { props: { notification, onClose: close } });
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(1000);
		if (action === 'manual close') {
			await fireEvent.click(view.getByRole('button', { name: i18n.ts.close }));
		} else {
			view.unmount();
		}
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(close).toHaveBeenCalledTimes(action === 'manual close' ? 1 : 0);
	});
});
