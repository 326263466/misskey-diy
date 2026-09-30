/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { MiUser, MiUserProfile } from '@/models/_.js';

function createFixture() {
	const user = {
		id: 'alice', username: 'alice', host: null, avatarDecorations: [], emojis: [],
		hideOnlineStatus: true, onlineStatusOverride: 'online', lastActiveDate: new Date(),
		customStatus: { icon: 'music', text: 'Music' },
		onlineStatusAutoReplies: { away: 'Private automatic reply', busy: null },
	} as unknown as MiUser;
	const profiles = {
		find: vi.fn().mockResolvedValue([]),
		findOne: vi.fn().mockResolvedValue(null),
		findBy: vi.fn().mockResolvedValue([]),
		findOneByOrFail: vi.fn(),
	};
	const service: UserEntityService = Object.setPrototypeOf({
		userProfilesRepository: profiles,
		config: { host: 'misskey.test', url: 'https://misskey.test' },
		meta: {},
		roleService: {
			isModerator: vi.fn().mockResolvedValue(false),
			isAdministrator: vi.fn().mockResolvedValue(false),
			getUserBadgeRoles: vi.fn().mockResolvedValue([]),
			getUserRoles: vi.fn().mockResolvedValue([]),
			getUserPolicies: vi.fn().mockResolvedValue({}),
		},
		customEmojiService: { populateEmojis: vi.fn().mockResolvedValue({}) },
		announcementService: { getUnreadAnnouncements: vi.fn().mockResolvedValue([]) },
		noteEntityService: { packMany: vi.fn().mockResolvedValue([]) },
		idService: { parse: () => ({ date: new Date() }) },
		chatService: { hasUnreadMessages: vi.fn().mockResolvedValue(false) },
		getNotificationsInfo: vi.fn().mockResolvedValue(null),
		getHasUnreadAntenna: vi.fn().mockResolvedValue(false),
		getHasPendingReceivedFollowRequest: vi.fn().mockResolvedValue(false),
		isLocalUser: () => true,
	}, UserEntityService.prototype);
	const options = {
		userProfile: { loggedInDates: [] } as unknown as MiUserProfile,
		userMemos: new Map(), userRelations: new Map(), pinNotes: new Map(),
	};
	return { user, service, options, profiles };
}

describe('note author professional profile packing', () => {
	test.each([
		{ company: '示例科技', jobTitle: '产品设计师' },
		{ company: '示例科技', jobTitle: null },
		{ company: null, jobTitle: '产品设计师' },
		{ company: null, jobTitle: null },
	])('includes only public professional fields when requested: %j', async professionalProfile => {
		const { user, service, profiles } = createFixture();
		profiles.findOne.mockResolvedValue({ ...professionalProfile, email: 'private@example.test' });
		const packed = await service.pack(user, null, { includeProfessionalProfile: true });
		expect(packed).toMatchObject({ ...professionalProfile, onlineStatus: null });
		expect(packed).not.toHaveProperty('email');
		expect(profiles.findOne).toHaveBeenCalledExactlyOnceWith({
			where: { userId: user.id }, select: { company: true, jobTitle: true },
		});
	});

	test('batches professional profiles once for repeated authors and does not retry missing profiles', async () => {
		const { user, service, profiles } = createFixture();
		profiles.find.mockResolvedValue([{ userId: user.id, company: '示例科技', jobTitle: null }]);
		const packed = await service.packMany([user, { ...user, id: 'bob' }, user], null, { includeProfessionalProfile: true });
		expect(packed.map(author => [author.company, author.jobTitle])).toEqual([
			['示例科技', null], [null, null], ['示例科技', null],
		]);
		expect(profiles.find).toHaveBeenCalledTimes(1);
		expect(profiles.find.mock.calls[0][0].select).toEqual({ userId: true, company: true, jobTitle: true });
		expect(profiles.find.mock.calls[0][0].where.userId.value).toEqual(['alice', 'bob']);
		expect(profiles.findOne).not.toHaveBeenCalled();
		expect(profiles.findOneByOrFail).not.toHaveBeenCalled();
	});

	test('reuses detailed profiles for professional fields without a second query', async () => {
		const { user, service, options, profiles } = createFixture();
		profiles.findBy.mockResolvedValue([{ ...options.userProfile, userId: user.id, company: '示例科技', jobTitle: '设计师' }]);
		const [packed] = await service.packMany([user], null, { schema: 'UserDetailed', includeProfessionalProfile: true });
		expect(packed).toMatchObject({ company: '示例科技', jobTitle: '设计师' });
		expect(profiles.findBy).toHaveBeenCalledTimes(1);
		expect(profiles.find).not.toHaveBeenCalled();
		expect(profiles.findOne).not.toHaveBeenCalled();
		expect(profiles.findOneByOrFail).not.toHaveBeenCalled();
	});

	test.each([undefined, { schema: 'UserLite' as const }])('keeps ordinary lightweight batches free of profile queries: %j', async options => {
		const { user, service, profiles } = createFixture();
		const [packed] = await service.packMany([user], null, options);
		expect(packed).not.toHaveProperty('company');
		expect(packed).not.toHaveProperty('jobTitle');
		for (const method of Object.values(profiles)) expect(method).not.toHaveBeenCalled();
	});

	test('does not query professional profiles for an empty author list', async () => {
		const { service, profiles } = createFixture();
		expect(await service.packMany([], null, { includeProfessionalProfile: true })).toEqual([]);
		for (const method of Object.values(profiles)) expect(method).not.toHaveBeenCalled();
	});
});

describe('user presence packing', () => {
	test.each([null, { id: 'viewer' }, { id: 'alice' }])('exposes company and job title in detailed profiles independently of hidden online presence (viewer: %j)', async viewer => {
		const { user, service, options } = createFixture();
		Object.assign(options.userProfile, { company: '示例科技', jobTitle: '产品设计师' });
		const packed = await service.pack(user, viewer, { ...options, schema: 'UserDetailed' });
		expect(packed).toMatchObject({ company: '示例科技', jobTitle: '产品设计师', onlineStatus: null });
		const lite = await service.pack(user, viewer);
		expect(lite).not.toHaveProperty('company');
		expect(lite).not.toHaveProperty('jobTitle');
	});

	test('returns null for optional professional profile fields in existing accounts', async () => {
		const { user, service, options } = createFixture();
		expect(await service.pack(user, user, { ...options, schema: 'MeDetailed' })).toMatchObject({ company: null, jobTitle: null });
	});

	test.each([null, { id: 'viewer' }, { id: 'alice' }])('keeps hidden UserLite data safe for shared streams (viewer: %j)', async viewer => {
		const { user, service } = createFixture();
		const packed = await service.pack(user, viewer);
		expect(packed).toMatchObject({ onlineStatus: null, customStatus: null });
		expect(packed).not.toHaveProperty('hideOnlineStatus');
		expect(packed).not.toHaveProperty('onlineStatusOverride');
		expect(packed).not.toHaveProperty('onlineStatusAutoReplies');
		expect(packed).not.toHaveProperty('lastActiveDate');
	});

	test.each([null, { id: 'viewer' }, { id: 'alice' }])('exposes only unknown presence for invisible users in shared payloads (viewer: %j)', async viewer => {
		const { user, service } = createFixture();
		user.hideOnlineStatus = false;
		user.onlineStatusOverride = 'invisible';
		const packed = await service.pack(user, viewer);
		expect(packed).toMatchObject({ onlineStatus: 'unknown', customStatus: null });
		expect(packed).not.toHaveProperty('onlineStatusOverride');
		expect(packed).not.toHaveProperty('hideOnlineStatus');
	});

	test('shows visible custom status on lightweight users', async () => {
		const { user, service } = createFixture();
		user.hideOnlineStatus = false;
		expect(await service.pack(user)).toMatchObject({ onlineStatus: 'online', customStatus: user.customStatus });
	});

	test('keeps saved custom status in a detailed self response for editing', async () => {
		const { user, service, options } = createFixture();
		expect(await service.pack(user, user, { ...options, schema: 'MeDetailed' })).toMatchObject({
			onlineStatus: null, hideOnlineStatus: true, onlineStatusOverride: 'online', customStatus: user.customStatus,
			onlineStatusAutoReplies: user.onlineStatusAutoReplies,
		});
	});

	test('conceals hidden presence in detailed responses to other users', async () => {
		const { user, service, options } = createFixture();
		const packed = await service.pack(user, { id: 'viewer' }, { ...options, schema: 'UserDetailed' });
		expect(packed).toMatchObject({ onlineStatus: null, customStatus: null });
		expect(packed).not.toHaveProperty('hideOnlineStatus');
		expect(packed).not.toHaveProperty('onlineStatusOverride');
		expect(packed).not.toHaveProperty('onlineStatusAutoReplies');
	});
});
