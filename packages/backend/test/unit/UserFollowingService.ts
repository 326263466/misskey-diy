/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { FollowingsRepository, FollowRequestsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

function createService({ followerHost = null, followeeHost = null, delayCounts = false }: {
	followerHost?: string | null;
	followeeHost?: string | null;
	delayCounts?: boolean;
} = {}) {
	const follower = { id: 'follower', host: followerHost, movedToUri: null, followingCount: 2, followersCount: 3, notesCount: 4 } as MiUser;
	const followee = { ...follower, id: 'followee', host: followeeHost } as MiUser;
	const users = new Map([follower, followee].map(user => [user.id, { ...user }]));
	const countGates = [deferred(), deferred()];
	const countsStarted = deferred();
	let countCalls = 0;

	async function updateCount({ id }: { id: string }, key: 'followingCount' | 'followersCount', value: number) {
		const gate = countGates[countCalls++];
		if (countCalls === 2) countsStarted.resolve();
		if (delayCounts) await gate.promise;
		users.get(id)![key] += value;
	}

	const usersRepository = {
		findOneByOrFail: vi.fn(async ({ id }: { id: string }) => ({ ...users.get(id)! })),
		increment: vi.fn(updateCount),
		decrement: vi.fn((where: { id: string }, key: 'followingCount' | 'followersCount', value: number) => updateCount(where, key, -value)),
	};
	const following = { id: 'following', follower, followee };
	const followingsRepository = {
		exists: vi.fn().mockResolvedValue(false),
		insert: vi.fn().mockResolvedValue({}),
		findOne: vi.fn().mockResolvedValue(following),
		delete: vi.fn().mockResolvedValue({ affected: 1 }),
	};
	const followRequestsRepository = {
		exists: vi.fn().mockResolvedValue(false),
		delete: vi.fn().mockResolvedValue({ affected: 0 }),
		insertOne: vi.fn().mockResolvedValue({ id: 'request' }),
		findOneBy: vi.fn().mockResolvedValue({ id: 'request' }),
	};
	const userEntityService = {
		isLocalUser: (user: MiUser) => user.host === null,
		isRemoteUser: (user: MiUser) => user.host !== null,
		pack: vi.fn(async (id: string, _me: MiUser, _options?: { schema: string }) => ({ ...users.get(id)! })),
	};
	const events = { publishMainStream: vi.fn(), publishInternalEvent: vi.fn(), publishUserStats: vi.fn() };
	const blocking = { checkBlocked: vi.fn().mockResolvedValue(false) };
	const service = new UserFollowingService(
		{ get: () => blocking } as never,
		{} as never,
		{ enableStatsForFederatedInstances: false } as never,
		usersRepository as never,
		{ findOneByOrFail: vi.fn().mockResolvedValue({}) } as never,
		followingsRepository as never,
		followRequestsRepository as never,
		{} as never,
		{ userFollowingsCache: { refresh: vi.fn() }, userProfileCache: { fetch: vi.fn().mockResolvedValue({}) } } as never,
		{ isSilencedHost: () => false } as never,
		userEntityService as never,
		{ gen: () => 'following', parse: () => ({ date: new Date(0) }) } as never,
		{ deliver: vi.fn() } as never,
		events as never,
		{ createNotification: vi.fn() } as never,
		{} as never,
		{ enqueueUserWebhook: vi.fn() } as never,
		{ addContext: vi.fn(), renderAccept: vi.fn(), renderFollow: vi.fn(), renderUndo: vi.fn(), renderReject: vi.fn() } as never,
		{} as never,
		{ update: vi.fn() } as never,
		{} as never,
	);
	service.onModuleInit();
	return { service, follower, followee, users, usersRepository, followRequestsRepository, userEntityService, events, countGates, countsStarted };
}

describe('UserFollowingService count synchronization', () => {
	test.each(['create', 'cancel', 'reject'] as const)('invalidates pending relationships after the %s request write without changing counts', async action => {
		const fixture = createService();
		const writeStarted = deferred();
		const writeGate = deferred();
		const write = vi.fn(async () => {
			writeStarted.resolve();
			await writeGate.promise;
			return { id: 'request', affected: 1 };
		});
		if (action === 'create') fixture.followRequestsRepository.insertOne.mockImplementationOnce(write);
		else fixture.followRequestsRepository.delete.mockImplementationOnce(write);
		fixture.followRequestsRepository.exists.mockResolvedValue(true);
		const pending = action === 'create'
			? fixture.service.createFollowRequest(fixture.follower, fixture.followee)
			: action === 'cancel'
				? fixture.service.cancelFollowRequest(fixture.followee, fixture.follower)
				: fixture.service.rejectFollowRequest(fixture.followee as MiLocalUser, fixture.follower as MiLocalUser);
		await writeStarted.promise;
		try {
			expect(fixture.events.publishUserStats).not.toHaveBeenCalled();
		} finally {
			writeGate.resolve();
			await pending;
		}
		expect(fixture.events.publishUserStats).toHaveBeenCalledExactlyOnceWith('followee');
		expect(fixture.usersRepository.increment).not.toHaveBeenCalled();
		expect(fixture.usersRepository.decrement).not.toHaveBeenCalled();
	});

	test('invalidates both users only after both follow counters finish', async () => {
		const fixture = createService({ delayCounts: true });
		let completed = false;
		const operation = fixture.service.follow(fixture.follower, fixture.followee).then(() => { completed = true; });
		await fixture.countsStarted.promise;
		try {
			fixture.countGates[0].resolve();
			await Promise.resolve();
			expect(completed).toBe(false);
			expect(fixture.userEntityService.pack).not.toHaveBeenCalled();
			expect(fixture.events.publishMainStream).not.toHaveBeenCalled();
			expect(fixture.events.publishUserStats).not.toHaveBeenCalled();
		} finally {
			fixture.countGates[1].resolve();
			await operation;
		}
		expect(fixture.events.publishUserStats.mock.calls).toEqual([['follower'], ['followee']]);
		expect(fixture.users.get('follower')?.followingCount).toBe(3);
		expect(fixture.users.get('followee')?.followersCount).toBe(4);
		expect(fixture.userEntityService.pack.mock.calls.some(([, , options]) => options?.schema === 'MeDetailed')).toBe(false);
	});

	test.each(['unfollow', 'rejectFollow'] as const)('%s waits for both decrements before resolving or publishing relationship events', async operationName => {
		const fixture = createService({ delayCounts: true });
		let completed = false;
		const operation = (operationName === 'unfollow'
			? fixture.service.unfollow(fixture.follower, fixture.followee)
			: fixture.service.rejectFollow(fixture.followee as MiLocalUser, fixture.follower as MiLocalUser))
			.then(() => { completed = true; });
		await fixture.countsStarted.promise;
		try {
			fixture.countGates[0].resolve();
			await Promise.resolve();
			expect(completed).toBe(false);
			expect(fixture.userEntityService.pack).not.toHaveBeenCalled();
			expect(fixture.events.publishMainStream).not.toHaveBeenCalled();
			expect(fixture.events.publishUserStats).not.toHaveBeenCalled();
		} finally {
			fixture.countGates[1].resolve();
			await operation;
		}
		expect(fixture.events.publishUserStats.mock.calls).toEqual([['follower'], ['followee']]);
		expect(fixture.users.get('follower')?.followingCount).toBe(1);
		expect(fixture.users.get('followee')?.followersCount).toBe(2);
		expect(fixture.events.publishMainStream).toHaveBeenCalledWith('follower', 'unfollow', expect.objectContaining({ id: 'followee', followersCount: 2 }));
	});

	test.each([
		{ followerHost: null, followeeHost: 'remote.test' },
		{ followerHost: 'remote.test', followeeHost: null },
	])('invalidates both locally stored users when removing a remote follow: %j', async hosts => {
		const fixture = createService(hosts);
		await fixture.service.unfollow(fixture.follower, fixture.followee);
		expect(fixture.events.publishUserStats.mock.calls).toEqual([['follower'], ['followee']]);
	});

	test('invalidates both locally stored users for an incoming remote follow', async () => {
		const fixture = createService({ followerHost: 'remote.test' });
		await fixture.service.follow(fixture.follower, fixture.followee);
		expect(fixture.events.publishUserStats.mock.calls).toEqual([['follower'], ['followee']]);
	});

	test('keeps silent follows silent while still invalidating counts', async () => {
		const fixture = createService();
		await fixture.service.follow(fixture.follower, fixture.followee, { silent: true });
		expect(fixture.events.publishMainStream.mock.calls.some(([, type]) => type === 'follow')).toBe(false);
		expect(fixture.events.publishUserStats.mock.calls).toEqual([['follower'], ['followee']]);
	});
});

describe('解除关注审批时处理已有请求', () => {
	let service: UserFollowingService;
	const users = mockDeep<UsersRepository>();
	const profiles = mockDeep<UserProfilesRepository>();
	const requests = mockDeep<FollowRequestsRepository>();
	const followings = mockDeep<FollowingsRepository>();
	const userEntity = mockDeep<UserEntityService>();
	const idService = mockDeep<IdService>();
	const receiver = { id: 'receiver', host: null, uri: null, inbox: null, sharedInbox: null };
	const follower = { id: 'follower', host: null } as MiUser;
	const unexpectedError = new Error('DB error');
	const createdAt = new Date();

	beforeEach(async () => {
		mockReset(users);
		mockReset(profiles);
		mockReset(requests);
		mockReset(followings);
		mockReset(userEntity);
		mockReset(idService);
		const module = await Test.createTestingModule({
			providers: [
				UserFollowingService,
				{ provide: DI.usersRepository, useValue: users },
				{ provide: DI.userProfilesRepository, useValue: profiles },
				{ provide: DI.followRequestsRepository, useValue: requests },
				{ provide: DI.followingsRepository, useValue: followings },
				{ provide: UserEntityService, useValue: userEntity },
				{ provide: IdService, useValue: idService },
			],
		}).useMocker(() => mockDeep()).compile();
		service = module.get(UserFollowingService);
		requests.find.mockResolvedValue([
			{ followerId: 'first', follower }, { followerId: 'second', follower },
		] as Awaited<ReturnType<FollowRequestsRepository['find']>>);
		profiles.findOneByOrFail.mockResolvedValue({} as Awaited<ReturnType<UserProfilesRepository['findOneByOrFail']>>);
		userEntity.isRemoteUser.mockReturnValue(false);
		idService.parse.mockReturnValue({ date: createdAt } as ReturnType<IdService['parse']>);
	});

	test('跳过处理期间被删除的用户，继续处理剩余请求', async () => {
		requests.find.mockResolvedValue([
			{ followerId: 'first', follower: null }, { followerId: 'second', follower },
		] as Awaited<ReturnType<FollowRequestsRepository['find']>>);
		requests.findOneBy.mockRejectedValue(unexpectedError);
		await expect(service.acceptAllFollowRequests(receiver)).rejects.toBe(unexpectedError);
	});

	test('跳过处理期间撤销的请求，并向上传递其他错误', async () => {
		requests.findOneBy.mockResolvedValueOnce(null).mockRejectedValueOnce(unexpectedError);
		await expect(service.acceptAllFollowRequests(receiver)).rejects.toBe(unexpectedError);
	});

	test.each([false, true])('複数の申請者とフォロー済みの相手を一括取得し、自動承認の対象だけを承認する（リモート: %s）', async remote => {
		const host = remote ? 'example.com' : null;
		const followed = { id: 'first', host } as MiUser;
		const pending = { id: 'second', host } as MiUser;
		requests.find.mockResolvedValue([
			{ followerId: followed.id, follower: followed }, { followerId: pending.id, follower: pending },
		] as Awaited<ReturnType<FollowRequestsRepository['find']>>);
		profiles.findOneByOrFail.mockResolvedValue({
			followApprovalLocalSeconds: remote ? 0 : 43200,
			followApprovalRemoteSeconds: remote ? 43200 : 0,
			autoAcceptFollowed: true,
		} as Awaited<ReturnType<UserProfilesRepository['findOneByOrFail']>>);
		userEntity.isRemoteUser.mockReturnValue(remote);
		followings.find.mockResolvedValue([{ followeeId: followed.id }] as Awaited<ReturnType<FollowingsRepository['find']>>);
		const accept = vi.spyOn(service, 'acceptFollowRequest').mockResolvedValue();

		await service.acceptAllFollowRequests(receiver);

		expect(accept).toHaveBeenCalledExactlyOnceWith(receiver, followed);
		expect(requests.find).toHaveBeenCalledTimes(1);
		expect(followings.find).toHaveBeenCalledTimes(1);
		expect(followings.exists).not.toHaveBeenCalled();
		expect(users.findOneBy).not.toHaveBeenCalled();
	});
});
