/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import type { MiChatMessage, MiChatRoom, MiUser } from '@/models/_.js';

function createFixture() {
	function makeUser(id: string) {
		return {
			id, host: null, hideOnlineStatus: false, onlineStatusOverride: 'online', onlineStatusAutoReplies: {},
			chatScope: 'everyone', isSuspended: false, isDeleted: false, movedToUri: null,
			lastActiveDate: new Date(0),
		} as unknown as MiUser;
	}

	const users = { alice: makeUser('alice'), bob: makeUser('bob'), charlie: makeUser('charlie') };
	const userList = Object.values(users);
	const usersRepository = {
		findOneBy: vi.fn(async ({ id }: { id: string }) => {
			const user = userList.find(user => user.id === id);
			return user ? { ...user } : null;
		}),
		find: vi.fn(async () => userList.filter(user => user.onlineStatusOverride === 'doNotDisturb')),
	};
	const approvals: { id: string; userId: string; otherId: string }[] = [];
	const chatApprovalsRepository = {
		createQueryBuilder: vi.fn(() => {
			let pending: typeof approvals[number] | undefined;
			let ignoreConflicts = false;
			const query = {
				where: vi.fn().mockReturnThis(), orWhere: vi.fn().mockReturnThis(), take: vi.fn().mockReturnThis(),
				getMany: vi.fn(async () => [...approvals]),
				insert: vi.fn().mockReturnThis(),
				values: vi.fn((approval: typeof approvals[number]) => {
					pending = approval;
					return query;
				}),
				orIgnore: vi.fn(() => {
					ignoreConflicts = true;
					return query;
				}),
				execute: vi.fn(async () => {
					const approvalToInsert = pending;
					if (!approvalToInsert) throw new Error('No approval to insert');
					if (approvals.some(approval => approval.userId === approvalToInsert.userId && approval.otherId === approvalToInsert.otherId)) {
						if (!ignoreConflicts) throw new Error('duplicate key value violates unique constraint');
						return;
					}
					approvals.push(approvalToInsert);
				}),
			};
			return query;
		}),
	};
	const messages: MiChatMessage[] = [];
	const chatMessagesRepository = {
		insertOne: vi.fn(async (data: Partial<MiChatMessage>) => {
			const message = { toUserId: null, toRoomId: null, isAutoReply: false, reactions: [], ...data } as MiChatMessage;
			messages.push(message);
			return message;
		}),
	};
	const cache = new Map<string, string>();
	const redisClient = {
		get: vi.fn(async (key: string) => cache.get(key) ?? null),
		pipeline: vi.fn(() => {
			const commands: (() => unknown)[] = [];
			const pipeline = {
				set: vi.fn((key: string, value: string) => {
					commands.push(() => cache.set(key, value));
					return pipeline;
				}),
				sadd: vi.fn().mockReturnThis(),
				get: vi.fn((key: string) => {
					commands.push(() => cache.get(key) ?? null);
					return pipeline;
				}),
				exec: vi.fn(async () => commands.map(command => [null, command()])),
			};
			return pipeline;
		}),
	};
	const chatEntityService = {
		packMessageLiteFor1on1: vi.fn(async (message: MiChatMessage) => ({ ...message })),
		packMessageLiteForRoom: vi.fn(async (message: MiChatMessage) => ({ ...message })),
		packMessageDetailed: vi.fn(async (message: MiChatMessage) => ({ ...message })),
	};
	const events = { publishChatUserStream: vi.fn(), publishChatRoomStream: vi.fn(), publishMainStream: vi.fn() };
	const push = { pushNotification: vi.fn() };
	const logger = { warn: vi.fn() };
	const blocks = new Set<string>();
	const roleService = { getUserPolicies: vi.fn(async (_id: string): Promise<{ chatAvailability: string }> => ({ chatAvailability: 'available' })) };
	let nextId = 0;
	const service: ChatService = Object.setPrototypeOf({
		usersRepository, chatApprovalsRepository, chatMessagesRepository, redisClient, chatEntityService,
		globalEventService: events, pushNotificationService: push, logger, roleService,
		idService: { gen: () => `message${++nextId}` },
		userEntityService: { isLocalUser: (user: MiUser) => user.host == null },
		userBlockingService: { checkBlocked: vi.fn(async (blocker: string, blockee: string) => blocks.has(`${blocker}:${blockee}`)) },
		userFollowingService: { isFollowing: vi.fn().mockResolvedValue(false), isMutual: vi.fn().mockResolvedValue(false) },
		chatRoomMembershipsRepository: { findBy: vi.fn().mockResolvedValue([{ userId: 'alice', isMuted: false }, { userId: 'charlie', isMuted: false }]) },
	}, ChatService.prototype);
	return { service, users, usersRepository, approvals, chatApprovalsRepository, chatMessagesRepository, messages, redisClient, events, push, logger, blocks, roleService };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('chat status automatic replies', () => {
	test.each(['away', 'busy', 'doNotDisturb'] as const)('replies once from saved %s settings even after client activity expires', async status => {
		const fixture = createFixture();
		fixture.users.bob.onlineStatusOverride = status;
		fixture.users.bob.onlineStatusAutoReplies = { [status]: '稍后联系。' };
		fixture.users.alice.chatScope = 'none';
		const result = await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' });
		expect(result).toMatchObject({ fromUserId: 'alice', toUserId: 'bob', isAutoReply: false });
		expect(fixture.messages).toHaveLength(2);
		expect(fixture.messages[1]).toMatchObject({ fromUserId: 'bob', toUserId: 'alice', text: '稍后联系。', isAutoReply: true });
		expect(fixture.approvals).toEqual([{ id: expect.any(String), userId: 'alice', otherId: 'bob' }]);
	});

	test('does not recursively answer another automatic reply', async () => {
		const fixture = createFixture();
		for (const user of [fixture.users.alice, fixture.users.bob]) {
			user.onlineStatusOverride = 'away';
			user.onlineStatusAutoReplies = { away: 'Away' };
		}
		await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' });
		expect(fixture.messages).toHaveLength(2);
	});

	test.each([
		{ hideOnlineStatus: true }, { onlineStatusOverride: 'online' }, { onlineStatusOverride: 'invisible' }, { onlineStatusAutoReplies: {} },
		{ onlineStatusAutoReplies: { away: null } }, { isSuspended: true }, { isDeleted: true },
		{ host: 'remote.test' }, { movedToUri: 'https://remote.test/users/bob' },
	] satisfies Partial<MiUser>[])('suppresses replies for %j', async changes => {
		const fixture = createFixture();
		Object.assign(fixture.users.bob, { onlineStatusOverride: 'away', onlineStatusAutoReplies: { away: 'Away' } }, changes);
		await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' });
		expect(fixture.messages).toHaveLength(1);
	});

	test.each([{ hideOnlineStatus: true }, { onlineStatusOverride: 'invisible' }] satisfies Partial<MiUser>[])('checks current visibility after receiving a message with stale recipient data (%j)', async changes => {
		const fixture = createFixture();
		fixture.users.bob.onlineStatusOverride = 'away';
		fixture.users.bob.onlineStatusAutoReplies = { away: 'Away' };
		const staleRecipient = { ...fixture.users.bob };
		Object.assign(fixture.users.bob, changes);
		await fixture.service.createMessageToUser(fixture.users.alice, staleRecipient, { text: 'hello' });
		expect(fixture.messages).toHaveLength(1);
	});

	test('replies to every concurrent and consecutive private message without an interval', async () => {
		const fixture = createFixture();
		fixture.users.bob.onlineStatusOverride = 'away';
		fixture.users.bob.onlineStatusAutoReplies = { away: 'Away', busy: 'Busy' };
		await Promise.all([1, 2].map(() => fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' })));
		expect(fixture.approvals.filter(approval => approval.userId === 'alice' && approval.otherId === 'bob')).toHaveLength(1);
		expect(fixture.messages.filter(message => !message.isAutoReply)).toHaveLength(2);
		expect(fixture.messages.filter(message => message.isAutoReply)).toHaveLength(2);
		fixture.users.bob.onlineStatusOverride = 'busy';
		await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'again' });
		expect(fixture.messages.filter(message => message.isAutoReply)).toHaveLength(3);
		await fixture.service.createMessageToUser(fixture.users.charlie, fixture.users.bob, { text: 'hello' });
		expect(fixture.messages.filter(message => message.isAutoReply)).toHaveLength(4);
	});

	test('respects blocking in the automatic reply direction without failing the saved incoming message', async () => {
		const fixture = createFixture();
		fixture.users.bob.onlineStatusOverride = 'away';
		fixture.users.bob.onlineStatusAutoReplies = { away: 'Away' };
		fixture.blocks.add('alice:bob');
		await expect(fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' })).resolves.toMatchObject({ text: 'hello' });
		expect(fixture.messages).toHaveLength(1);
		expect(fixture.approvals.every(approval => approval.userId !== 'bob')).toBe(true);
	});

	test('rechecks the automatic sender role after accepting the incoming message', async () => {
		const fixture = createFixture();
		fixture.users.bob.onlineStatusOverride = 'away';
		fixture.users.bob.onlineStatusAutoReplies = { away: 'Away' };
		fixture.roleService.getUserPolicies.mockResolvedValueOnce({ chatAvailability: 'available' }).mockResolvedValue({ chatAvailability: 'readonly' });
		await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' });
		expect(fixture.messages).toHaveLength(1);
	});

	test('does not fail or retry the original message when the automatic reply fails', async () => {
		const fixture = createFixture();
		fixture.users.bob.onlineStatusOverride = 'away';
		fixture.users.bob.onlineStatusAutoReplies = { away: 'Away' };
		fixture.usersRepository.findOneBy.mockRejectedValueOnce(new Error('User lookup unavailable'));
		await expect(fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' })).resolves.toMatchObject({ text: 'hello' });
		expect(fixture.messages).toHaveLength(1);
		expect(fixture.logger.warn).toHaveBeenCalledOnce();
	});

	test('keeps the original message delivered when saving the automatic reply fails', async () => {
		const fixture = createFixture();
		fixture.users.bob.onlineStatusOverride = 'away';
		fixture.users.bob.onlineStatusAutoReplies = { away: 'Away' };
		const insertMessage = fixture.chatMessagesRepository.insertOne.getMockImplementation()!;
		fixture.chatMessagesRepository.insertOne.mockImplementation(async message => {
			if (message.isAutoReply) throw new Error('Automatic reply could not be saved');
			return insertMessage(message);
		});
		await expect(fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' })).resolves.toMatchObject({ text: 'hello', isAutoReply: false });
		expect(fixture.messages).toHaveLength(1);
		expect(fixture.events.publishChatUserStream).toHaveBeenCalledWith('bob', 'alice', 'message', expect.objectContaining({ text: 'hello' }));
		expect(fixture.logger.warn).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(3000);
		expect(fixture.events.publishMainStream).toHaveBeenCalledWith('bob', 'newChatMessage', expect.objectContaining({ text: 'hello' }));
	});
});

describe('do not disturb chat notifications', () => {
	test.each(['online', 'doNotDisturb'] as const)('checks the latest %s status while preserving direct unread events', async latestStatus => {
		const fixture = createFixture();
		fixture.users.bob.onlineStatusOverride = latestStatus === 'online' ? 'doNotDisturb' : 'online';
		await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' });
		fixture.users.bob.onlineStatusOverride = latestStatus;
		await vi.advanceTimersByTimeAsync(3000);
		expect(fixture.events.publishMainStream).toHaveBeenCalledWith('bob', 'newChatMessage', expect.objectContaining({ text: 'hello' }));
		expect(fixture.push.pushNotification).toHaveBeenCalledTimes(latestStatus === 'online' ? 1 : 0);
	});

	test('keeps room unread events and only pushes to members who are not in do not disturb', async () => {
		const fixture = createFixture();
		fixture.users.bob.onlineStatusOverride = 'doNotDisturb';
		fixture.users.bob.onlineStatusAutoReplies = { doNotDisturb: 'Do not disturb' };
		await fixture.service.createMessageToRoom(fixture.users.alice, { id: 'room', ownerId: 'bob' } as MiChatRoom, { text: 'hello room' });
		await vi.advanceTimersByTimeAsync(3000);
		expect(fixture.messages).toHaveLength(1);
		expect(fixture.events.publishMainStream).toHaveBeenCalledTimes(2);
		expect(fixture.push.pushNotification).toHaveBeenCalledOnce();
		expect(fixture.push.pushNotification).toHaveBeenCalledWith('charlie', 'newChatMessage', expect.anything());
	});
});

describe('chat automatic reply packing', () => {
	test.each([false, true])('preserves isAutoReply=%s in direct history and detailed messages', async isAutoReply => {
		const service: ChatEntityService = Object.setPrototypeOf({
			idService: { parse: () => ({ date: new Date() }) },
			userEntityService: { pack: vi.fn(async (id: string) => ({ id })) },
		}, ChatEntityService.prototype);
		const message = {
			id: 'message', fromUserId: 'alice', toUserId: 'bob', toRoomId: null,
			text: 'hello', fileId: null, reactions: [], isAutoReply,
		} as unknown as MiChatMessage;
		expect(await service.packMessageLiteFor1on1(message)).toMatchObject({ isAutoReply });
		expect(await service.packMessageDetailed(message)).toMatchObject({ isAutoReply });
	});
});
