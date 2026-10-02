/*
	* SPDX-FileCopyrightText: syuilo and misskey-project
	* SPDX-License-Identifier: AGPL-3.0-only
	*/

process.env.NODE_ENV = 'test';

import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import { loadConfig } from '@/config.js';
import { ChatService, ChatRoomFullError } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { IdService } from '@/core/IdService.js';
import { MiUser } from '@/models/User.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiChatRoomMembership } from '@/models/ChatRoomMembership.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { miRepository } from '@/models/_.js';

let db: DataSource;
let service: ChatService;
let packer: ChatEntityService;
const ids = new IdService({ id: 'aidx' } as never);
const userIds: string[] = [];
const events = { publishChatRoomStream: vi.fn() };

beforeAll(async () => {
	if (!/(^|[_-])test([_-]|$)/i.test(loadConfig().db.db)) throw new Error('An isolated test database is required.');
	db = await initTestDb();
	const repositories = {
	 chatRoomsRepository: db.getRepository(MiChatRoom).extend(miRepository),
	 chatRoomMembershipsRepository: db.getRepository(MiChatRoomMembership).extend(miRepository),
	 chatRoomInvitationsRepository: db.getRepository(MiChatRoomInvitation).extend(miRepository),
	};
	service = Object.setPrototypeOf({ ...repositories, idService: ids, globalEventService: events, notificationService: { createNotification: vi.fn() } }, ChatService.prototype);
	const users = { pack: async (id: string) => ({ id }), packMany: async (values: string[]) => values.map(id => ({ id })) };
	packer = Object.setPrototypeOf({ ...repositories, idService: ids, userEntityService: users }, ChatEntityService.prototype);
});

afterEach(async () => {
	if (db?.isInitialized && userIds.length) await db.getRepository(MiUser).delete(userIds.splice(0));
	vi.clearAllMocks();
});
afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

async function fixture(memberCount: number) {
	const actors = Array.from({ length: memberCount + 3 }, () => {
	 const id = ids.gen();
	 userIds.push(id);
	 return { id, username: `capacity${id}`, usernameLower: `capacity${id}` };
	});
	await db.getRepository(MiUser).insert(actors);
	const room = db.getRepository(MiChatRoom).create({ id: ids.gen(), name: 'Capacity', ownerId: actors[0].id });
	await db.getRepository(MiChatRoom).insert(room);
	if (memberCount) await db.getRepository(MiChatRoomMembership).insert(actors.slice(1, memberCount + 1).map(user => ({ id: ids.gen(), roomId: room.id, userId: user.id })));
	return { room, candidates: actors.slice(-2) };
}

test('a new group includes its creator in single and batch counts', async () => {
	const { room } = await fixture(0);
	expect((await packer.packRoom(room)).memberCount).toBe(1);
	expect((await packer.packRooms([room], { id: room.ownerId }))[0].memberCount).toBe(1);
});

test('the owner plus 49 members is full and cannot issue another invitation', async () => {
	const { room, candidates } = await fixture(49);
	expect((await packer.packRoom(room)).memberCount).toBe(50);
	await expect(service.createRoomInvitation(room.ownerId, room.id, candidates[0].id)).rejects.toBeInstanceOf(ChatRoomFullError);
});

test('only one concurrent invitee takes the last place and the rejected invitation remains', async () => {
	const { room, candidates } = await fixture(48);
	for (const candidate of candidates) await service.createRoomInvitation(room.ownerId, room.id, candidate.id);
	const results = await Promise.allSettled(candidates.map(candidate => service.joinToRoom(candidate.id, room.id)));
	expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
	expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(ChatRoomFullError) });
	expect((await packer.packRoom(room)).memberCount).toBe(50);
	expect(await db.getRepository(MiChatRoomInvitation).countBy({ roomId: room.id })).toBe(1);
	expect(events.publishChatRoomStream).toHaveBeenCalledWith(room.id, 'membersChanged');
});

test('repeated joins and the creator do not consume another place', async () => {
	const { room, candidates } = await fixture(0);
	await service.createRoomInvitation(room.ownerId, room.id, candidates[0].id);
	await Promise.all([service.joinToRoom(candidates[0].id, room.id), service.joinToRoom(candidates[0].id, room.id)]);
	await service.joinToRoom(room.ownerId, room.id);
	expect((await packer.packRoom(room)).memberCount).toBe(2);
	expect(events.publishChatRoomStream).toHaveBeenCalledTimes(1);
});
