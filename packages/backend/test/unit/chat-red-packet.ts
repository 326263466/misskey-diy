/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import * as Redis from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import { loadConfig } from '@/config.js';
import { ChatService, ChatRoomSilencedError, ChatPokeError, ChatMessageEditError, ChatSilenceDurationError } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ChatConversationService } from '@/core/ChatConversationService.js';
import { MiChatConversationSetting } from '@/models/ChatConversationSetting.js';
import { RedPacketService, type RedPacketDraft } from '@/core/RedPacketService.js';
import { ChatRedPacketService } from '@/core/ChatRedPacketService.js';
import { WalletService, WALLET_MAX_BALANCE } from '@/core/WalletService.js';
import { IdService } from '@/core/IdService.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiChatMessage } from '@/models/ChatMessage.js';
import { MiChatApproval } from '@/models/ChatApproval.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiChatRoomMembership } from '@/models/ChatRoomMembership.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiMuting } from '@/models/Muting.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiRedPacketClaim } from '@/models/RedPacketClaim.js';
import { MiWallet } from '@/models/Wallet.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import { miRepository } from '@/models/_.js';
import { toCoinUnits } from '@/misc/coins.js';
import ClaimEndpoint from '@/server/api/endpoints/red-packets/claim.js';
import SendToUserEndpoint from '@/server/api/endpoints/chat/messages/create-to-user.js';
import UnreadEndpoint from '@/server/api/endpoints/chat/unread.js';
import MuteRoomEndpoint from '@/server/api/endpoints/chat/rooms/mute.js';

describe('independently funded packets in chat', () => {
	let db: DataSource;
	let chat: ChatService;
	let packets: RedPacketService;
	let chatPackets: ChatRedPacketService;
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

	async function packet(userId: string, recipientIds: string[] = [], overrides: Partial<RedPacketDraft> = {}) {
		await wallet.adjust(userId, 100, 'Chat test grant', randomUUID(), userId);
		return packets.create({ kind: 'group', audience: recipientIds.length ? 'recipients' : 'public', recipientIds, mode: 'equal', totalCoins: 20, count: recipientIds.length || 2, message: 'Good luck', expiresInHours: 24, requestId: randomUUID(), coverId: 'sunset', ...overrides }, { id: userId });
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
		chatPackets = new ChatRedPacketService(db, packets, { getLogger: () => ({ error: vi.fn() }) } as never);
		packer = Object.setPrototypeOf({
			idService: ids, userEntityService: userPacker, redPacketService: packets, driveFileEntityService: { packMany: async () => [] },
			chatRoomsRepository: db.getRepository(MiChatRoom),
			chatRoomMembershipsRepository: db.getRepository(MiChatRoomMembership),
			chatRoomInvitationsRepository: db.getRepository(MiChatRoomInvitation),
		}, ChatEntityService.prototype);
		const pipeline = { set: vi.fn().mockReturnThis(), sadd: vi.fn().mockReturnThis(), get: vi.fn().mockReturnThis(), del: vi.fn().mockReturnThis(), srem: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([]) };
		chat = Object.setPrototypeOf({
			chatConversationService: new ChatConversationService(db, ids),
			config: loadConfig(),
			chatMessagesRepository: db.getRepository(MiChatMessage).extend(miRepository),
			chatApprovalsRepository: db.getRepository(MiChatApproval).extend(miRepository),
			chatRoomsRepository: db.getRepository(MiChatRoom).extend(miRepository),
			chatRoomMembershipsRepository: db.getRepository(MiChatRoomMembership).extend(miRepository),
			usersRepository: db.getRepository(MiUser).extend(miRepository),
			mutingsRepository: db.getRepository(MiMuting).extend(miRepository),
			idService: ids, chatRedPacketService: chatPackets, chatEntityService: packer, userEntityService: userPacker,
			roleService: { getUserPolicies: async () => ({ chatAvailability: 'available' }), isModerator: async () => false },
			userBlockingService: { checkBlocked: async (blockerId: string, blockeeId: string) => db.getRepository(MiBlocking).existsBy({ blockerId, blockeeId }) },
			globalEventService: events, redisClient: { pipeline: () => pipeline, get: async () => null, scard: async () => 0, eval: vi.fn().mockResolvedValue(1) },
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

	test('concurrent reference retries broadcast once and reject combining the packet with text', async () => {
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
		expect((await chat.createMessageToUser(alice, bob, { redPacketId: created.id, text: '   ' })).id).toBe(results[0].id);
		await expect(chat.createMessageToUser(alice, bob, { redPacketId: created.id, text: 'Another entry' })).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		expect(await db.getRepository(MiChatMessage).countBy({ redPacketId: created.id })).toBe(1);
		expect(await wallet.show(alice.id)).toEqual(before);
	});

	test('红包禁止混入附件或回复，也不能通过编辑补入文字', async () => {
		const alice = await user();
		const bob = await user();
		const created = await packet(alice.id);
		const original = await chat.createMessageToUser(alice, bob, { text: 'original' });
		await expect(chat.createMessageToUser(alice, bob, { redPacketId: created.id, file: { id: ids.gen() } as never })).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		await expect(chat.createMessageToUser(alice, bob, { redPacketId: created.id, replyId: original.id })).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		const sent = await chat.createMessageToUser(alice, bob, { redPacketId: created.id });
		const saved = await db.getRepository(MiChatMessage).findOneByOrFail({ id: sent.id });
		await expect(chat.editMessage(saved, 'extra text')).rejects.toBeInstanceOf(ChatMessageEditError);
		expect(await db.getRepository(MiChatMessage).findOneByOrFail({ id: sent.id })).toMatchObject({ text: null, fileId: null, replyId: null });
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

	test('删除聊天消息保留红包有效期和冻结余额', async () => {
		const alice = await user();
		const bob = await user();
		const created = await packet(alice.id, [bob.id]);
		const message = await chat.createMessageToUser(alice, bob, { redPacketId: created.id });
		await chat.deleteMessage(await db.getRepository(MiChatMessage).findOneByOrFail({ id: message.id }));
		expect(await wallet.show(alice.id)).toMatchObject({ balance: 80, reservedBalance: 20 });
		expect(await packets.show(created.id, bob)).toMatchObject({ status: 'active', expiresAt: created.expiresAt });
		expect(await packets.claim(created.id, bob)).toMatchObject({ claimedCoins: 20 });
		expect(await db.getRepository(MiChatMessage).countBy({ redPacketId: created.id })).toBe(0);
	});

	test('删除群不提前退回消息引用的定向红包', async () => {
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
		expect(await packets.show(created.id, owner)).toMatchObject({ roomId: null, remainingCoins: 10, status: 'active', expiresAt: created.expiresAt });
		expect(await wallet.show(owner.id)).toMatchObject({ balance: 80, reservedBalance: 10 });
		await db.getRepository(MiRedPacket).update(created.id, { expiresAt: new Date(0) });
		await packets.sweepExpired();
		expect(await wallet.show(owner.id)).toMatchObject({ balance: 90, reservedBalance: 0 });
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

	test('私聊历史按对端去重排序并在数据库分页，屏蔽及无关会话不可见', async () => {
		const me = await user();
		const first = await user();
		const second = await user();
		const muted = await user();
		const unrelated = await user();
		const room = await chat.createRoom(me, { name: 'Not direct history' });
		const messages = [
			{ id: ids.gen(), fromUserId: me.id, toUserId: first.id, text: 'old' },
			{ id: ids.gen(), fromUserId: second.id, toUserId: me.id, text: 'second latest' },
			{ id: ids.gen(), fromUserId: first.id, toUserId: me.id, text: 'first latest' },
			{ id: ids.gen(), fromUserId: me.id, toUserId: muted.id, text: 'muted outgoing' },
			{ id: ids.gen(), fromUserId: muted.id, toUserId: me.id, text: 'muted incoming' },
			{ id: ids.gen(), fromUserId: first.id, toUserId: unrelated.id, text: 'private elsewhere' },
			{ id: ids.gen(), fromUserId: me.id, toRoomId: room.id, text: 'room message' },
		];
		await db.getRepository(MiChatMessage).insert(messages);
		await db.getRepository(MiMuting).insert({ id: ids.gen(), muterId: me.id, muteeId: muted.id });
		const queries = vi.spyOn(db.logger, 'logQuery');
		try {
			expect((await chat.userHistory(me.id, 100)).map(message => message.id)).toEqual([messages[2].id, messages[1].id]);
			expect(queries).toHaveBeenCalledOnce();
			queries.mockClear();
			expect((await chat.userHistory(me.id, 1, 1)).map(message => message.id)).toEqual([messages[1].id]);
			expect(queries).toHaveBeenCalledOnce();
			expect(await chat.userHistory(me.id, 1, 2)).toEqual([]);
		} finally {
			queries.mockRestore();
		}
	});

	test('群历史单次查询覆盖群主和成员，分页不会重复且退出后不可见', async () => {
		const me = await user();
		const other = await user();
		const outsider = await user();
		const owned = await chat.createRoom(me, { name: 'Owned history' });
		const joined = await chat.createRoom(other, { name: 'Joined history' });
		const hidden = await chat.createRoom(other, { name: 'Hidden history' });
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: joined.id, userId: me.id });
		const messages = [
			{ id: ids.gen(), fromUserId: me.id, toRoomId: owned.id, text: 'old owned' },
			{ id: ids.gen(), fromUserId: other.id, toRoomId: joined.id, text: 'joined latest' },
			{ id: ids.gen(), fromUserId: me.id, toRoomId: owned.id, text: 'owned latest' },
			{ id: ids.gen(), fromUserId: other.id, toRoomId: hidden.id, text: 'hidden latest' },
		];
		await db.getRepository(MiChatMessage).insert(messages);
		const queries = vi.spyOn(db.logger, 'logQuery');
		try {
			expect((await chat.roomHistory(me.id, 100)).map(message => message.id)).toEqual([messages[2].id, messages[1].id]);
			expect(queries).toHaveBeenCalledOnce();
			queries.mockClear();
			expect((await chat.roomHistory(me.id, 1, 1)).map(message => message.id)).toEqual([messages[1].id]);
			expect(queries).toHaveBeenCalledOnce();
			expect(await chat.roomHistory(outsider.id, 100)).toEqual([]);
			await db.getRepository(MiChatRoomMembership).delete({ roomId: joined.id, userId: me.id });
			expect((await chat.roomHistory(me.id, 100)).map(message => message.id)).toEqual([messages[2].id]);
		} finally {
			queries.mockRestore();
		}
	});

	test('聊天自动领取须在已发布的同一私聊发送正确口令', async () => {
		const alice = await user();
		const bob = await user();
		const stranger = await user();
		const created = await packet(alice.id, [bob.id], { kind: 'direct', mode: 'random', password: ' 芝麻开门 ' });
		expect(created.password).toBe('芝麻开门');
		await expect(new ClaimEndpoint(packets).exec({ redPacketId: created.id }, bob as never, null)).rejects.toMatchObject({ code: 'RED_PACKET_PASSWORD_REQUIRED' });
		await expect(chatPackets.assertCanReference(created.id, alice.id, {})).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(await chat.createMessageToUser(bob, alice, { allowPasswordClaim: true, text: '芝麻开门' })).not.toHaveProperty('redPacketClaims');
		await expect(chat.createMessageToUser(alice, stranger, { redPacketId: created.id })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await chat.createMessageToUser(alice, bob, { redPacketId: created.id });
		expect(await chat.createMessageToUser(alice, bob, { allowPasswordClaim: true, text: '芝麻开门' })).not.toHaveProperty('redPacketClaims');
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: created.id })).toBe(0);
		expect(await wallet.show(alice.id)).toMatchObject({ balance: 80, reservedBalance: 20 });
		const endpoint = new SendToUserEndpoint({} as never, { getUser: async () => alice } as never, chat);
		expect(await endpoint.exec({ toUserId: alice.id, text: '芝麻开门' }, bob as never, { id: 'chat-only-token' } as never)).not.toHaveProperty('redPacketClaims');
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: created.id })).toBe(0);
		expect(await chat.createMessageToUser(bob, stranger, { allowPasswordClaim: true, text: '芝麻开门' })).not.toHaveProperty('redPacketClaims');
		expect(await chat.createMessageToUser(bob, alice, { allowPasswordClaim: true, text: '芝麻开门！' })).not.toHaveProperty('redPacketClaims');
		events.publishChatUserStream.mockClear();
		const claimed = await chat.createMessageToUser(bob, alice, { allowPasswordClaim: true, text: '  芝麻开门  ' });
		expect(claimed).toMatchObject({ text: '芝麻开门', redPacketClaims: [{ redPacketId: created.id, coins: 20 }] });
		expect(events.publishChatUserStream).toHaveBeenCalledTimes(2);
		expect(events.publishChatUserStream.mock.calls.every(call => !('redPacketClaims' in call[3]))).toBe(true);
		expect(await chat.createMessageToUser(bob, alice, { allowPasswordClaim: true, text: '芝麻开门' })).not.toHaveProperty('redPacketClaims');
		expect(await chatPackets.claimPasswordsForMessage(claimed.id, bob)).toEqual([]);
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: created.id, userId: bob.id })).toBe(1);
		expect(await wallet.show(bob.id)).toMatchObject({ balance: 20, reservedBalance: 0 });
		expect(await wallet.show(alice.id)).toMatchObject({ balance: 80, reservedBalance: 0 });
	});

	test('群口令接口按当前成员权限直接领取，无需发布群消息', async () => {
		const owner = await user();
		const member = await user();
		const outsider = await user();
		const room = await chat.createRoom(owner, { name: 'Independent password packet' });
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: room.id, userId: member.id });
		const created = await packet(owner.id, [], { audience: 'room', roomId: room.id, mode: 'random', password: '独立领取' });
		const endpoint = new ClaimEndpoint(packets);
		await expect(endpoint.exec({ redPacketId: created.id, password: '独立领取' }, outsider as never, null)).rejects.toMatchObject({ code: 'RED_PACKET_ACCESS_DENIED' });
		await db.getRepository(MiChatRoomMembership).delete({ roomId: room.id, userId: member.id });
		await expect(endpoint.exec({ redPacketId: created.id, password: '独立领取' }, member as never, null)).rejects.toMatchObject({ code: 'RED_PACKET_ACCESS_DENIED' });
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: room.id, userId: member.id });
		expect(await db.getRepository(MiChatMessage).countBy({ redPacketId: created.id })).toBe(0);
		const result = await endpoint.exec({ redPacketId: created.id, password: '独立领取' }, member as never, null);
		expect(result.claimedCoins).toBeGreaterThan(0);
		expect(await wallet.show(member.id)).toMatchObject({ balance: result.claimedCoins, reservedBalance: 0 });
		await db.getRepository(MiChatRoom).update(room.id, { isArchived: true });
		await expect(endpoint.exec({ redPacketId: created.id, password: '独立领取' }, owner as never, null)).rejects.toMatchObject({ code: 'RED_PACKET_ACCESS_DENIED' });
	});

	test('消息在候选匹配后被编辑，聊天适配层仍在领取事务内重新验证', async () => {
		const alice = await user();
		const bob = await user();
		const created = await packet(alice.id, [bob.id], { kind: 'direct', mode: 'random', password: '不能编辑' });
		await chat.createMessageToUser(alice, bob, { redPacketId: created.id });
		const message = await chat.createMessageToUser(bob, alice, { text: '不能编辑' });
		const claim = packets.claimWithContext.bind(packets);
		const call = vi.spyOn(packets, 'claimWithContext').mockImplementationOnce(async (packetId, actor, context) => {
			await db.getRepository(MiChatMessage).update(message.id, { editedAt: new Date() });
			return claim(packetId, actor, context);
		});
		try {
			expect(await chatPackets.claimPasswordsForMessage(message.id, bob)).toEqual([]);
			expect(call).toHaveBeenCalledOnce();
			expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: created.id })).toBe(0);
			expect(await wallet.show(alice.id)).toMatchObject({ balance: 80, reservedBalance: 20 });
			expect(await wallet.show(bob.id)).toMatchObject({ balance: 0, reservedBalance: 0 });
		} finally { call.mockRestore(); }
	});

	test('群聊口令匹配已发布群红包，并发重复消息只入账一次且不超总额', async () => {
		const owner = await user();
		const bob = await user();
		const charlie = await user();
		const firstRoom = await chat.createRoom(owner, { name: 'First password room' });
		const secondRoom = await chat.createRoom(owner, { name: 'Second password room' });
		for (const room of [firstRoom, secondRoom]) {
			await db.getRepository(MiChatRoomMembership).insert([bob, charlie].map(member => ({ id: ids.gen(), roomId: room.id, userId: member.id })));
		}
		const created = await packet(owner.id, [], { audience: 'room', roomId: firstRoom.id, mode: 'random', password: '好运来' });
		const otherRoom = await packet(owner.id, [], { audience: 'room', roomId: secondRoom.id, mode: 'random', password: '好运来' });
		const unpublished = await packet(owner.id, [], { audience: 'room', roomId: firstRoom.id, mode: 'random', password: '好运来' });
		await expect(chat.createMessageToRoom(owner, secondRoom, { redPacketId: created.id })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await chat.createMessageToRoom(owner, firstRoom, { redPacketId: created.id });
		await chat.createMessageToRoom(owner, secondRoom, { redPacketId: otherRoom.id });
		const results = await Promise.all([bob, charlie].flatMap(member => Array.from({ length: 4 }, () => chat.createMessageToRoom(member, firstRoom, { allowPasswordClaim: true, text: '好运来' }))));
		const rewards = results.flatMap(message => message.redPacketClaims ?? []);
		expect(rewards).toHaveLength(2);
		expect(rewards.every(reward => reward.redPacketId === created.id)).toBe(true);
		expect(rewards.reduce((sum, reward) => sum + toCoinUnits(reward.coins), 0)).toBe(2000);
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: created.id })).toBe(2);
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: otherRoom.id })).toBe(0);
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: unpublished.id })).toBe(0);
		expect(await db.getRepository(MiRedPacket).findOneByOrFail({ id: created.id })).toMatchObject({ remainingCoins: 0, remainingCount: 0, status: 'exhausted' });
		expect(events.publishChatRoomStream.mock.calls.every(call => !('redPacketClaims' in call[2]))).toBe(true);
		await chat.createMessageToRoom(owner, firstRoom, { redPacketId: unpublished.id });
		await db.getRepository(MiChatRoomMembership).delete({ roomId: firstRoom.id, userId: bob.id });
		const balanceBefore = await wallet.show(bob.id);
		const departedMessage = { id: ids.gen(), fromUserId: bob.id, toRoomId: firstRoom.id, text: '好运来' };
		await db.getRepository(MiChatMessage).insert(departedMessage);
		expect(await chatPackets.claimPasswordsForMessage(departedMessage.id, bob)).toEqual([]);
		expect(await chatPackets.claimPasswordsForMessage(departedMessage.id, charlie)).toEqual([]);
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: unpublished.id })).toBe(0);
		expect(await wallet.show(bob.id)).toEqual(balanceBefore);
	});

	test('删除红包消息后无法凭口令领取，钱包入账失败也不阻断聊天', async () => {
		const alice = await user();
		const bob = await user();
		const deleted = await packet(alice.id, [bob.id], { kind: 'direct', mode: 'random', password: '已撤回口令' });
		const reference = await chat.createMessageToUser(alice, bob, { redPacketId: deleted.id });
		await chat.deleteMessage(await db.getRepository(MiChatMessage).findOneByOrFail({ id: reference.id }));
		expect(await chat.createMessageToUser(bob, alice, { allowPasswordClaim: true, text: '已撤回口令' })).not.toHaveProperty('redPacketClaims');
		const fullWallet = await packet(alice.id, [bob.id], { kind: 'direct', mode: 'random', password: '钱包已满' });
		await chat.createMessageToUser(alice, bob, { redPacketId: fullWallet.id });
		await db.getRepository(MiWallet).insert({ userId: bob.id, balance: WALLET_MAX_BALANCE, reservedBalance: 0 });
		await expect(chat.createMessageToUser(bob, alice, { allowPasswordClaim: true, text: '钱包已满' })).resolves.toMatchObject({ text: '钱包已满' });
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: fullWallet.id })).toBe(0);
		expect(await db.getRepository(MiRedPacket).findOneByOrFail({ id: fullWallet.id })).toMatchObject({ remainingCoins: 20, remainingCount: 1, status: 'active' });
		expect(await wallet.show(bob.id)).toMatchObject({ balance: WALLET_MAX_BALANCE });
	});

	test('群事件接收人包含群主和当前成员，移除后立即重新计算', async () => {
		const owner = await user();
		const member = await user();
		const room = await chat.createRoom(owner, { name: 'Stream recipients' });
		expect(await chat.getRoomRecipientIds(room.id)).toEqual(new Set([owner.id]));
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: room.id, userId: member.id });
		expect(await chat.getRoomRecipientIds(room.id)).toEqual(new Set([owner.id, member.id]));
		await chat.removeRoomMember(owner.id, room.id, member.id);
		expect(await chat.getRoomRecipientIds(room.id)).toEqual(new Set([owner.id]));
	});

	test.each(['owner', 'member'] as const)('群通知静音仅影响自己，%s 支持到期恢复及永久静音', async targetRole => {
		const owner = await user();
		const sender = await user();
		const member = await user();
		const stranger = await user();
		const room = await chat.createRoom(owner, { name: 'Muted room' });
		await db.getRepository(MiChatRoomMembership).insert([sender, member].map(actor => ({ id: ids.gen(), roomId: room.id, userId: actor.id })));
		const target = targetRole === 'owner' ? owner : member;
		const other = targetRole === 'owner' ? member : owner;
		const endpoint = new MuteRoomEndpoint(chat);
		await expect(endpoint.exec({ roomId: room.id, mute: true }, stranger as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_ROOM' });
		await expect(endpoint.exec({ roomId: ids.gen(), mute: true }, owner as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_ROOM' });
		for (const duration of [59, 31536001, 60.5]) {
			await expect(endpoint.exec({ roomId: room.id, mute: true, duration }, target as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		await endpoint.exec({ roomId: room.id, mute: true, duration: 60 }, target as never, null);
		const muted = await packer.packRoom(room.id, target);
		expect(muted).toMatchObject({ isMuted: true, mutedUntil: expect.any(String), isSilenced: false, memberCount: 3 });
		expect(new Date(muted.mutedUntil!).getTime()).toBeGreaterThan(Date.now());
		expect(await packer.packRoom(room.id, other)).toMatchObject({ isMuted: false, mutedUntil: null });
		expect(await db.getRepository(MiChatRoomMembership).existsBy({ roomId: room.id, userId: owner.id })).toBe(false);
		const redis = Reflect.get(chat, 'redisClient');
		redis.eval.mockClear();
		await chat.createMessageToRoom(sender, room, { text: 'during mute' });
		expect(redis.eval.mock.calls.map((call: unknown[]) => call[2]).sort()).toEqual([`newRoomChatMessageExists:${other.id}:${room.id}`, `newRoomChatMessageExists:${target.id}:${room.id}`].sort());
		await db.getRepository(MiChatConversationSetting).update({ roomId: room.id, ownerId: target.id }, { mutedUntil: new Date(Date.now() - 1) });
		if (targetRole === 'owner') {
			await db.getRepository(MiChatRoom).update(room.id, { ownerMutedUntil: new Date(Date.now() - 1) });
		} else {
			await db.getRepository(MiChatRoomMembership).update({ roomId: room.id, userId: target.id }, { mutedUntil: new Date(Date.now() - 1) });
		}
		expect(await packer.packRoom(room.id, target)).toMatchObject({ isMuted: false, mutedUntil: null });
		redis.eval.mockClear();
		await chat.createMessageToRoom(sender, room, { text: 'after expiry' });
		expect(redis.eval.mock.calls.map((call: unknown[]) => call[2])).toEqual(expect.arrayContaining([
			`newRoomChatMessageExists:${target.id}:${room.id}`, `newRoomChatMessageExists:${other.id}:${room.id}`,
		]));
		await endpoint.exec({ roomId: room.id, mute: true }, target as never, null);
		expect(await packer.packRoom(room.id, target)).toMatchObject({ isMuted: true, mutedUntil: null });
		await endpoint.exec({ roomId: room.id, mute: false }, target as never, null);
		expect(await packer.packRoom(room.id, target)).toMatchObject({ isMuted: false, mutedUntil: null });
	});

	test('群禁言在服务端阻止发言、编辑和戳一戳，群主可发言，到期自动解除', async () => {
		const owner = await user();
		const member = await user();
		const room = await chat.createRoom(owner, { name: 'Silenced room' });
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: room.id, userId: member.id });
		const sent = await chat.createMessageToRoom(member, room, { text: 'before silence' });
		const message = await db.getRepository(MiChatMessage).findOneByOrFail({ id: sent.id });
		const silenced = await chat.updateRoom(room, { isSilenced: true, silenceUntil: new Date(Date.now() + 60000) }, owner.id);
		expect(events.publishChatRoomStream).toHaveBeenCalledWith(room.id, 'roomUpdated');
		await expect(chat.createMessageToRoom(member, room, { text: 'blocked' })).rejects.toBeInstanceOf(ChatRoomSilencedError);
		await expect(chat.createMessageToRoom(member, room, { pokeUserId: owner.id })).rejects.toBeInstanceOf(ChatRoomSilencedError);
		await expect(chat.editMessage(message, 'blocked edit')).rejects.toBeInstanceOf(ChatRoomSilencedError);
		await expect(chat.createMessageToRoom(owner, silenced, { text: 'owner notice' })).resolves.toMatchObject({ text: 'owner notice' });
		await db.getRepository(MiChatRoom).update(room.id, { silenceUntil: new Date(Date.now() - 1) });
		await expect(chat.createMessageToRoom(member, room, { text: 'after expiry' })).resolves.toMatchObject({ text: 'after expiry' });
		await expect(chat.editMessage(message, 'after expiry')).resolves.toMatchObject({ text: 'after expiry' });
		await expect(chat.updateRoom(room, { isSilenced: true, silenceUntil: new Date('invalid') }, owner.id)).rejects.toBeInstanceOf(ChatSilenceDurationError);
		const unsilenced = await chat.updateRoom(room, { isSilenced: false }, owner.id);
		expect(unsilenced).toMatchObject({ isSilenced: false, silenceUntil: null });
	});

	test('戳一戳保存目标，可撤回、不可编辑，不能混合正文或指定非会话成员', async () => {
		const owner = await user();
		const member = await user();
		const outsider = await user();
		const room = await chat.createRoom(owner, { name: 'Poke room' });
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: room.id, userId: member.id });
		const poked = await chat.createMessageToRoom(owner, room, { pokeUserId: member.id });
		expect(poked).toMatchObject({ isPoke: true, pokeUserId: member.id, pokeUser: { id: member.id }, text: null });
		const message = await db.getRepository(MiChatMessage).findOneByOrFail({ id: poked.id });
		await expect(chat.editMessage(message, 'ordinary text')).rejects.toBeInstanceOf(ChatMessageEditError);
		await expect(chat.createMessageToRoom(owner, room, { pokeUserId: outsider.id })).rejects.toBeInstanceOf(ChatPokeError);
		await expect(chat.createMessageToRoom(owner, room, { pokeUserId: member.id, text: 'mixed' })).rejects.toBeInstanceOf(ChatPokeError);
		await expect(chat.createMessageToUser(owner, member, { pokeUserId: outsider.id })).rejects.toBeInstanceOf(ChatPokeError);
		await expect(chat.createMessageToUser(owner, member, { pokeUserId: member.id })).resolves.toMatchObject({ isPoke: true, pokeUserId: member.id });
		await db.getRepository(MiUser).delete(member.id);
		const orphaned = await db.getRepository(MiChatMessage).findOneByOrFail({ id: message.id });
		expect(orphaned).toMatchObject({ isPoke: true, pokeUserId: null });
		await expect(chat.editMessage(orphaned, 'ordinary text')).rejects.toBeInstanceOf(ChatMessageEditError);
		await chat.deleteMessage(orphaned);
		expect(await db.getRepository(MiChatMessage).existsBy({ id: message.id })).toBe(false);
		expect(events.publishChatRoomStream).toHaveBeenCalledWith(room.id, 'deleted', message.id);
	});

	test('未读快照计数及显式提及准确，确认旧快照不会清除同时到达的新消息', async () => {
		const alice = await user();
		const bob = await user();
		const outsider = await user();
		const room = await chat.createRoom(alice, { name: 'Unread room' });
		await db.getRepository(MiChatRoomMembership).insert({ id: ids.gen(), roomId: room.id, userId: bob.id });
		const redis = new Redis.Redis({ ...loadConfig().redis, keyPrefix: `chat-unread-${randomUUID()}:` });
		const previousRedis = Reflect.get(chat, 'redisClient');
		Reflect.set(chat, 'redisClient', redis);
		try {
			const first = await chat.createMessageToUser(alice, bob, { text: `\`@${bob.username}\` @${bob.username}@remote.test` });
			expect((await chat.getUnreadSnapshot(bob.id, 'user', alice.id)).firstMentionId).toBeNull();
			const mention = await chat.createMessageToUser(alice, bob, { text: `@${bob.username}@${loadConfig().host} hello` });
			const poke = await chat.createMessageToUser(alice, bob, { pokeUserId: bob.id });
			const snapshot = await chat.getUnreadSnapshot(bob.id, 'user', alice.id);
			expect(snapshot).toEqual({ count: 3, firstMessageId: first.id, firstMentionId: mention.id, lastMessageId: poke.id });
			await chat.readUserChatMessage(bob.id, alice.id, first.id);
			expect(await chat.getUnreadSnapshot(bob.id, 'user', alice.id)).toMatchObject({ count: 2, firstMessageId: mention.id });
			const arriving = await chat.createMessageToUser(alice, bob, { text: 'arriving while reading' });
			await chat.readUserChatMessage(bob.id, alice.id, snapshot.lastMessageId);
			expect(await chat.getUnreadSnapshot(bob.id, 'user', alice.id)).toEqual({ count: 1, firstMessageId: arriving.id, firstMentionId: null, lastMessageId: arriving.id });
			expect(await chat.hasUnreadMessages(bob.id)).toBe(true);
			await chat.readAllChatMessages(bob.id);
			expect(await chat.getUnreadSnapshot(bob.id, 'user', alice.id)).toEqual({ count: 0, firstMessageId: null, firstMentionId: null, lastMessageId: null });
			expect(await chat.hasUnreadMessages(bob.id)).toBe(false);
			const firstRoomMessage = await chat.createMessageToRoom(alice, room, { text: 'room unread' });
			const endpoint = new UnreadEndpoint(chat, { getUser: async () => alice } as never);
			await expect(endpoint.exec({ roomId: room.id }, outsider as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_ROOM' });
			expect(await endpoint.exec({ roomId: room.id }, bob as never, null)).toEqual({ count: 1, firstMessageId: firstRoomMessage.id, firstMentionId: null, lastMessageId: firstRoomMessage.id });
			await chat.readRoomChatMessage(bob.id, room.id, firstRoomMessage.id);
			expect(await chat.hasUnreadMessages(bob.id)).toBe(false);
		} finally {
			Reflect.set(chat, 'redisClient', previousRedis);
			await redis.del(
				`newUserChatMessageExists:${bob.id}:${alice.id}`, `firstUnreadChatMessage:user:${bob.id}:${alice.id}`, `readChatMessageUntil:user:${bob.id}:${alice.id}`,
				`newRoomChatMessageExists:${bob.id}:${room.id}`, `firstUnreadChatMessage:room:${bob.id}:${room.id}`, `readChatMessageUntil:room:${bob.id}:${room.id}`,
				`newChatMessagesExists:${bob.id}`,
			);
			await redis.quit();
		}
	});
});
