/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { HashtagService } from '@/core/HashtagService.js';

export const meta = {
	tags: ['hashtags'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 60 * 1,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				tag: {
					type: 'string',
					optional: false, nullable: false,
				},
				chart: {
					type: 'array',
					optional: false, nullable: false,
					items: {
						type: 'number',
						optional: false, nullable: false,
					},
				},
				usersCount: {
					type: 'number',
					optional: false, nullable: false,
					description: 'Peak unique users per 10-minute window in the recent chart range.',
				},
				totalUsersCount: {
					type: 'number',
					optional: false, nullable: false,
					description: 'Unique users who have ever posted notes with this hashtag.',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private featuredService: FeaturedService,
		private hashtagService: HashtagService,
	) {
		super(meta, paramDef, async () => {
			const ranking = await this.hashtagService.backfillHashtagsRanking(await this.featuredService.getHashtagsRanking(10));

			if (ranking.length === 0) return [];

			const [charts, totals] = await Promise.all([
				this.hashtagService.getCharts(ranking, 20),
				this.hashtagService.getTotalUsersCounts(ranking),
			]);

			const stats = ranking.map(tag => ({
				tag,
				chart: charts[tag],
				usersCount: Math.max(...charts[tag]),
				totalUsersCount: totals[tag],
			}));

			return stats;
		});
	}
}
