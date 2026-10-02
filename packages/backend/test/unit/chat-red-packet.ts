/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import { loadConfig } from '@/config.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { RedPacketService } from '@/core/RedPacketService.js';
import { WalletService } from '@/core/WalletService.js';
import { IdService } from '@/core/IdService.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiChatMessage } from '@/models/ChatMessage.js';
import { MiChatApproval } from '@/models/ChatApproval.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiChatRoomMembership } from '@/models/ChatRoomMembership.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import { miRepository } from '@/models/_.js';

describe('independently funded packets in chat', () => {
	let db: DataSource;
	let chat: ChatService;
	let packets: RedPacketService;
	let wallet: WalletService;
	let packer: ChatEntityService;
	const ids = new IdService({ id: 'aidx' } as never);
	const events = { publishChatUserStream: vi.fn(), publishChatRoomStream: vi.fn(), publishMainStream: vi.fn() };
	const actorIds: string[] = [];

	async function user() {
		const id = ids.gen();
		await db.getRepository(MiUser).insert({ id, username: `chat${id}`, usernameLower: `chat${id}`, chatScope: 'everyone' });
		await db.getRepository(MiUserProfile).insert({ userId: id });
		actorIds.push(id);
		return db.getRepository(MiUser).findOneByOrFail({ id });
	}

	async function packet(userId: string, recipientIds: string[] = []) {
		await wallet.adjust(userId, 100, 'Chat test grant', randomUUID(), userId);
		return packets.create({ kind: 'group', audience: recipientIds.length ? 'recipients' : 'public', recipientIds, mode: 'equal', totalCoins: 20, count: recipientIds.length || 2, message: 'Good luck', expiresInHours: 24, requestId: randomUUID(), coverId: 'sunset' }, { id: userId });
	}

	beforeAll(async () => {
		if (!/(^|[_-])test([_-]|$)/i.test(loadConfig().db.db)) throw new Error('Chat packet tests require an isolated test database.');
		db = await initTestDb();
		wallet = new WalletService(db, ids);
		const userPacker = {
			isLocalUser: (actor: MiUser) => actor.host === null,
			isRemoteUser: (actor: MiUser) => actor.host !== null,
			pack: async (actor: MiUser | string) => ({ id: typeof actor === 'string' ? actor : actor.id }),
			packMany: async (actors: (MiUser | string)[]) => actors.map(actor => ({ id: typeof actor === 'string' ? actor : actor.id })),
		};
		packets = new RedPacketService(db, ids, wallet, userPacker as never, { getLogger: () => ({ error: vi.fn() }) } as never, { getPublicUrl: (file: { url: string }) => file.url } as never);
		packer = Object.setPrototypeOf({ idService: ids, userEntityService: userPacker, redPacketService: packets, driveFileEntityService: { packMany: async () => [] } }, ChatEntityService.prototype);
		const pipeline = { set: vi.fn().mockReturnThis(), sadd: vi.fn().mockReturnThis(), get: vi.fn().mockReturnThis(), del: vi.fn().mockReturnThis(), srem: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([]) };
		chat = Object.setPrototypeOf({
			chatMessagesRepository: db.getRepository(MiChatMessage).extend(miRepository),
			chatApprovalsRepository: db.getRepository(MiChatApproval).extend(miRepository),
			chatRoomsRepository: db.getRepository(MiChatRoom).extend(miRepository),
			chatRoomMembershipsRepository: db.getRepository(MiChatRoomMembership).extend(miRepository),
			usersRepository: db.getRepository(MiUser).extend(miRepository),
			idService: ids, redPacketService: packets, chatEntityService: packer, userEntityService: userPacker,
			roleService: { getUserPolicies: async () => ({ chatAvailability: 'available' }), isModerator: async () => false },
			userBlockingService: { checkBlocked: async (blockerId: string, blockeeId: string) => db.getRepository(MiBlocking).existsBy({ blockerId, blockeeId }) },
			globalEventService: events, redisClient: { pipeline: () => pipeline, get: async () => null },
			logger: { warn: vi.fn() },
		}, ChatService.prototype);
	});
	beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); vi.clearAllMocks(); });
	afterEach(async () => {
		vi.clearAllTimers();
		vi.useRealTimers();
		if (db?.isInitialized && actorIds.length) await db.getRepository(MiUser).delete(actorIds.splice(0));
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('concurrent reference retries broadcast once while separate chat references never debit again', async () => {
		const alice = await user();
		const bob = await user();
		const created = await packet(alice.id);
		const before = await wallet.show(alice.id);
		const results = await Promise.all(Array.from({ length: 6 }, () => chat.createMessageToUser(alice, bob, { redPacketId: created.id })));
		expect(new Set(results.map(message => message.id)).size).toBe(1);
		expect(results[0]).toMatchObject({ redPacketId: created.id, redPacket: { id: created.id, coverId: 'sunset' }, text: null });
		expect(await wallet.show(alice.id)).toEqual(before);
		expect(events.publishChatUserStream).toHaveBeenCalledTimes(2);
		expect(await db.getRepository(MiChatMessage).countBy({ redPacketId: created.id })).toBe(1);
		expect(await db.getRepository(MiWalletTransaction).countBy({ userId: alice.id, type: 'redPacketSend' })).toBe(1);
		const second = await chat.createMessageToUser(alice, bob, { redPacketId: created.id, text: 'Another entry' });
		expect(second.id).not.toBe(results[0].id);
		expect(await wallet.show(alice.id)).toEqual(before);
	});

	test('someone else cannot reference the packet and a failed message does not refund or change it', async () => {
		const alice = await user();
		const bob = await user();
		const created = await packet(alice.id);
		await expect(chat.createMessageToUser(bob, alice, { redPacketId: created.id })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(await db.getRepository(MiChatMessage).countBy({ redPacketId: created.id })).toBe(0);
		expect(await db.getRepository(MiRedPacket).findOneByOrFail({ id: created.id })).toMatchObject({ status: 'active', remainingCoins: 20 });
		expect(await wallet.show(alice.id)).toMatchObject({ balance: 80, reservedBalance: 20 });
		expect(events.publishChatUserStream).not.toHaveBeenCalled();
	});

	test('the creation recipient list controls claims independently of where references appear', async () => {
		const alice = await user();
		const bob = await user();
		const stranger = await user();
		const created = await packet(alice.id, [bob.id]);
		await chat.createMessageToUser(alice, stranger, { redPacketId: created.id });
		await expect(packets.show(created.id, stranger)).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(await packets.claim(created.id, bob)).toMatchObject({ claimedCoins: 20 });
		await db.getRepository(MiBlocking).insert({ id: ids.gen(), blockerId: alice.id, blockeeId: bob.id });
		await expect(packets.show(created.id, bob)).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
	});

	test('deleting a chat reference leaves the packet claimable and permits a new reference', async () => {
		const alice = await user();
		const bob = await user();
		const created = await packet(alice.id, [bob.id]);
		const message = await chat.createMessageToUser(alice, bob, { redPacketId: created.id });
		await chat.deleteMessage(await db.getRepository(MiChatMessage).findOneByOrFail({ id: message.id }));
		expect(await wallet.show(alice.id)).toMatchObject({ balance: 80, reservedBalance: 20 });
		await packets.claim(created.id, bob);
		expect(await wallet.show(bob.id)).toMatchObject({ balance: 20 });
		await expect(chat.createMessageToUser(alice, bob, { redPacketId: created.id })).resolves.toMatchObject({ redPacketId: created.id });
		expect(await db.getRepository(MiChatMessage).countBy({ redPacketId: created.id })).toBe(1);
	});

	test('a room recipient snapshot survives leaving the room and deleting the room', async () => {
		const owner = await user();
		const member = await user();
		const stranger = await user();
		const room = db.getRepository(MiChatRoom).create({ id: ids.gen(), name: 'Packet room', ownerId: owner.id });
		await db.getRepository(MiChatRoom).insert(room);
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: room.id, userId: member.id });
		const created = await packet(owner.id, [member.id]);
		const results = await Promise.all(Array.from({ length: 4 }, () => chat.createMessageToRoom(owner, room, { redPacketId: created.id })));
		expect(new Set(results.map(message => message.id)).size).toBe(1);
		expect(events.publishChatRoomStream).toHaveBeenCalledOnce();
		await expect(packets.claim(created.id, stranger)).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await db.getRepository(MiChatRoomMembership).delete({ roomId: room.id, userId: member.id });
		await chat.deleteRoom(room);
		expect(await wallet.show(owner.id)).toMatchObject({ balance: 80, reservedBalance: 20 });
		expect(await db.getRepository(MiChatMessage).findOneBy({ id: results[0].id })).toBeNull();
		expect(await packets.claim(created.id, member)).toMatchObject({ claimedCoins: 20 });
	});

	test('a single-owner group packet admits later members and rejects departed members', async () => {
		const owner = await user();
		const member = await user();
		const lateMember = await user();
		const room = await chat.createRoom(owner, { name: 'Single-owner room' });
		await wallet.adjust(owner.id, 100, 'Test grant', randomUUID(), owner.id);
		const created = await packets.create({ kind: 'group', audience: 'room', roomId: room.id, recipientIds: [], mode: 'equal', totalCoins: 20, count: 2, message: '', expiresInHours: 24, requestId: randomUUID() }, owner);
		await expect(chat.createMessageToRoom(owner, room, { redPacketId: created.id })).resolves.toMatchObject({ redPacketId: created.id });
		await expect(packets.claim(created.id, member)).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: room.id, userId: member.id });
		expect(await packets.list(member, 10, undefined, 'claimable')).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
		await chat.leaveRoom(member.id, room.id);
		await expect(packets.claim(created.id, member)).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: room.id, userId: lateMember.id });
		expect(await packets.claim(created.id, lateMember)).toMatchObject({ claimedCoins: 10 });
		expect(await packets.claim(created.id, lateMember)).toMatchObject({ claimedCoins: 10 });
		expect(await wallet.show(lateMember.id)).toMatchObject({ balance: 10 });
		await db.getRepository(MiChatRoom).update(room.id, { isArchived: true });
		expect(await packets.list(member, 10, undefined, 'claimable')).toEqual([]);
		await chat.deleteRoom(room);
		await expect(packets.claim(created.id, lateMember)).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(await packets.show(created.id, owner)).toMatchObject({ roomId: null, remainingCoins: 10 });
	});

	test('chat history packs packet summaries in a single batch', async () => {
		const alice = await user();
		const bob = await user();
		for (let index = 0; index < 3; index++) {
			const created = await packet(alice.id);
			await chat.createMessageToUser(alice, bob, { redPacketId: created.id });
		}
		const rows = await db.getRepository(MiChatMessage).findBy({ fromUserId: alice.id });
		const batch = vi.spyOn(packets, 'packByIds');
		const single = vi.spyOn(packets, 'packById');
		const result = await packer.packMessagesLiteFor1on1(rows);
		expect(result.every(message => message.redPacket?.coverId === 'sunset')).toBe(true);
		expect(batch).toHaveBeenCalledOnce();
		expect(single).not.toHaveBeenCalled();
	});
});
