/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EntityNotFoundError } from 'typeorm';
import { describe, expect, test, vi } from 'vitest';
import { NotificationEntityService } from '@/core/entities/NotificationEntityService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { MiNote } from '@/models/Note.js';
import type { MiNotification } from '@/models/Notification.js';

const notification: MiNotification = {
	id: 'notification', createdAt: new Date().toISOString(), type: 'reply', noteId: 'comment', notifierId: 'author',
};

function createEntityService() {
	const note = { id: 'comment', text: 'comment' };
	const packNote = vi.fn().mockResolvedValue(note);
	const packUser = vi.fn().mockResolvedValue({ id: 'author' });
	const services = {
		NoteEntityService: { pack: packNote },
		UserEntityService: { pack: packUser },
	};
	const service = new NotificationEntityService(
		{ get: (name: keyof typeof services) => services[name] } as never,
		null as never, null as never, null as never, null as never,
	);
	service.onModuleInit();
	return { service, note, packNote, packUser };
}

describe('notifications for deleted comments', () => {
	test('ignores a comment deleted while its notification is being packed', async () => {
		const { service, packNote, packUser } = createEntityService();
		packNote.mockRejectedValueOnce(new EntityNotFoundError(MiNote, { id: 'comment' }));
		await expect(service.pack(notification, 'reader', { checkValidNotifier: false })).resolves.toBeNull();
		expect(packUser).not.toHaveBeenCalled();
	});

	test('keeps notifications for comments that still exist', async () => {
		const { service, note } = createEntityService();
		await expect(service.pack(notification, 'reader', { checkValidNotifier: false })).resolves.toMatchObject({
			id: notification.id, type: 'reply', note, user: { id: 'author' },
		});
	});

	test('preserves errors unrelated to a deleted entity', async () => {
		const { service, packNote } = createEntityService();
		packNote.mockRejectedValueOnce(new Error('database unavailable'));
		await expect(service.pack(notification, 'reader', { checkValidNotifier: false })).rejects.toThrow('database unavailable');
	});

	test('removes an invalid notification from Redis without broadcasting it', async () => {
		const redis = { xadd: vi.fn().mockResolvedValue('1-0'), xdel: vi.fn().mockResolvedValue(1) };
		const globalEvents = { publishMainStream: vi.fn() };
		const push = { pushNotification: vi.fn() };
		const service = new NotificationService(
			{ perUserNotificationsMaxCount: 10 } as never,
			redis as never,
			null as never,
			{ pack: vi.fn().mockResolvedValue(null) } as never,
			{ gen: () => 'notification', parseFull: () => ({ date: 1, additional: 0n }) } as never,
			globalEvents as never,
			push as never,
			{
				userProfileCache: { fetch: vi.fn().mockResolvedValue({ notificationRecieveConfig: {} }) },
				userMutingsCache: { fetch: vi.fn().mockResolvedValue(new Set()) },
			} as never,
			null as never,
		);
		service.createNotification('reader', 'reply', { noteId: 'comment' }, 'author');
		await vi.waitFor(() => expect(redis.xdel).toHaveBeenCalledExactlyOnceWith('notificationTimeline:reader', '1-0'));
		expect(globalEvents.publishMainStream).not.toHaveBeenCalled();
		expect(push.pushNotification).not.toHaveBeenCalled();
		service.dispose();
	});
});
