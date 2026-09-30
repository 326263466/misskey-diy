/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { SignupApiService } from '@/server/api/SignupApiService.js';

function setup() {
	const pending = { id: 'pending', username: 'alice', email: 'alice@example.test', password: 'hash' };
	const account = { id: 'alice', host: null };
	const signupService = { signup: vi.fn().mockResolvedValue({ account }) };
	const signinService = { signin: vi.fn().mockReturnValue({ finished: true }) };
	const emailService = { validateEmailForAccount: vi.fn().mockResolvedValue({ available: true }), sendEmail: vi.fn() };
	const service: SignupApiService = Object.assign(Object.create(SignupApiService.prototype), {
		config: { url: 'https://example.test' },
		meta: { emailRequiredForSignup: true, preservedUsernames: [] },
		usersRepository: { exists: vi.fn().mockResolvedValue(false) },
		usedUsernamesRepository: { exists: vi.fn().mockResolvedValue(false) },
		userPendingsRepository: {
			insertOne: vi.fn().mockResolvedValue(pending),
			findOneByOrFail: vi.fn().mockResolvedValue(pending),
			delete: vi.fn(),
		},
		userProfilesRepository: { findOneByOrFail: vi.fn().mockResolvedValue({ userId: account.id }), update: vi.fn() },
		registrationTicketsRepository: { findOneBy: vi.fn().mockResolvedValue(null) },
		idService: { gen: () => 'pending', parse: () => ({ date: new Date() }) },
		emailService,
		signupService,
		signinService,
	});
	return { service, signupService, signinService, emailService, pending };
}

describe('welcome delivery with email verification', () => {
	test('does not create the account or welcome message when merely requesting verification', async () => {
		const { service, signupService } = setup();
		const reply = { code: vi.fn() };
		await service.signup({ body: { username: 'alice', password: 'test', emailAddress: 'alice@example.test' } } as never, reply as never);

		expect(reply.code).toHaveBeenCalledWith(204);
		expect(signupService.signup).not.toHaveBeenCalled();
	});

	test('passes the verified email into account creation before welcoming and signing in', async () => {
		const { service, signupService, signinService, pending } = setup();
		const result = await service.signupPending({ body: { code: 'valid-code' } } as never, {} as never);

		expect(signupService.signup).toHaveBeenCalledExactlyOnceWith({
			username: pending.username,
			passwordHash: pending.password,
			verifiedEmail: pending.email,
		});
		expect(signinService.signin).toHaveBeenCalledOnce();
		expect(result).toEqual({ finished: true });
	});
});
