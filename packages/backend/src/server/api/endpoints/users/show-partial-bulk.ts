/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import { RoleService } from '@/core/RoleService.js';
import { DI } from '@/di-symbols.js';
import { isUserFollowCountVisible } from '@/misc/is-user-follow-count-visible.js';
import { getUserCustomStatus, getUserOnlineStatus } from '@/misc/user-online-status.js';
import { packedUserCustomStatusSchema } from '@/models/json-schema/user.js';
import type { FollowingsRepository, FollowRequestsRepository, MiMeta, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['users'],
	requireCredential: false,
	description: 'Show current user counts, online status and follow relationships in a bounded batch.',
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', optional: false, nullable: false, format: 'id' },
				onlineStatus: { type: 'string', optional: false, nullable: true, enum: ['unknown', 'online', 'active', 'offline', 'away', 'busy', 'doNotDisturb'] },
				customStatus: packedUserCustomStatusSchema,
				notesCount: { type: 'integer', optional: false, nullable: false },
				followingCount: { type: 'integer', optional: false, nullable: false },
				followersCount: { type: 'integer', optional: false, nullable: false },
				followingVisibility: { type: 'string', optional: false, nullable: false, enum: ['public', 'followers', 'private'] },
				followersVisibility: { type: 'string', optional: false, nullable: false, enum: ['public', 'followers', 'private'] },
				isFollowing: { type: 'boolean', optional: false, nullable: false },
				isFollowed: { type: 'boolean', optional: false, nullable: false },
				hasPendingFollowRequestFromYou: { type: 'boolean', optional: false, nullable: false },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 100, items: { type: 'string', format: 'misskey:id' } },
	},
	required: ['userIds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.followRequestsRepository)
		private followRequestsRepository: FollowRequestsRepository,

		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const isModerator = await this.roleService.isModerator(me);
			const users = await this.usersRepository.find({
				where: {
					id: In(ps.userIds),
					...(!isModerator ? { isSuspended: false } : {}),
					...(me == null && this.serverSettings.ugcVisibilityForVisitor === 'local' ? { host: IsNull() } : {}),
				},
				select: { id: true, notesCount: true, followingCount: true, followersCount: true, hideOnlineStatus: true, onlineStatusOverride: true, lastActiveDate: true, customStatus: true },
			});
			if (users.length === 0) return [];

			const ids = users.map(user => user.id);
			const [profiles, followings, requests] = await Promise.all([
				this.userProfilesRepository.find({
					where: { userId: In(ids) },
					select: { userId: true, followingVisibility: true, followersVisibility: true },
				}),
				me ? this.followingsRepository.find({
					where: [{ followerId: me.id, followeeId: In(ids) }, { followeeId: me.id, followerId: In(ids) }],
					select: { followerId: true, followeeId: true },
				}) : [],
				me ? this.followRequestsRepository.find({
					where: { followerId: me.id, followeeId: In(ids) },
					select: { followeeId: true },
				}) : [],
			]);
			const usersById = new Map(users.map(user => [user.id, user]));
			const profilesById = new Map(profiles.map(profile => [profile.userId, profile]));
			const followingIds = new Set(followings.filter(row => row.followerId === me?.id).map(row => row.followeeId));
			const followerIds = new Set(followings.filter(row => row.followeeId === me?.id).map(row => row.followerId));
			const requestedIds = new Set(requests.map(row => row.followeeId));

			return ps.userIds.flatMap(id => {
				const user = usersById.get(id);
				const profile = profilesById.get(id);
				if (user == null || profile == null) return [];
				const isFollowing = me?.id !== id && followingIds.has(id);
				const visibility = { isMe: me?.id === id, isModerator, isFollowing };
				return [{
					id,
					onlineStatus: getUserOnlineStatus(user),
					customStatus: getUserCustomStatus(user, me?.id === user.id),
					notesCount: user.notesCount,
					followingCount: isUserFollowCountVisible(profile.followingVisibility, visibility) ? user.followingCount : 0,
					followersCount: isUserFollowCountVisible(profile.followersVisibility, visibility) ? user.followersCount : 0,
					followingVisibility: profile.followingVisibility,
					followersVisibility: profile.followersVisibility,
					isFollowing,
					isFollowed: me?.id !== id && followerIds.has(id),
					hasPendingFollowRequestFromYou: me?.id !== id && requestedIds.has(id),
				}];
			});
		});
	}
}
