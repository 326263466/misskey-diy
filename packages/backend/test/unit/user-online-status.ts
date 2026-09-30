/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { USER_ACTIVE_THRESHOLD, USER_ONLINE_THRESHOLD } from '@/const.js';
import { getUserCustomStatus, getUserOnlineStatus, getUserOnlineStatusAutoReply } from '@/misc/user-online-status.js';

afterEach(() => vi.useRealTimers());

describe('user online status', () => {
	test.each(['online', 'away', 'busy', 'doNotDisturb'] as const)('shows a recently active user as %s, and respects hidden presence', onlineStatusOverride => {
		const user = { onlineStatusOverride, hideOnlineStatus: false, lastActiveDate: new Date() };
		expect(getUserOnlineStatus(user)).toBe(onlineStatusOverride);
		expect(getUserOnlineStatus({ ...user, hideOnlineStatus: true })).toBeNull();
		expect(getUserOnlineStatus({ ...user, lastActiveDate: null })).toBe('unknown');
	});

	test.each([new Date(), new Date(0), null])('always presents invisible users as unknown, independent of activity (%j)', lastActiveDate => {
		const user = { onlineStatusOverride: 'invisible', hideOnlineStatus: false, lastActiveDate } as const;
		expect(getUserOnlineStatus(user)).toBe('unknown');
		expect(getUserOnlineStatus({ ...user, hideOnlineStatus: true })).toBeNull();
		expect(getUserOnlineStatusAutoReply({ ...user, onlineStatusAutoReplies: { away: 'Away', busy: 'Busy' } })).toBeNull();
	});

	test.each(['online', 'away', 'busy', 'doNotDisturb'] as const)('expires %s using the existing activity thresholds instead of appearing connected forever', onlineStatusOverride => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-25T00:00:00Z'));
		const user = { onlineStatusOverride, hideOnlineStatus: false, lastActiveDate: new Date() };
		vi.advanceTimersByTime(USER_ONLINE_THRESHOLD - 1);
		expect(getUserOnlineStatus(user)).toBe(onlineStatusOverride);
		vi.advanceTimersByTime(1);
		expect(getUserOnlineStatus(user)).toBe('active');
		vi.advanceTimersByTime(USER_ACTIVE_THRESHOLD - USER_ONLINE_THRESHOLD);
		expect(getUserOnlineStatus(user)).toBe('offline');
	});

	test('only publishes custom text while online and keeps the saved value available to self', () => {
		const customStatus = { icon: 'music', text: 'Listening' } as const;
		const user = { customStatus, onlineStatusOverride: 'online', hideOnlineStatus: false, lastActiveDate: new Date() } as const;
		expect(getUserCustomStatus(user)).toEqual(customStatus);
		for (const changes of [
			{ hideOnlineStatus: true },
			{ onlineStatusOverride: 'away' as const },
			{ onlineStatusOverride: 'busy' as const },
			{ onlineStatusOverride: 'doNotDisturb' as const },
			{ onlineStatusOverride: 'invisible' as const },
			{ lastActiveDate: new Date(Date.now() - USER_ONLINE_THRESHOLD) },
			{ lastActiveDate: new Date(Date.now() - USER_ACTIVE_THRESHOLD) },
			{ lastActiveDate: null },
		]) {
			expect(getUserCustomStatus({ ...user, ...changes })).toBeNull();
			expect(getUserCustomStatus({ ...user, ...changes }, true)).toEqual(customStatus);
		}
	});
});
