/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';
import type { Redis } from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { SearchIndexService, searchFilterValue } from '@/core/SearchIndexService.js';
import { PageEntityService } from '@/core/entities/PageEntityService.js';
import { IdService } from '@/core/IdService.js';
import { rankArticles } from '@/core/article-recommendation.js';
import type { FollowingsRepository, MiMeta, MiPage, PagesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { articleCategoryIdSchema } from '@/models/Page.js';
import { normalizeTag } from '@/misc/normalize-tag.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { runSearchQuery, searchTimeoutError, searchProviderErrors } from '@/misc/search-query.js';
import type { DatabaseSearchProvider } from '@/misc/search-query.js';
import { articleTagsSchema } from '@/misc/article-tags.js';
import type { SchemaType } from '@/misc/json-schema.js';
import { ApiError } from '@/server/api/error.js';

const CANDIDATES_PER_SOURCE = 200;
const SNAPSHOT_LIFETIME = 20 * 60;

export const meta = {
	tags: ['pages'],
	description: 'List published Markdown articles by recency or personalized recommendations. Use recommendationId and recommendationCursor for stable recommendation pagination.',
	requireCredential: false,
	limit: { duration: 60 * 1000, max: 60 },
	errors: {
		...searchProviderErrors,
		searchTimeout: searchTimeoutError,
		permissionDenied: {
			message: 'Search of articles unavailable.',
			code: 'ROLE_PERMISSION_DENIED',
			kind: 'permission',
			id: 'f9425d7c-a46a-4207-81ec-193775f2a63e',
		},
		recommendationExpired: {
			message: 'The article recommendation session has expired. Refresh to start a new session.',
			code: 'RECOMMENDATION_EXPIRED',
			id: '282d1e69-cae1-4737-8043-218285fdb971',
		},
		invalidRecommendationCursor: {
			message: 'The article recommendation cursor is invalid for this session.',
			code: 'INVALID_RECOMMENDATION_CURSOR',
			id: '650dd6d0-4373-45d9-a354-6d14301afb43',
		},
		recommendationUnavailable: {
			message: 'Article recommendations are temporarily unavailable.',
			code: 'RECOMMENDATION_UNAVAILABLE',
			id: 'c1c58557-3815-4060-a9e0-f33dbb145418',
			kind: 'server',
			httpStatusCode: 503,
		},
	},
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: { type: 'object', optional: false, nullable: false, ref: 'Page' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', minLength: 1, maxLength: 512, description: '按标题、摘要和 Markdown 正文搜索，不区分大小写。' },
		sort: { type: 'string', enum: ['recommended', 'latest'], default: 'latest' },
		offset: { type: 'integer', minimum: 0, default: 0 },
		recommendationId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' },
		recommendationCursor: { type: 'string', format: 'misskey:id', maxLength: 32 },
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
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,
		@Inject(DI.redis)
		private redisClient: Redis,
		private pageEntityService: PageEntityService,
		private queryService: QueryService,
		private idService: IdService,
		private roleService: RoleService,
		private searchIndexService: SearchIndexService,
		@Inject(DI.meta)
		private serverSettings: MiMeta,
	) {
		super(meta, paramDef, async (ps, me) => {
			if ((ps.recommendationCursor && !ps.recommendationId) || (ps.recommendationId && (ps.sort !== 'recommended' || ps.offset !== 0))) {
				throw new ApiError(meta.errors.invalidRecommendationCursor);
			}
			if (ps.following && !me) return [];
			const searchText = ps.query?.trim();
			if (ps.query != null && !searchText) return [];
			if (searchText && (me || this.serverSettings.clientOptions.openGuestAccess !== true)) {
				const policies = await this.roleService.getUserPolicies(me?.id ?? null);
				if (!policies.canSearchArticles) throw new ApiError(meta.errors.permissionDenied);
			}

			const query = this.pagesRepository.createQueryBuilder('page')
				.innerJoin('page.user', 'user')
				.andWhere('page.visibility = :visibility', { visibility: 'public' })
				.andWhere('user.isSuspended = false')
				.andWhere('user.isDeleted = false')
				.andWhere('jsonb_array_length(page.content) = 1')
				.andWhere("jsonb_typeof(page.content->0->'text') = 'string'")
				.andWhere('page.content @> :article', { article: JSON.stringify([{ type: 'markdown' }]) });
			if (!me) query.andWhere('user.requireSigninToViewContents = false');
			if (ps.userId) query.andWhere('page.userId = :authorId', { authorId: ps.userId });
			if (ps.categoryId) query.andWhere('page.articleCategoryId = :categoryId', { categoryId: ps.categoryId });
			if (ps.tag) query.andWhere('page.content @> :articleTag', { articleTag: JSON.stringify([{ articleTags: [normalizeTag(ps.tag).trim()] }]) });
			if (me) {
				if (ps.following) {
					query.andWhere('page.userId IN (SELECT "followeeId" FROM following WHERE "followerId" = :followerId)', { followerId: me.id });
				}
				this.queryService.generateBlockQueryForUsers(query, me);
				this.queryService.generateMutedUserQueryForUsers(query, me);
			}
			if (ps.sort === 'recommended') return this.recommended(query, ps, me);
			this.queryService.makePaginationQuery(query, ps.sinceId, ps.untilId);
			if (searchText) {
				const filter: string[] = [];
				if (ps.userId) filter.push(`userId = ${searchFilterValue(ps.userId)}`);
				if (ps.categoryId) filter.push(`categoryId = ${searchFilterValue(ps.categoryId)}`);
				if (ps.tag) filter.push(`tags = ${searchFilterValue(normalizeTag(ps.tag).trim())}`);
				if (ps.untilId) filter.push(`createdAt <= ${this.idService.parse(ps.untilId).date.getTime()}`);
				if (ps.sinceId) filter.push(`createdAt >= ${this.idService.parse(ps.sinceId).date.getTime()}`);
				const direction = ps.sinceId && !ps.untilId ? 'asc' : 'desc';
				const articles = await this.searchIndexService.search('articles', searchText, query, {
					filter,
					sort: [`createdAt:${direction}`, `id:${direction}`],
					limit: ps.limit,
					offset: ps.offset,
				}, provider => {
					const databaseQuery = query.clone();
					this.applyDatabaseSearch(databaseQuery, searchText, provider);
					return runSearchQuery(databaseQuery.limit(ps.limit).offset(ps.offset));
				});
				return this.pageEntityService.packMany(articles, me);
			}
			const articles = await query.limit(ps.limit).getMany();
			return await this.pageEntityService.packMany(articles, me);
		});
	}

	private applyDatabaseSearch(query: SelectQueryBuilder<MiPage>, searchText: string, provider: DatabaseSearchProvider): void {
		if (provider === 'sqlPgroonga') {
			query.andWhere("(page.title || ' ' || coalesce(page.summary, '') || ' ' || coalesce(page.content->0->>'text', '')) &@~ :searchText", { searchText });
		} else {
			query.andWhere("(page.title ILIKE :search OR page.summary ILIKE :search OR page.content->0->>'text' ILIKE :search)", {
				search: `%${sqlLikeEscape(searchText)}%`,
			});
		}
	}

	private async rankCandidates(query: SelectQueryBuilder<MiPage>, me: { id: string } | null, searchText?: string): Promise<string[]> {
		const candidates = query.clone().select(['page.id', 'page.userId', 'page.articleCategoryId', 'page.likedCount', 'page.articleViews']);
		const find = async (source: SelectQueryBuilder<MiPage>, sort: string[]) => {
			if (!searchText) return source.getMany();
			return this.searchIndexService.search('articles', searchText, source, { sort, limit: CANDIDATES_PER_SOURCE }, provider => {
				const databaseQuery = source.clone();
				this.applyDatabaseSearch(databaseQuery, searchText, provider);
				return runSearchQuery(databaseQuery);
			});
		};
		const sources = [
			find(candidates.clone().orderBy('page.id', 'DESC').limit(CANDIDATES_PER_SOURCE), ['createdAt:desc', 'id:desc']),
			find(candidates.clone().orderBy('page.likedCount', 'DESC').addOrderBy('page.id', 'DESC').limit(CANDIDATES_PER_SOURCE), ['likedCount:desc', 'id:desc']),
		];
		if (me) {
			sources.push(find(candidates.clone()
				.andWhere('page.userId IN (SELECT "followeeId" FROM following WHERE "followerId" = :recommendationViewer)', { recommendationViewer: me.id })
				.orderBy('page.id', 'DESC').limit(CANDIDATES_PER_SOURCE), ['createdAt:desc', 'id:desc']));
		}
		const pages = [...new Map((await Promise.all(sources)).flat().map(page => [page.id, page])).values()];
		const followings = me && pages.length > 0 ? await this.followingsRepository.find({
			where: { followerId: me.id, followeeId: In([...new Set(pages.map(page => page.userId))]) },
			select: { followeeId: true },
		}) : [];
		return rankArticles(pages.map(page => ({ ...page, createdAt: this.idService.parse(page.id).date.getTime() })), new Set(followings.map(following => following.followeeId)), Date.now());
	}

	private async cached<T>(operation: () => Promise<T>): Promise<T> {
		if (this.redisClient.status !== 'ready') throw new ApiError(meta.errors.recommendationUnavailable);
		let timeout: NodeJS.Timeout | undefined;
		try {
			return await Promise.race([
				operation(),
				new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new ApiError(meta.errors.recommendationUnavailable)), 2000); }),
			]);
		} catch {
			throw new ApiError(meta.errors.recommendationUnavailable);
		} finally {
			clearTimeout(timeout);
		}
	}

	private async recommended(query: SelectQueryBuilder<MiPage>, ps: SchemaType<typeof paramDef>, me: { id: string } | null) {
		let ids: string[];
		if (ps.recommendationId) {
			const filters = [me?.id ?? null, ps.userId ?? null, ps.categoryId ?? null, ps.tag ? normalizeTag(ps.tag).trim() : null, ps.following];
			if (ps.query != null) filters.push(this.searchIndexService.provider, ps.query.trim().toLowerCase());
			const scope = JSON.stringify(filters);
			const key = `article:recommendation:v1:${createHash('sha256').update(scope).digest('hex')}:${ps.recommendationId.toLowerCase()}`;
			let cachedIds = await this.cached(() => this.redisClient.get(key));
			if (cachedIds === null) {
				if (ps.recommendationCursor) throw new ApiError(meta.errors.recommendationExpired);
				const ranked = await this.rankCandidates(query, me, ps.query?.trim());
				const serialized = JSON.stringify(ranked);
				// 同一会话并发首屏请求只采用第一个快照，之后不随互动变化重排。
				const stored = await this.cached(() => this.redisClient.set(key, serialized, 'EX', SNAPSHOT_LIFETIME, 'NX'));
				cachedIds = stored === 'OK' ? serialized : await this.cached(() => this.redisClient.get(key));
				if (cachedIds === null) throw new ApiError(meta.errors.recommendationExpired);
			}
			ids = JSON.parse(cachedIds) as string[];
		} else {
			ids = await this.rankCandidates(query, me, ps.query?.trim());
		}
		const cursorIndex = ps.recommendationCursor ? ids.indexOf(ps.recommendationCursor) : -1;
		if (ps.recommendationCursor && cursorIndex < 0) throw new ApiError(meta.errors.invalidRecommendationCursor);
		const start = ps.recommendationId ? cursorIndex + 1 : ps.offset;
		const pages: MiPage[] = [];
		const batchSize = Math.max(50, ps.limit * 2);
		// 游标沿固定 ID 列表推进；每页重新校验权限，并跳过已删除或不可见的文章。
		for (let position = start; position < ids.length && pages.length < ps.limit; position += batchSize) {
			const batch = ids.slice(position, position + batchSize);
			const pageQuery = query.clone().andWhere('page.id IN (:...recommendationIds)', { recommendationIds: batch });
			const found = new Map((await runSearchQuery(pageQuery, { master: true })).map(page => [page.id, page]));
			for (const id of batch) {
				const page = found.get(id);
				if (page) pages.push(page);
				if (pages.length === ps.limit) break;
			}
		}
		return await this.pageEntityService.packMany(pages, me);
	}
}
