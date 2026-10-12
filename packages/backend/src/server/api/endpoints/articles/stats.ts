/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import type { PagesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['pages'],
	description: 'Get an author\'s public Markdown article count and total article views.',
	requireCredential: false,
	limit: { duration: 60 * 1000, max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			articlesCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
			articleViewsCount: { type: 'integer', optional: false, nullable: false, minimum: 0 },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.pagesRepository)
		private pagesRepository: PagesRepository,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 与 articles/list 使用相同的公开文章和作者过滤条件。
			const query = this.pagesRepository.createQueryBuilder('page')
				.innerJoin('page.user', 'user')
				.select('COUNT(*)', 'articlesCount')
				.addSelect('COALESCE(SUM(page.articleViews), 0)', 'articleViewsCount')
				.where('page.userId = :authorId', { authorId: ps.userId })
				.andWhere('page.visibility = :visibility', { visibility: 'public' })
				.andWhere('user.isSuspended = false')
				.andWhere('user.isDeleted = false')
				.andWhere('jsonb_array_length(page.content) = 1')
				.andWhere("jsonb_typeof(page.content->0->'text') = 'string'")
				.andWhere('page.content @> :article', { article: JSON.stringify([{ type: 'markdown' }]) });
			if (me) {
				this.queryService.generateBlockQueryForUsers(query, me);
				this.queryService.generateMutedUserQueryForUsers(query, me);
			}
			const result = await query.getRawOne<{ articlesCount: string; articleViewsCount: string }>();
			return {
				articlesCount: Number(result?.articlesCount ?? 0),
				articleViewsCount: Number(result?.articleViewsCount ?? 0),
			};
		});
	}
}
