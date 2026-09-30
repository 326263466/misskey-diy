/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { SignupService } from '@/core/SignupService.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';

function setup() {
	const events: string[] = [];
	const state = { failCommit: false };
	const usersRepository = { exists: vi.fn().mockResolvedValue(false) };
	const manager = {
		findOneBy: vi.fn().mockResolvedValue(null),
		save: vi.fn(async (entity: unknown) => entity),
	};
	const notificationService = {
		createSystemNotification: vi.fn(async () => { events.push('welcome'); }),
	};
	const logger = { warn: vi.fn() };
	const service: SignupService = Object.assign(Object.create(SignupService.prototype), {
		db: {
			transaction: vi.fn(async (callback: (manager: unknown) => Promise<void>) => {
				events.push('begin');
				await callback(manager);
				if (state.failCommit) throw new Error('commit failed');
				events.push('commit');
			}),
		},
		meta: { rootUserId: 'admin', preservedUsernames: [], prohibitedWordsForNameOfUser: [] },
		usersRepository,
		usedUsernamesRepository: { exists: vi.fn().mockResolvedValue(false) },
		utilityService: { isKeyWordIncluded: () => false, toPunyNullable: (host?: string) => host ?? null },
		userEntityService: { validateLocalUsername: () => true, validatePassword: () => true },
		idService: { gen: () => 'new-user' },
		usersChart: { update: vi.fn() },
		userService: { notifySystemWebhook: vi.fn() },
		notificationService,
		logger,
	});
	return { service, state, events, usersRepository, manager, notificationService, logger };
}

describe('signup welcome system message', () => {
	test.each([
		{ username: 'alice', password: 'test-password' },
		{ username: 'alice', passwordHash: 'verified-pending-password-hash', verifiedEmail: 'alice@example.test' },
	])('sends exactly once after committing a completed account: $username', async options => {
		const fixture = setup();
		const result = await fixture.service.signup(options);

		expect(result.account).toBeInstanceOf(MiUser);
		expect(fixture.events).toEqual(['begin', 'commit', 'welcome']);
		expect(fixture.notificationService.createSystemNotification).toHaveBeenCalledExactlyOnceWith('new-user', 'welcome');
	});

	test('persists verified email before notification delivery can cache the profile', async () => {
		const fixture = setup();
		fixture.notificationService.createSystemNotification.mockImplementation(async () => {
			const profile = fixture.manager.save.mock.calls.find(([entity]) => entity instanceof MiUserProfile)?.[0];
			expect(profile).toMatchObject({ email: 'alice@example.test', emailVerified: true });
		});

		await fixture.service.signup({ username: 'alice', passwordHash: 'hash', verifiedEmail: 'alice@example.test' });
		expect(fixture.notificationService.createSystemNotification).toHaveBeenCalledOnce();
		expect(fixture.logger.warn).not.toHaveBeenCalled();
	});

	test('does not send for failed or repeated registration', async () => {
		const fixture = setup();
		fixture.usersRepository.exists.mockResolvedValue(true);

		await expect(fixture.service.signup({ username: 'alice', passwordHash: 'hash' })).rejects.toThrow('DUPLICATED_USERNAME');
		expect(fixture.notificationService.createSystemNotification).not.toHaveBeenCalled();
	});

	test('does not send when the account transaction rolls back', async () => {
		const fixture = setup();
		fixture.state.failCommit = true;

		await expect(fixture.service.signup({ username: 'alice', passwordHash: 'hash' })).rejects.toThrow('commit failed');
		expect(fixture.notificationService.createSystemNotification).not.toHaveBeenCalled();
	});

	test('does not send to remote accounts', async () => {
		const fixture = setup();
		await fixture.service.signup({ username: 'alice', passwordHash: 'hash', host: 'remote.example' });

		expect(fixture.notificationService.createSystemNotification).not.toHaveBeenCalled();
	});

	test('waits for the welcome message before returning the account', async () => {
		const fixture = setup();
		let release!: () => void;
		const delivery = new Promise<void>(resolve => { release = resolve; });
		fixture.notificationService.createSystemNotification.mockImplementation(() => delivery);
		let returned = false;
		const signup = fixture.service.signup({ username: 'alice', passwordHash: 'hash' }).then(() => { returned = true; });
		await vi.waitFor(() => expect(fixture.notificationService.createSystemNotification).toHaveBeenCalledOnce());
		expect(returned).toBe(false);
		release();
		await signup;
		expect(returned).toBe(true);
	});

	test('preserves successful registration if notification delivery fails', async () => {
		const fixture = setup();
		fixture.notificationService.createSystemNotification.mockRejectedValue(new Error('notifications unavailable'));

		await expect(fixture.service.signup({ username: 'alice', passwordHash: 'hash' })).resolves.toMatchObject({ account: { id: 'new-user' } });
		expect(fixture.logger.warn).toHaveBeenCalledOnce();
	});
});
