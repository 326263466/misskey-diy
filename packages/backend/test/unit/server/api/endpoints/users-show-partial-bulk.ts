/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { FindOperator } from 'typeorm';
import { isUserFollowCountVisible } from '@/misc/is-user-follow-count-visible.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import ShowPartialBulkEndpoint from '@/server/api/endpoints/users/show-partial-bulk.js';

type Visibility = 'public' | 'followers' | 'private';
type Where = Record<string, unknown>;
type Row = Record<string, unknown>;

function repository<T extends Row>(rows: T[]) {
	return {
		find: vi.fn(async ({ where, select }: { where: Where | Where[]; select: Record<string, boolean> }) => {
			const alternatives = Array.isArray(where) ? where : [where];
			return rows.filter(row => alternatives.some(filter => Object.entries(filter).every(([key, value]) => {
				if (value instanceof FindOperator) {
					if (value.type === 'in') return (value.value as unknown[]).includes(row[key]);
					if (value.type === 'isNull') return row[key] === null;
				throw new Error(`Unexpected query operator: ${value.type}`);
				}
				return row[key] === value;
			}))).map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) as T);
		}),
	};
}

function createFixture({ moderator = false, visitorVisibility = 'all' }: { moderator?: boolean; visitorVisibility?: 'all' | 'local' | 'none' } = {}) {
	const users: Array<Pick<MiUser, 'id' | 'host' | 'isSuspended' | 'notesCount' | 'followingCount' | 'followersCount' | 'hideOnlineStatus' | 'onlineStatusOverride' | 'lastActiveDate' | 'customStatus'>> = [];
	const profiles: Array<{ userId: string; followingVisibility: Visibility; followersVisibility: Visibility }> = [];
	const followings: Array<{ followerId: string; followeeId: string }> = [];
	const requests: Array<{ followerId: string; followeeId: string }> = [];
	const usersRepository = repository(users);
	const profilesRepository = repository(profiles);
	const followingsRepository = repository(followings);
	const requestsRepository = repository(requests);
	const roles = { isModerator: vi.fn().mockResolvedValue(moderator) };
	const endpoint = new ShowPartialBulkEndpoint(
		{ ugcVisibilityForVisitor: visitorVisibility } as never,
		usersRepository as never,
		profilesRepository as never,
		followingsRepository as never,
		requestsRepository as never,
		roles as never,
	);

	function addUser(id: string, visibility: Visibility = 'public', options: { host?: string | null; isSuspended?: boolean } = {}) {
		users.push({ id, host: null, isSuspended: false, notesCount: 13, followingCount: 7, followersCount: 9, hideOnlineStatus: false, onlineStatusOverride: 'online', lastActiveDate: new Date(), customStatus: null, ...options });
		profiles.push({ userId: id, followingVisibility: visibility, followersVisibility: visibility });
	}

	const exec = (userIds: string[], viewerId: string | null = 'viewer') => endpoint.exec({ userIds }, viewerId ? { id: viewerId } as MiLocalUser : null, null);
	return { exec, addUser, users, profiles, followings, requests, usersRepository, profilesRepository, followingsRepository, requestsRepository, roles };
}

describe('shared follow count visibility', () => {
	test.each(['public', 'followers', 'private'] as const)('preserves the UserDetailed access matrix for %s counts', visibility => {
		for (const isMe of [false, true]) {
			for (const isModerator of [false, true]) {
				for (const isFollowing of [false, true]) {
					const expected = isMe || isModerator || visibility === 'public' || (visibility === 'followers' && isFollowing);
					expect(isUserFollowCountVisible(visibility, { isMe, isModerator, isFollowing })).toBe(expected);
				}
			}
		}
	});

	test('does not expose follow counts for a missing profile, even to its owner', () => {
		expect(isUserFollowCountVisible(undefined, { isMe: true, isModerator: true, isFollowing: true })).toBe(false);
	});
});

describe('users/show-partial-bulk', () => {
	test.each([false, true])('only reveals hidden custom status to its owner, including for moderators (%s)', async moderator => {
		const fixture = createFixture({ moderator });
		for (const id of ['viewer', 'hidden', 'online', 'away']) fixture.addUser(id);
		const customStatus = { icon: 'music', text: 'Listening' } as const;
		for (const user of fixture.users) user.customStatus = customStatus;
		fixture.users[0].hideOnlineStatus = true;
		fixture.users[1].hideOnlineStatus = true;
		fixture.users[3].onlineStatusOverride = 'away';
		const result = await fixture.exec(fixture.users.map(user => user.id));
		expect(result.map((user: { customStatus: unknown }) => user.customStatus)).toEqual([customStatus, null, customStatus, null]);
		expect((await fixture.exec(['hidden'], null))[0]).toMatchObject({ onlineStatus: null, customStatus: null });
	});

	test('returns public presence while concealing the saved status of an invisible user', async () => {
		const fixture = createFixture();
		fixture.addUser('away');
		fixture.addUser('invisible');
		fixture.addUser('doNotDisturb');
		fixture.addUser('hidden');
		fixture.users[0].onlineStatusOverride = 'away';
		fixture.users[1].onlineStatusOverride = 'invisible';
		fixture.users[2].onlineStatusOverride = 'doNotDisturb';
		fixture.users[3].hideOnlineStatus = true;
		const result = await fixture.exec(['away', 'invisible', 'doNotDisturb', 'hidden']);
		expect(result.map((user: { onlineStatus: string | null }) => user.onlineStatus)).toEqual(['away', 'unknown', 'doNotDisturb', null]);
		for (const user of result) {
			expect(user).not.toHaveProperty('hideOnlineStatus');
			expect(user).not.toHaveProperty('onlineStatusOverride');
			expect(user).not.toHaveProperty('onlineStatusAutoReplies');
			expect(user).not.toHaveProperty('lastActiveDate');
		}
	});

	test('preserves request order, omits missing users and returns only the partial contract', async () => {
		const fixture = createFixture();
		fixture.addUser('alice');
		fixture.addUser('bob');
		const result = await fixture.exec(['bob', 'missing', 'alice']);
		expect(result).toEqual(['bob', 'alice'].map(id => ({
			id, notesCount: 13, followingCount: 7, followersCount: 9, onlineStatus: 'online', customStatus: null,
			followingVisibility: 'public', followersVisibility: 'public',
			isFollowing: false, isFollowed: false, hasPendingFollowRequestFromYou: false,
		})));
	});

	test('hides private counts from visitors and does not load any relationship rows', async () => {
		const fixture = createFixture();
		fixture.addUser('alice', 'private');
		expect(await fixture.exec(['alice'], null)).toEqual([expect.objectContaining({ notesCount: 13, followingCount: 0, followersCount: 0, isFollowing: false, isFollowed: false, hasPendingFollowRequestFromYou: false })]);
		expect(fixture.followingsRepository.find).not.toHaveBeenCalled();
		expect(fixture.requestsRepository.find).not.toHaveBeenCalled();
	});

	test('only accepted outgoing follows reveal followers-only counts, not incoming or pending follows', async () => {
		const fixture = createFixture();
		for (const id of ['followed', 'incoming', 'pending']) fixture.addUser(id, 'followers');
		fixture.followings.push({ followerId: 'viewer', followeeId: 'followed' }, { followerId: 'incoming', followeeId: 'viewer' });
		fixture.requests.push({ followerId: 'viewer', followeeId: 'pending' });
		const result = await fixture.exec(['followed', 'incoming', 'pending']);
		expect(result).toEqual([
			expect.objectContaining({ id: 'followed', followingCount: 7, followersCount: 9, isFollowing: true, isFollowed: false }),
			expect.objectContaining({ id: 'incoming', followingCount: 0, followersCount: 0, isFollowing: false, isFollowed: true }),
			expect.objectContaining({ id: 'pending', followingCount: 0, followersCount: 0, hasPendingFollowRequestFromYou: true }),
		]);
	});

	test('checks the two visibility settings independently', async () => {
		const fixture = createFixture();
		fixture.addUser('alice');
		fixture.profiles[0].followingVisibility = 'private';
		expect(await fixture.exec(['alice'])).toEqual([expect.objectContaining({ followingCount: 0, followersCount: 9 })]);
	});

	test.each([false, true])('reveals private counts only to self or moderator (moderator: %s)', async moderator => {
		const fixture = createFixture({ moderator });
		fixture.addUser('viewer', 'private');
		fixture.addUser('other', 'private');
		expect(await fixture.exec(['viewer', 'other'])).toEqual([
			expect.objectContaining({ id: 'viewer', followingCount: 7, followersCount: 9 }),
			expect.objectContaining({ id: 'other', followingCount: moderator ? 7 : 0, followersCount: moderator ? 9 : 0 }),
		]);
		expect(fixture.roles.isModerator).toHaveBeenCalledOnce();
	});

	test.each([false, true])('applies the same suspended-account rule as users/show (moderator: %s)', async moderator => {
		const fixture = createFixture({ moderator });
		fixture.addUser('suspended', 'public', { isSuspended: true });
		expect(await fixture.exec(['suspended'])).toHaveLength(moderator ? 1 : 0);
	});

	test('hides remote users from local-only visitors but allows signed-in access', async () => {
		const fixture = createFixture({ visitorVisibility: 'local' });
		fixture.addUser('local');
		fixture.addUser('remote', 'public', { host: 'remote.test' });
		expect((await fixture.exec(['remote', 'local'], null)).map((user: { id: string }) => user.id)).toEqual(['local']);
		expect((await fixture.exec(['remote', 'local'])).map((user: { id: string }) => user.id)).toEqual(['remote', 'local']);
	});

	test('keeps public user statistics accessible under the users/show none policy', async () => {
		const fixture = createFixture({ visitorVisibility: 'none' });
		fixture.addUser('alice');
		expect(await fixture.exec(['alice'], null)).toHaveLength(1);
	});

	test('bounds every relationship and profile query to the requested users even for a large account', async () => {
		const fixture = createFixture();
		for (let index = 0; index < 100; index++) fixture.addUser(`user${index}`);
		fixture.followings.push({ followerId: 'viewer', followeeId: 'outside' }, { followerId: 'outside', followeeId: 'viewer' });
		fixture.requests.push({ followerId: 'viewer', followeeId: 'outside' });
		const ids = fixture.users.map(user => user.id);
		expect(await fixture.exec(ids)).toHaveLength(100);
		for (const repo of [fixture.usersRepository, fixture.profilesRepository, fixture.followingsRepository, fixture.requestsRepository]) {
			expect(repo.find).toHaveBeenCalledOnce();
		}
		expect(fixture.roles.isModerator).toHaveBeenCalledOnce();
		const relationFilters = fixture.followingsRepository.find.mock.calls[0][0].where as Where[];
		expect((relationFilters[0].followeeId as FindOperator<string[]>).value).toEqual(ids);
		expect((relationFilters[1].followerId as FindOperator<string[]>).value).toEqual(ids);
		expect(relationFilters[0].followerId).toBe('viewer');
		expect(relationFilters[1].followeeId).toBe('viewer');
		const requestFilter = fixture.requestsRepository.find.mock.calls[0][0].where as Where;
		expect((requestFilter.followeeId as FindOperator<string[]>).value).toEqual(ids);
		expect(requestFilter.followerId).toBe('viewer');
		expect(fixture.usersRepository.find.mock.calls[0][0].select).toEqual({ id: true, notesCount: true, followingCount: true, followersCount: true, hideOnlineStatus: true, onlineStatusOverride: true, lastActiveDate: true, customStatus: true });
		expect(fixture.profilesRepository.find.mock.calls[0][0].select).toEqual({ userId: true, followingVisibility: true, followersVisibility: true });
	});

	test.each([
		{ name: 'empty', ids: [] },
		{ name: 'duplicate', ids: ['alice', 'alice'] },
		{ name: 'malformed', ids: ['bad/id'] },
		{ name: 'oversized', ids: Array.from({ length: 101 }, (_, index) => `user${index}`) },
	])('rejects a $name batch before running queries', async ({ ids }) => {
		const fixture = createFixture();
		await expect(fixture.exec(ids)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(fixture.usersRepository.find).not.toHaveBeenCalled();
		expect(fixture.roles.isModerator).not.toHaveBeenCalled();
	});
});
