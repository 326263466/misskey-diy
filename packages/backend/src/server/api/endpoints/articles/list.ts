/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { PageEntityService } from '@/core/entities/PageEntityService.js';
import type { PagesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { articleCategoryIdSchema } from '@/models/Page.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { articleTagsSchema } from '@/misc/article-tags.js';

export const meta = {
	tags: ['pages'],
	description: 'List published Markdown articles by recency or likes, optionally from followed authors.',
	requireCredential: false,
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: { type: 'object', optional: false, nullable: false, ref: 'Page' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sort: { type: 'string', enum: ['recommended', 'latest'], default: 'latest' },
		offset: { type: 'integer', minimum: 0, default: 0 },
		following: { type: 'boolean', default: false },
		categoryId: articleCategoryIdSchema,
		tag: articleTagsSchema.items,
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.pagesRepository)
		private pagesRepository: PagesRepository,
		private pageEntityService: PageEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.following && !me) return [];

			const query = this.pagesRepository.createQueryBuilder('page')
				.innerJoin('page.user', 'user')
				.andWhere('page.visibility = :visibility', { visibility: 'public' })
				.andWhere('user.isSuspended = false')
				.andWhere('user.isDeleted = false')
				.andWhere('jsonb_array_length(page.content) = 1')
				.andWhere("jsonb_typeof(page.content->0->'text') = 'string'")
				.andWhere('page.content @> :article', { article: JSON.stringify([{ type: 'markdown' }]) });
			if (ps.sort === 'recommended') {
				// 点赞排序与 ID 顺序不同，分页不能套用时间游标。
				query.orderBy('page.likedCount', 'DESC').addOrderBy('page.id', 'DESC').offset(ps.offset);
			} else {
				this.queryService.makePaginationQuery(query, ps.sinceId, ps.untilId);
			}
			if (ps.userId) query.andWhere('page.userId = :authorId', { authorId: ps.userId });
			if (ps.categoryId) query.andWhere('page.articleCategoryId = :categoryId', { categoryId: ps.categoryId });
			if (ps.tag) query.andWhere('page.content @> :articleTag', { articleTag: JSON.stringify([{ articleTags: [normalizeForSearch(ps.tag).trim()] }]) });
			if (me) {
				if (ps.following) {
					query.andWhere('page.userId IN (SELECT "followeeId" FROM following WHERE "followerId" = :followerId)', { followerId: me.id });
				}
				this.queryService.generateBlockQueryForUsers(query, me);
				this.queryService.generateMutedUserQueryForUsers(query, me);
			}
			return await this.pageEntityService.packMany(await query.limit(ps.limit).getMany(), me);
		});
	}
}
