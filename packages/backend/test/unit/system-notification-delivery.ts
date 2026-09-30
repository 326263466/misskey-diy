/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { NotificationService } from '@/core/NotificationService.js';
import type { MiNotification } from '@/models/Notification.js';

function setup() {
	const redis = {
		xadd: vi.fn().mockResolvedValue('1-0'),
		xdel: vi.fn(),
	};
	const events = { publishMainStream: vi.fn() };
	const cache = {
		userProfileCache: { fetch: vi.fn().mockResolvedValue({ notificationRecieveConfig: {} }) },
		userMutingsCache: { fetch: vi.fn() },
	};
	const service = new NotificationService(
		{ perUserNotificationsMaxCount: 100 } as never,
		redis as never,
		null as never,
		{ pack: vi.fn(async (notification: MiNotification) => notification) } as never,
		{ gen: () => 'notification', parseFull: () => ({ date: 1, additional: 0n }) } as never,
		events as never,
		{ pushNotification: vi.fn() } as never,
		cache as never,
		null as never,
	);
	return { service, redis, events, cache };
}

describe('private system notification delivery', () => {
	test('stores a system message only in the recipient timeline without a sender', async () => {
		const { service, redis, events, cache } = setup();
		try {
			const notification = await service.createSystemNotification('new-user', 'welcome');

			expect(notification).toMatchObject({ type: 'system', message: 'welcome' });
			expect(notification).not.toHaveProperty('notifierId');
			expect(redis.xadd).toHaveBeenCalledExactlyOnceWith(
				'notificationTimeline:new-user', 'MAXLEN', '~', '100', '1-0', 'data', JSON.stringify(notification),
			);
			expect(events.publishMainStream).toHaveBeenCalledExactlyOnceWith('new-user', 'notification', notification);
			expect(cache.userMutingsCache.fetch).not.toHaveBeenCalled();
		} finally {
			service.dispose();
		}
	});

	test('returns a promise that settles after persistence and before account packing', async () => {
		const { service, redis, events } = setup();
		let release!: (id: string) => void;
		redis.xadd.mockImplementation(() => new Promise<string>(resolve => { release = resolve; }));
		try {
			let completed = false;
			const sending = service.createSystemNotification('new-user', 'welcome').then(() => { completed = true; });
			await vi.waitFor(() => expect(redis.xadd).toHaveBeenCalledOnce());
			expect(completed).toBe(false);
			expect(events.publishMainStream).not.toHaveBeenCalled();
			release('1-0');
			await sending;
			expect(completed).toBe(true);
		} finally {
			service.dispose();
		}
	});

	test('propagates storage failures to the signup error handler without publishing', async () => {
		const { service, redis, events } = setup();
		redis.xadd.mockRejectedValue(new Error('redis unavailable'));
		try {
			await expect(service.createSystemNotification('new-user', 'welcome')).rejects.toThrow('redis unavailable');
			expect(events.publishMainStream).not.toHaveBeenCalled();
		} finally {
			service.dispose();
		}
	});
});
