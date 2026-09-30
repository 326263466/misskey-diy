/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { NotificationEntityService } from '@/core/entities/NotificationEntityService.js';
import type { MiNotification } from '@/models/Notification.js';

const welcome: MiNotification = {
	id: 'welcome-notification',
	createdAt: '2026-09-28T00:00:00.000Z',
	type: 'system',
	message: 'welcome',
};

function createService() {
	const notesRepository = { find: vi.fn() };
	const usersRepository = { find: vi.fn() };
	const followRequestsRepository = { find: vi.fn() };
	const services = {
		NoteEntityService: { pack: vi.fn(), packMany: vi.fn().mockResolvedValue([]) },
		UserEntityService: { pack: vi.fn(), packMany: vi.fn().mockResolvedValue([]) },
		RoleEntityService: { pack: vi.fn() },
		ChatEntityService: { packRoomInvitation: vi.fn() },
	};
	const service = new NotificationEntityService(
		{ get: (name: keyof typeof services) => services[name] } as never,
		notesRepository as never,
		usersRepository as never,
		followRequestsRepository as never,
		{
			userMutingsCache: { fetch: vi.fn().mockResolvedValue(new Set(['muted-user'])) },
			userProfileCache: { fetch: vi.fn().mockResolvedValue({ mutedInstances: ['muted.example'] }) },
		} as never,
	);
	service.onModuleInit();
	return { service, services, notesRepository, usersRepository, followRequestsRepository };
}

describe('system notification packing', () => {
	test('preserves the welcome message without attaching a sender or a public note', async () => {
		const { service, services, notesRepository, usersRepository } = createService();
		const packed = await service.pack(welcome, 'new-user', {});

		expect(packed).toStrictEqual(welcome);
		expect(packed).not.toHaveProperty('user');
		expect(packed).not.toHaveProperty('userId');
		expect(packed).not.toHaveProperty('note');
		expect(services.UserEntityService.pack).not.toHaveBeenCalled();
		expect(services.NoteEntityService.pack).not.toHaveBeenCalled();
		expect(usersRepository.find).not.toHaveBeenCalled();
		expect(notesRepository.find).not.toHaveBeenCalled();
	});

	test.each(['packMany', 'packGroupedMany'] as const)('%s keeps the welcome message when no sender exists', async method => {
		const { service, notesRepository, usersRepository, followRequestsRepository } = createService();

		await expect(service[method]([welcome], 'new-user')).resolves.toStrictEqual([welcome]);
		expect(usersRepository.find).not.toHaveBeenCalled();
		expect(notesRepository.find).not.toHaveBeenCalled();
		expect(followRequestsRepository.find).not.toHaveBeenCalled();
	});
});
