/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { AccountMoveService } from '@/core/AccountMoveService.js';
import type { MiUser } from '@/models/User.js';

describe('account migration statistics', () => {
	test('invalidates every changed user once only after all counts finish', async () => {
		let finish!: () => void;
		let started!: () => void;
		const gate = new Promise<void>(resolve => { finish = resolve; });
		const lastWriteStarted = new Promise<void>(resolve => { started = resolve; });
		const publishUserStats = vi.fn();
		const decrement = vi.fn()
			.mockResolvedValueOnce({ affected: 2 })
			.mockImplementationOnce(() => {
				started();
				return gate;
			});
		const service = Object.assign(Object.create(AccountMoveService.prototype), {
			meta: { enableStatsForFederatedInstances: false },
			usersRepository: { update: vi.fn().mockResolvedValue({}), decrement },
			followingsRepository: { findBy: vi.fn().mockResolvedValue([{ followeeId: 'follower' }, { followeeId: 'followee' }]) },
			globalEventService: { publishUserStats },
			perUserFollowingChart: { update: vi.fn() },
		}) as AccountMoveService;
		const pending = service['adjustFollowingCounts'](['follower', 'another-follower'], { id: 'old-account' } as MiUser);
		await lastWriteStarted;
		try {
			expect(publishUserStats).not.toHaveBeenCalled();
		} finally {
			finish();
			await pending;
		}
		expect(publishUserStats.mock.calls).toEqual([['old-account'], ['follower'], ['another-follower'], ['followee']]);
	});
});
