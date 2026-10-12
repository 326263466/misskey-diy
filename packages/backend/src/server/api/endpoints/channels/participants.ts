/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ChannelsRepository, UsersRepository } from '@/models/_.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['channels', 'users'],

	requireCredential: false,

	limit: {
		duration: ms('1min'),
		max: 30,
	},

	description: 'List users who have posted in the channel, most recently joined (first post) first.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserDetailed',
		},
	},

	errors: {
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: 'eae2c8a5-5598-4825-94cf-82adb2a9076c',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', minimum: 0, default: 0 },
	},
	required: ['channelId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private channelEntityService: ChannelEntityService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const channel = await this.channelsRepository.findOneBy({ id: ps.channelId });
			if (channel == null) {
				throw new ApiError(meta.errors.noSuchChannel);
			}

			// 频道帖子总是公开的，这里只列出发帖人，不涉及关注关系。
			// 以首次发帖时间作为加入时间，最近加入的排在前面。
			const rows = await this.channelEntityService.makeParticipantsQuery(channel.id)
				.select('note.userId', 'userId')
				.addSelect('MIN(note.id)', 'firstNoteId')
				.groupBy('note.userId')
				.orderBy('"firstNoteId"', 'DESC')
				.limit(ps.limit)
				.offset(ps.offset)
				.getRawMany<{ userId: string; firstNoteId: string }>();

			if (rows.length === 0) return [];

			const users = await this.usersRepository.findBy({ id: In(rows.map(row => row.userId)) });
			const byId = new Map(users.map(user => [user.id, user]));
			const ordered = rows.map(row => byId.get(row.userId)).filter(user => user != null);

			return await this.userEntityService.packMany(ordered, me, { schema: 'UserDetailed' });
		});
	}
}
