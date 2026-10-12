/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import { ChatService, ChatMessageAccessError, ChatSendDeniedError } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { MiChatMessage, MiChatRoom, MiChatRoomMembership, MiUser } from '@/models/_.js';

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
		eval: vi.fn(async (_script: string, _count: number, latest: string, first: string, _cursor: string, _set: string, id: string) => {
			cache.set(latest, id);
			if (!cache.has(first)) cache.set(first, id);
			return 1;
		}),
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
	const chatRedPacketService = { claimPasswordsForMessage: vi.fn().mockResolvedValue([]) };
	const room = { id: 'room', ownerId: 'bob' } as MiChatRoom;
	let nextId = 0;
	const service: ChatService = Object.setPrototypeOf({
		chatConversationService: {
			mode: vi.fn().mockResolvedValue('all'), restoreOnMessage: vi.fn().mockResolvedValue(undefined),
			roomSettings: vi.fn().mockResolvedValue([]), effectiveMode: (setting: { notificationMode?: string } | null) => setting?.notificationMode ?? 'all',
			clearMarked: vi.fn().mockResolvedValue(false), hasMarked: vi.fn().mockResolvedValue(false), marked: vi.fn().mockResolvedValue(new Set()),
		},
		usersRepository, chatApprovalsRepository, chatMessagesRepository, redisClient, chatEntityService,
		insertRoomMessage: (message: Partial<MiChatMessage>) => chatMessagesRepository.insertOne(message),
		globalEventService: events, pushNotificationService: push, logger, roleService, chatRedPacketService,
		idService: { gen: () => `message${++nextId}` },
		userEntityService: { isLocalUser: (user: MiUser) => user.host == null },
		userBlockingService: { checkBlocked: vi.fn(async (blocker: string, blockee: string) => blocks.has(`${blocker}:${blockee}`)) },
		userFollowingService: { isFollowing: vi.fn().mockResolvedValue(false), isMutual: vi.fn().mockResolvedValue(false) },
		chatRoomMembershipsRepository: { findBy: vi.fn().mockResolvedValue([{ userId: 'alice', isMuted: false }, { userId: 'charlie', isMuted: false }]) },
		chatRoomsRepository: { findOneBy: vi.fn(async () => room) },
		getRoomRecipientIds: vi.fn(async () => new Set(['alice', 'bob', 'charlie'])),
	}, ChatService.prototype);
	return { service, users, usersRepository, approvals, chatApprovalsRepository, chatMessagesRepository, messages, redisClient, events, push, logger, blocks, roleService, chatRedPacketService, room };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('chat status automatic replies', () => {
	test('self chat stores and broadcasts once without unread markers or automatic replies', async () => {
		const fixture = createFixture();
		fixture.users.alice.chatScope = 'none';
		fixture.users.alice.onlineStatusOverride = 'away';
		fixture.users.alice.onlineStatusAutoReplies = { away: 'Away' };
		const result = await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.alice, { text: 'personal note' });
		expect(result).toMatchObject({ fromUserId: 'alice', toUserId: 'alice', text: 'personal note' });
		expect(fixture.messages).toHaveLength(1);
		expect(fixture.events.publishChatUserStream).toHaveBeenCalledTimes(1);
		expect(fixture.redisClient.eval).not.toHaveBeenCalled();
		expect(fixture.approvals).toEqual([]);
		expect(fixture.push.pushNotification).not.toHaveBeenCalled();
	});

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

	test('口令红包服务失败时仍成功返回已保存的消息', async () => {
		const fixture = createFixture();
		fixture.chatRedPacketService.claimPasswordsForMessage.mockRejectedValue(new Error('Packet database unavailable'));
		await expect(fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: '芝麻开门', allowPasswordClaim: true })).resolves.toMatchObject({ text: '芝麻开门' });
		expect(fixture.messages).toHaveLength(1);
		expect(fixture.events.publishChatUserStream).toHaveBeenCalledWith('bob', 'alice', 'message', expect.objectContaining({ text: '芝麻开门' }));
		expect(fixture.logger.warn).toHaveBeenCalledOnce();
	});
});

describe('chat send denials', () => {
	test.each([
		{ setup: (f: ReturnType<typeof createFixture>) => { f.users.bob.chatScope = 'mutual'; }, reason: 'scope' },
		{ setup: (f: ReturnType<typeof createFixture>) => { f.roleService.getUserPolicies.mockResolvedValue({ chatAvailability: 'readonly' }); }, reason: 'unavailable' },
		{ setup: (f: ReturnType<typeof createFixture>) => { f.blocks.add('bob:alice'); }, reason: 'blocked' },
	])('reports $reason so the API can return a specific error', async ({ setup, reason }) => {
		const fixture = createFixture();
		setup(fixture);
		const error = await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'hello' }).catch(e => e);
		expect(error).toBeInstanceOf(ChatSendDeniedError);
		expect(error.reason).toBe(reason);
		expect(fixture.messages).toHaveLength(0);
	});

	test('reports notMember for rooms the sender has left', async () => {
		const fixture = createFixture();
		fixture.room.ownerId = 'charlie';
		const error = await fixture.service.createMessageToRoom(fixture.users.bob, { id: 'room', ownerId: 'charlie' } as MiChatRoom, { text: 'hello' }).catch(e => e);
		expect(error).toBeInstanceOf(ChatSendDeniedError);
		expect(error.reason).toBe('notMember');
	});
});

describe('do not disturb chat notifications', () => {
	test('delayed notification failures are logged without rejecting an already saved message', async () => {
		const fixture = createFixture();
		await fixture.service.createMessageToRoom(fixture.users.alice, fixture.room, { text: 'saved message' });
		vi.spyOn(fixture.service as never as { getRoomParticipants: () => Promise<unknown> }, 'getRoomParticipants').mockRejectedValue(new Error('database closed'));
		await vi.advanceTimersByTimeAsync(3000);
		expect(fixture.messages).toHaveLength(1);
		expect(fixture.logger.warn).toHaveBeenCalledWith('Could not deliver delayed chat notification.');
		expect(fixture.push.pushNotification).not.toHaveBeenCalled();
	});

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
		expect(fixture.events.publishMainStream.mock.calls.filter(([, type]) => type === 'newChatMessage')).toHaveLength(2);
		expect(fixture.push.pushNotification).toHaveBeenCalledOnce();
		expect(fixture.push.pushNotification).toHaveBeenCalledWith('charlie', 'newChatMessage', expect.anything());
	});

	test.each(['all', 'silent', 'assistant', 'blocked'] as const)('private conversation mode %s gates notifications separately from unread tracking', async mode => {
		const fixture = createFixture();
		const settings = Reflect.get(fixture.service, 'chatConversationService');
		settings.mode.mockResolvedValue(mode);
		await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'settings test' });
		await vi.advanceTimersByTimeAsync(3000);
		expect(fixture.redisClient.eval).toHaveBeenCalledTimes(mode === 'blocked' ? 0 : 1);
		expect(fixture.events.publishChatUserStream).toHaveBeenCalledTimes(mode === 'blocked' ? 1 : 2);
		expect(fixture.events.publishMainStream.mock.calls.filter(([, type]) => type === 'newChatMessage')).toHaveLength(mode === 'all' ? 1 : 0);
		expect(fixture.push.pushNotification).toHaveBeenCalledTimes(mode === 'all' ? 1 : 0);
	});

	test('ending private quiet mode does not deliver delayed notifications for its old messages', async () => {
		const fixture = createFixture();
		const settings = Reflect.get(fixture.service, 'chatConversationService');
		settings.mode.mockResolvedValue('silent');
		await fixture.service.createMessageToUser(fixture.users.alice, fixture.users.bob, { text: 'quiet message' });
		settings.mode.mockResolvedValue('all');
		await vi.advanceTimersByTimeAsync(3000);
		expect(fixture.push.pushNotification).not.toHaveBeenCalled();
	});

	test('群主在消息发出后静音会取消延迟通知，其他成员仍收到通知', async () => {
		const fixture = createFixture();
		await fixture.service.createMessageToRoom(fixture.users.alice, fixture.room, { text: 'hello room' });
		fixture.room.ownerIsMuted = true;
		fixture.room.ownerMutedUntil = new Date(Date.now() + 60000);
		await vi.advanceTimersByTimeAsync(3000);
		expect(fixture.events.publishMainStream.mock.calls.filter(([, type]) => type === 'newChatMessage')).toHaveLength(1);
		expect(fixture.push.pushNotification).toHaveBeenCalledExactlyOnceWith('charlie', 'newChatMessage', expect.anything());
	});
});

describe('聊天列表实时更新', () => {
	test.each([false, true])('创建、编辑、撤回只通知会话参与者刷新预览，群聊=%s', async group => {
		const fixture = createFixture();
		const { service, users, messages, events } = fixture;
		const created = group
			? await service.createMessageToRoom(users.alice, fixture.room, { text: 'original' })
			: await service.createMessageToUser(users.alice, users.bob, { text: 'original' });
		const expectedRecipients = group ? ['alice', 'bob', 'charlie'] : ['alice', 'bob'];
		const checkEvents = (deleted: boolean) => {
			const updates = events.publishMainStream.mock.calls.filter(([, type]) => type === 'chatHistoryUpdated');
			expect(updates.map(([userId]) => userId).sort()).toEqual(expectedRecipients);
			for (const [userId, , payload] of updates) expect(payload).toEqual({
				messageId: created.id, deleted, ...(group ? { roomId: 'room' } : { userId: userId === 'alice' ? 'bob' : 'alice' }),
			});
			events.publishMainStream.mockClear();
		};
		checkEvents(false);
		const manager = {
			findOne: vi.fn(async (entity: unknown) => entity === MiChatRoom ? fixture.room : messages[0]),
			update: vi.fn(async (_entity: unknown, _id: string, data: Partial<MiChatMessage>) => Object.assign(messages[0], data)),
			delete: vi.fn(async () => { messages.splice(0); }),
		};
		Object.assign(fixture.chatMessagesRepository, { manager: { transaction: (callback: (value: typeof manager) => Promise<unknown>) => callback(manager) } });
		Object.assign(fixture.usersRepository, { findOneByOrFail: ({ id }: { id: string }) => fixture.usersRepository.findOneBy({ id }) });
		Reflect.set(service, 'assertRoomWriteAccess', vi.fn());
		Reflect.get(service, 'userEntityService').isRemoteUser = () => false;
		const message = messages[0];
		await service.editMessage(message, 'edited');
		expect(message.text).toBe('edited');
		checkEvents(false);
		await service.deleteMessage(message);
		expect(messages).toEqual([]);
		checkEvents(true);
		expect(fixture.push.pushNotification).not.toHaveBeenCalled();
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

describe('聊天回应持久化与并发', () => {
	let db: DataSource;
	let service: ChatService;
	let serial = 0;
	const senderId = 'reactionalice';
	const ownerId = 'reactionbob';
	const memberId = 'reactioncharlie';
	const outsiderId = 'reactiondave';
	const roomId = 'reactionroom';
	const events = { publishChatUserStream: vi.fn(), publishChatRoomStream: vi.fn() };
	const emojiNames = Array.from({ length: 110 }, (_, index) => `reaction${index}`);

	async function createMessage(reactions: string[] = [], direct = false) {
		const message = {
			id: `reactionmessage${++serial}`, fromUserId: senderId, toUserId: direct ? ownerId : null,
			toRoomId: direct ? null : roomId, text: 'hello', reactions,
		};
		await db.getRepository(MiChatMessage).insert(message);
		return message;
	}

	async function getReactions(messageId: string) {
		return (await db.getRepository(MiChatMessage).findOneByOrFail({ id: messageId })).reactions;
	}

	beforeAll(async () => {
		db = await initTestDb();
		await db.getRepository(MiUser).insert([senderId, ownerId, memberId, outsiderId].map(id => ({ id, username: id, usernameLower: id })));
		await db.getRepository(MiChatRoom).insert({ id: roomId, ownerId, name: 'Reactions' });
		await db.getRepository(MiChatRoomMembership).insert({ id: 'reactionmembership', roomId, userId: memberId });
		service = Object.setPrototypeOf({
			chatMessagesRepository: db.getRepository(MiChatMessage),
			chatRoomsRepository: db.getRepository(MiChatRoom),
			chatRoomMembershipsRepository: db.getRepository(MiChatRoomMembership),
			customEmojiService: { localEmojisCache: { fetch: async () => new Map(emojiNames.map(name => [name, { name }])) } },
			userEntityService: { pack: async (id: string) => ({ id }) },
			globalEventService: events,
		}, ChatService.prototype);
	});
	beforeEach(() => {
		vi.useRealTimers();
		events.publishChatUserStream.mockClear();
		events.publishChatRoomStream.mockClear();
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('同一人可添加 100 种回应，其他人的相同回应只增加人数，最后一人撤回才释放占位', async () => {
		const message = await createMessage();
		for (const name of emojiNames.slice(0, 100)) await service.react(message.id, ownerId, `:${name}:`);
		for (const name of emojiNames.slice(0, 3)) await service.react(message.id, memberId, `:${name}:`);
		expect(await getReactions(message.id)).toHaveLength(103);
		await expect(service.react(message.id, memberId, ':reaction100:')).rejects.toThrow('too many reactions');

		await service.unreact(message.id, ownerId, ':reaction0:');
		await expect(service.react(message.id, ownerId, ':reaction100:')).rejects.toThrow('too many reactions');
		await service.unreact(message.id, memberId, ':reaction0:');
		await service.react(message.id, ownerId, ':reaction100:');
		const reactions = await getReactions(message.id);
		expect(reactions).toHaveLength(102);
		expect(new Set(reactions.map(record => record.split('/')[1])).size).toBe(100);
		expect(reactions).toContain(`${ownerId}/:reaction100:`);
	});

	test('并发争抢最后一个占位时只接受一种新回应', async () => {
		const message = await createMessage(emojiNames.slice(0, 99).map(name => `${ownerId}/:${name}:`));
		const results = await Promise.allSettled(emojiNames.slice(99, 107).map(name => service.react(message.id, ownerId, `:${name}:`)));
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter(result => result.status === 'rejected').map(result => result.reason.message)).toEqual(Array(7).fill('too many reactions'));
		expect(await getReactions(message.id)).toHaveLength(100);
		expect(events.publishChatRoomStream).toHaveBeenCalledOnce();
	});

	test('同一人重复添加同一表情只生效一次，撤回时清除该表情', async () => {
		const message = await createMessage([], true);
		const variants = ['❤', '❤️', '❤', '❤️'];
		await Promise.all(variants.map(reaction => service.react(message.id, ownerId, reaction)));
		expect(await getReactions(message.id)).toEqual([`${ownerId}/❤`]);
		expect(events.publishChatUserStream).toHaveBeenCalledTimes(2);
		events.publishChatUserStream.mockClear();

		await Promise.all(variants.map(reaction => service.unreact(message.id, ownerId, reaction)));
		expect(await getReactions(message.id)).toEqual([]);
		expect(events.publishChatUserStream).toHaveBeenCalledTimes(2);
		events.publishChatUserStream.mockClear();
		await service.unreact(message.id, ownerId, '❤');
		expect(events.publishChatUserStream).not.toHaveBeenCalled();
	});

	test('仍拒绝回应自己的消息或操作无权访问的私聊与聊天室消息', async () => {
		const directMessage = await createMessage([], true);
		const roomMessage = await createMessage();
		await expect(service.react(directMessage.id, senderId, '❤')).rejects.toBeInstanceOf(ChatMessageAccessError);
		await expect(service.react(directMessage.id, outsiderId, '❤')).rejects.toBeInstanceOf(ChatMessageAccessError);
		await expect(service.unreact(directMessage.id, outsiderId, '❤')).rejects.toBeInstanceOf(ChatMessageAccessError);
		await expect(service.react(roomMessage.id, outsiderId, '❤')).rejects.toBeInstanceOf(ChatMessageAccessError);
		await expect(service.unreact(roomMessage.id, outsiderId, '❤')).rejects.toBeInstanceOf(ChatMessageAccessError);
		expect(await getReactions(directMessage.id)).toEqual([]);
		expect(await getReactions(roomMessage.id)).toEqual([]);
		expect(events.publishChatUserStream).not.toHaveBeenCalled();
		expect(events.publishChatRoomStream).not.toHaveBeenCalled();
	});
});
