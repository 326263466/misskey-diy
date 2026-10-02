/*
	* SPDX-FileCopyrightText: syuilo and misskey-project
	* SPDX-License-Identifier: AGPL-3.0-only
	*/

import { expect, test, vi } from 'vitest';
import { ChatService, ChatRoomFullError, ChatRoomInvitationError } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { MiUser } from '@/models/User.js';

function setup(count: number, existing = false) {
	const manager = {
	 findOneOrFail: vi.fn().mockResolvedValue({ id: 'room', ownerId: 'owner' }),
	 existsBy: vi.fn().mockResolvedValue(existing),
	 findOneByOrFail: vi.fn().mockResolvedValue({ id: 'invitation' }),
	 countBy: vi.fn().mockResolvedValue(count),
	 insert: vi.fn().mockResolvedValue({}),
	 delete: vi.fn().mockResolvedValue({}),
	};
	const events = { publishChatRoomStream: vi.fn() };
	const service: ChatService = Object.setPrototypeOf({
	 chatRoomsRepository: { manager: { transaction: (callback: (value: typeof manager) => Promise<unknown>) => callback(manager) } },
	 idService: { gen: () => 'membership' }, globalEventService: events,
	}, ChatService.prototype);
	return { service, manager, events };
}

test('49 existing memberships plus creator reject a join without consuming its invitation', async () => {
	const { service, manager, events } = setup(49);
	await expect(service.joinToRoom('new-user', 'room')).rejects.toBeInstanceOf(ChatRoomFullError);
	expect(manager.insert).not.toHaveBeenCalled();
	expect(manager.delete).not.toHaveBeenCalled();
	expect(events.publishChatRoomStream).not.toHaveBeenCalled();
});

test('48 existing memberships allow the 50th person and notify after insertion', async () => {
	const { service, manager, events } = setup(48);
	await service.joinToRoom('new-user', 'room');
	expect(manager.findOneOrFail).toHaveBeenCalledWith(expect.anything(), { where: { id: 'room' }, lock: { mode: 'pessimistic_write' } });
	expect(manager.insert).toHaveBeenCalledOnce();
	expect(manager.delete).toHaveBeenCalledOnce();
	expect(events.publishChatRoomStream).toHaveBeenCalledWith('room', 'membersChanged');
});

test.each([{ userId: 'owner', existing: false }, { userId: 'member', existing: true }])('an existing $userId neither joins twice nor broadcasts', async ({ userId, existing }) => {
	const { service, manager, events } = setup(49, existing);
	await service.joinToRoom(userId, 'room');
	expect(manager.insert).not.toHaveBeenCalled();
	expect(events.publishChatRoomStream).not.toHaveBeenCalled();
});

function invitationSetup(existing = false) {
	const state = setup(1);
	const notification = vi.fn();
	const insert = state.manager.insert;
	const manager = Object.assign(state.manager, {
		findOneBy: vi.fn(async entity => entity === MiUser ? { id: 'member', host: null } : existing ? { id: 'invitation' } : null),
		create: vi.fn((_entity, value) => value),
	});
	Object.assign(state.service, { notificationService: { createNotification: notification } });
	return { ...state, manager, notification, insert };
}

test('repeated invitations return the same record without notifying twice', async () => {
	const { service, manager, notification } = invitationSetup(true);
	await expect(service.createRoomInvitation('owner', 'room', 'member')).resolves.toMatchObject({ id: 'invitation' });
	expect(manager.insert).not.toHaveBeenCalled();
	expect(notification).not.toHaveBeenCalled();
});

test('invitation capacity includes the owner before inserting', async () => {
	const { service, manager, notification } = invitationSetup();
	manager.countBy.mockResolvedValue(49);
	await expect(service.createRoomInvitation('owner', 'room', 'member')).rejects.toBeInstanceOf(ChatRoomFullError);
	expect(manager.insert).not.toHaveBeenCalled();
	expect(notification).not.toHaveBeenCalled();
});

test('existing members cannot be invited again', async () => {
	const { service, manager } = invitationSetup();
	manager.existsBy.mockResolvedValue(true);
	await expect(service.createRoomInvitation('owner', 'room', 'member')).rejects.toBeInstanceOf(ChatRoomInvitationError);
	expect(manager.insert).not.toHaveBeenCalled();
});

test('known empty membership hints avoid per-room database lookups', async () => {
	const findOneBy = vi.fn();
	const countBy = vi.fn();
	const pack = vi.fn();
	const packer: ChatEntityService = Object.setPrototypeOf({
		idService: { parse: () => ({ date: new Date(0) }) },
		chatRoomMembershipsRepository: { findOneBy, countBy },
		chatRoomInvitationsRepository: { findOneBy },
		userEntityService: { pack },
	}, ChatEntityService.prototype);
	const result = await packer.packRoom({ id: 'room', ownerId: 'owner' } as never, { id: 'visitor' }, { _hint_: {
		packedOwners: new Map([['owner', { id: 'owner' } as never]]),
		memberCounts: new Map([['room', 0]]),
		myMemberships: new Map([['room', undefined]]),
		myInvitations: new Map([['room', undefined]]),
	} });
	expect(result).toMatchObject({ memberCount: 1, isMuted: false, invitationExists: false });
	expect(findOneBy).not.toHaveBeenCalled();
	expect(countBy).not.toHaveBeenCalled();
	expect(pack).not.toHaveBeenCalled();
});
