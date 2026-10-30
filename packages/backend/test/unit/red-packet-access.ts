/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { RedPacketService } from '@/core/RedPacketService.js';
import type { RedPacketDraft } from '@/core/RedPacketService.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiRedPacketRecipient } from '@/models/RedPacketRecipient.js';
import { MiRedPacketClaim } from '@/models/RedPacketClaim.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiUser } from '@/models/User.js';
import type { EntityManager } from 'typeorm';

function fixture() {
	const packet: MiRedPacket = Object.assign(new MiRedPacket(), {
		id: 'packet', userId: 'sender', kind: 'direct', audience: 'room', roomId: 'room',
		mode: 'equal', password: null, count: 1, totalCoins: 10, remainingCount: 1, remainingCoins: 10,
		message: '', coverId: 'classic', coverFileId: null, coverUrl: null,
		status: 'active', startsAt: null, expiresAt: new Date(Date.now() + 86400000),
	});
	const members = new Set(['recipient', 'other']);
	const room = { ownerId: 'sender', isArchived: false };
	let roomExists = true;
	const users = new Map<string, MiUser>(['sender', 'recipient', 'other'].map(id => [id, new MiUser({
		id, username: id, name: id, host: null, isSuspended: false, isDeleted: false, movedToUri: null,
	})]));
	const blocks = new Set<string>();
	const claims = new Map<string, MiRedPacketClaim>();
	const wallets = { lockWalletsInTransaction: vi.fn(), changeBalanceInTransaction: vi.fn(), releaseReservationInTransaction: vi.fn() };
	const manager = {
		findOneBy: vi.fn(async (entity: unknown, where: { userId: string }) => entity === MiRedPacket ? packet : claims.get(where.userId) ?? null),
		findOneByOrFail: vi.fn(async () => packet),
		findOne: vi.fn(async (entity: unknown, options: { where: { userId: string } }) => {
			if (entity === MiRedPacket) return packet;
			if (entity === MiChatRoom) return roomExists ? room : null;
			return members.has(options.where.userId) ? { userId: options.where.userId } : null;
		}),
		existsBy: vi.fn(async (entity: unknown, where: { userId: string } | { blockerId: string; blockeeId: string }[]) => {
			if (Array.isArray(where)) return entity === MiBlocking && where.some(({ blockerId, blockeeId }) => blocks.has(`${blockerId}/${blockeeId}`));
			if (entity === MiRedPacketClaim) return claims.has(where.userId);
			if (entity === MiRedPacketRecipient) return where.userId === 'recipient';
			return false;
		}),
		find: vi.fn(async () => [...claims.values()]),
		findBy: vi.fn(async () => [...users.values()]),
		insert: vi.fn(async (_entity: unknown, claim: MiRedPacketClaim) => {
			claims.set(claim.userId!, Object.assign(new MiRedPacketClaim(), claim, { user: users.get(claim.userId!) ?? null }));
		}),
		update: vi.fn(),
	};
	const recipientRepository = { find: vi.fn(async () => [{ redPacketId: packet.id, userId: 'recipient', user: users.get('recipient') ?? null }]) };
	const userEntityService = { packMany: vi.fn(async (values: MiUser[]) => values.map(user => ({ id: user.id, name: user.name, username: user.username }))) };
	const service = Object.create(RedPacketService.prototype) as RedPacketService;
	Object.assign(service, {
		db: {
			transaction: async (actionOrIsolation: ((em: EntityManager) => Promise<unknown>) | string, action?: (em: EntityManager) => Promise<unknown>) =>
				(typeof actionOrIsolation === 'function' ? actionOrIsolation : action!)(manager as unknown as EntityManager),
			getRepository: (entity: unknown) => {
				if (entity === MiRedPacketRecipient) return recipientRepository;
				if (entity === MiRedPacketClaim) return { findBy: async () => [...claims.values()] };
				return { findOneBy: async () => packet, findBy: async () => [packet] };
			},
		},
		walletService: wallets,
		userEntityService,
		idService: { gen: () => 'claim' },
	});
	return { service, packet, members, room, users, blocks, claims, manager, wallets, userEntityService, deleteRoom: () => { roomExists = false; packet.roomId = null; } };
}

function creationFixture() {
	const { service, members, users, manager: access, wallets } = fixture();
	const manager = {
		findOne: access.findOne,
		existsBy: access.existsBy,
		findBy: vi.fn(async () => [users.get('recipient')!]),
		findOneByOrFail: vi.fn(async () => users.get('sender')!),
		create: vi.fn((_entity: unknown, values: Partial<MiRedPacket>) => Object.assign(new MiRedPacket(), values)),
		insert: vi.fn(),
	};
	Object.assign(service, {
		db: {
			transaction: async (action: (em: EntityManager) => Promise<unknown>) => action(manager as unknown as EntityManager),
			getRepository: (entity: unknown) => {
				if (entity === MiUser) return { findOneBy: async () => users.get('sender')! };
				if (entity === MiRedPacketRecipient) return { find: async () => [{ redPacketId: 'packet', userId: 'recipient', user: users.get('recipient')! }] };
				return { findOneBy: async () => null };
			},
		},
		idService: { gen: () => 'packet' },
	});
	return { service, members, manager, wallets };
}

function draft(overrides: Partial<RedPacketDraft> = {}): RedPacketDraft {
	return { kind: 'direct', audience: 'room', roomId: 'room', recipientIds: ['recipient'], mode: 'equal', count: 1, totalCoins: 10, message: '', expiresInHours: 24, requestId: randomUUID(), ...overrides };
}

describe('群专属红包权限', () => {
	test('仅接受一名指定领取人，普通群红包和私聊红包保留原规则', () => {
		const { service } = fixture();
		expect(() => service.validateDraft(draft())).not.toThrow();
		expect(() => service.validateDraft(draft({ audience: 'recipients', roomId: undefined }))).not.toThrow();
		expect(() => service.validateDraft(draft({ kind: 'group', recipientIds: [] }))).not.toThrow();
		for (const invalid of [
			draft({ recipientIds: [] }), draft({ recipientIds: ['recipient', 'other'] }),
			draft({ count: 2 }), draft({ roomId: undefined }),
			draft({ kind: 'group' }), draft({ password: '口令', mode: 'random' }),
		]) expect(() => service.validateDraft(invalid)).toThrow(RedPacketService.InvalidDraftError);
	});

	test('创建群专属红包时保存指定成员并只扣款一次', async () => {
		const { service, manager, wallets } = creationFixture();
		await expect(service.create(draft(), { id: 'sender' })).resolves.toMatchObject({
			id: 'packet', kind: 'direct', audience: 'room', roomId: 'room', recipient: { id: 'recipient' }, totalCoins: 10, count: 1,
		});
		expect(manager.insert).toHaveBeenCalledWith(MiRedPacketRecipient, [{ redPacketId: 'packet', userId: 'recipient' }]);
		expect(wallets.changeBalanceInTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'sender', -10, expect.objectContaining({ type: 'redPacketSend' }));
	});

	test('不能创建指定非群成员的红包，也不扣款', async () => {
		const { service, members, manager, wallets } = creationFixture();
		members.delete('recipient');
		await expect(service.create(draft(), { id: 'sender' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(manager.insert).not.toHaveBeenCalledWith(MiRedPacketRecipient, expect.anything());
		expect(wallets.changeBalanceInTransaction).not.toHaveBeenCalled();
	});

	test('当前指定成员的详情允许领取，摘要不携带领取权限', async () => {
		const { service, wallets, manager } = fixture();
		await expect(service.show('packet', { id: 'recipient' })).resolves.toMatchObject({ canClaim: true, recipient: { id: 'recipient' }, claims: [] });
		expect(await service.packById('packet', { id: 'recipient' })).not.toHaveProperty('canClaim');
		expect(wallets.changeBalanceInTransaction).not.toHaveBeenCalled();
		expect(manager.insert).not.toHaveBeenCalled();
		expect(manager.update).not.toHaveBeenCalled();
	});

	test('其他群成员不能查看或领取，发送者只可查看', async () => {
		const { service, wallets, manager } = fixture();
		await expect(service.show('packet', { id: 'other' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await expect(service.show('packet', { id: 'sender' })).resolves.toMatchObject({ canClaim: false });
		await expect(service.claimWithContext('packet', { id: 'other' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await expect(service.claimWithContext('packet', { id: 'sender' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(wallets.changeBalanceInTransaction).not.toHaveBeenCalled();
		expect(manager.insert).not.toHaveBeenCalled();
	});

	test('知道已领红包 ID 也不能从详情或领取入口读取他人的领取记录', async () => {
		const { service, wallets, manager } = fixture();
		await service.claimWithContext('packet', { id: 'recipient' });
		await expect(service.show('packet', { id: 'other' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await expect(service.claim('packet', { id: 'other' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(manager.find).not.toHaveBeenCalled();
		await expect(service.show('packet', { id: 'sender' })).resolves.toMatchObject({ canClaim: false, claims: [{ coins: 10 }] });
		expect(wallets.changeBalanceInTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'recipient', 10, expect.objectContaining({ type: 'redPacketClaim' }));
		expect(manager.insert).toHaveBeenCalledOnce();
	});

	test('异常的历史领取记录不授予专属红包详情权限', async () => {
		const { service, claims, manager, wallets } = fixture();
		claims.set('other', Object.assign(new MiRedPacketClaim(), { userId: 'other', coins: 10 }));
		await expect(service.show('packet', { id: 'other' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await expect(service.claim('packet', { id: 'other' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(manager.find).not.toHaveBeenCalled();
		expect(wallets.changeBalanceInTransaction).not.toHaveBeenCalled();
	});

	test('指定领取人只到账一次，离群后的成功重试不重新结算', async () => {
		const { service, members, blocks, wallets, manager } = fixture();
		await expect(service.claimWithContext('packet', { id: 'recipient' })).resolves.toMatchObject({ coins: 10, created: true });
		members.delete('recipient');
		blocks.add('recipient/sender');
		await expect(service.claimWithContext('packet', { id: 'recipient' })).resolves.toMatchObject({ coins: 10, created: false });
		await expect(service.show('packet', { id: 'recipient' })).resolves.toMatchObject({ canClaim: false, claimedCoins: 10, claims: [{ coins: 10 }] });
		expect(wallets.changeBalanceInTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'recipient', 10, expect.objectContaining({ type: 'redPacketClaim' }));
		expect(manager.insert).toHaveBeenCalledOnce();
	});

	test('退群后保留原记录，但不能首次领取', async () => {
		const { service, members, wallets } = fixture();
		members.delete('recipient');
		await expect(service.show('packet', { id: 'recipient' })).resolves.toMatchObject({ canClaim: false, recipient: { id: 'recipient' } });
		await expect(service.claimWithContext('packet', { id: 'recipient' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(wallets.changeBalanceInTransaction).not.toHaveBeenCalled();
	});

	test('群归档后保留原记录，但详情不允许首次领取', async () => {
		const { service, room, wallets } = fixture();
		room.isArchived = true;
		await expect(service.show('packet', { id: 'recipient' })).resolves.toMatchObject({ canClaim: false });
		await expect(service.claimWithContext('packet', { id: 'recipient' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(wallets.changeBalanceInTransaction).not.toHaveBeenCalled();
	});

	test.each([['sender', 'recipient'], ['recipient', 'sender']])('%s 拉黑 %s 后可查看历史，但不能首次领取', async (blockerId, blockeeId) => {
		const { service, blocks, wallets } = fixture();
		blocks.add(`${blockerId}/${blockeeId}`);
		await expect(service.show('packet', { id: 'recipient' })).resolves.toMatchObject({ canClaim: false });
		await expect(service.claimWithContext('packet', { id: 'recipient' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(wallets.changeBalanceInTransaction).not.toHaveBeenCalled();
	});

	test('发送者或领取人账号不可用时，详情不允许首次领取', async () => {
		for (const [userId, changes] of [
			['sender', { isSuspended: true }], ['sender', { isDeleted: true }],
			['recipient', { isSuspended: true }], ['recipient', { movedToUri: 'https://example.com/users/recipient' }],
			['recipient', { host: 'example.com' }],
		] as const) {
			const { service, users, wallets } = fixture();
			Object.assign(users.get(userId)!, changes);
			await expect(service.show('packet', { id: 'recipient' })).resolves.toMatchObject({ canClaim: false });
			expect(wallets.changeBalanceInTransaction).not.toHaveBeenCalled();
		}
	});

	test('指定账号注销后摘要和详情均返回空领取人，不再打包已注销账号', async () => {
		const { service, users, userEntityService } = fixture();
		users.get('recipient')!.isDeleted = true;
		await expect(service.packById('packet', { id: 'sender' })).resolves.toMatchObject({ recipient: null });
		await expect(service.show('packet', { id: 'recipient' })).resolves.toMatchObject({ recipient: null, canClaim: false });
		expect(userEntityService.packMany.mock.calls.every(([values]) => values.every(user => !user.isDeleted))).toBe(true);
	});

	test('已结束、未开始或无剩余份额的详情不允许领取', async () => {
		for (const changes of [
			{ status: 'cancelled' }, { status: 'exhausted' }, { expiresAt: new Date(Date.now() - 1000) },
			{ startsAt: new Date(Date.now() + 86400000) }, { remainingCount: 0 }, { remainingCoins: 0 },
		] as const) {
			const { service, packet } = fixture();
			Object.assign(packet, changes);
			await expect(service.show('packet', { id: 'recipient' })).resolves.toMatchObject({ canClaim: false });
		}
	});

	test('普通群红包和私聊红包详情不新增领取权限字段', async () => {
		for (const [changes, viewerId] of [[{ kind: 'group' }, 'other'], [{ audience: 'recipients', roomId: null }, 'recipient']] as const) {
			const { service, packet } = fixture();
			Object.assign(packet, changes);
			const details = await service.show('packet', { id: viewerId });
			expect(details).not.toHaveProperty('canClaim');
			expect(details).not.toHaveProperty('recipient');
		}
	});

	test('专属红包只能发到原群，删群后不会变成私聊红包', async () => {
		const { service, deleteRoom, wallets } = fixture();
		await expect(service.assertCanReference('packet', 'sender', 'room')).resolves.toMatchObject({ audience: 'room' });
		await expect(service.assertCanReference('packet', 'sender', 'other-room')).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await expect(service.assertCanReference('packet', 'sender')).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		deleteRoom();
		await expect(service.show('packet', { id: 'recipient' })).resolves.toMatchObject({ canClaim: false, roomId: null });
		await expect(service.claimWithContext('packet', { id: 'recipient' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await expect(service.claimWithContext('packet', { id: 'other' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		await expect(service.assertCanReference('packet', 'sender', 'room')).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(wallets.changeBalanceInTransaction).not.toHaveBeenCalled();
	});
});
