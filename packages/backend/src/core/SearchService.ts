/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import type { MiNote, MiUser, NotesRepository } from '@/models/_.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { runSearchQuery } from '@/misc/search-query.js';
import { QueryService } from '@/core/QueryService.js';
import { IdService } from '@/core/IdService.js';
import { SearchIndexService, searchFilterValue } from '@/core/SearchIndexService.js';

export type SearchOpts = {
	userId?: MiNote['userId'] | null;
	channelId?: MiNote['channelId'] | null;
	host?: string | null;
	rangeStartAt?: number | null;
	rangeEndAt?: number | null;
	sort?: 'time' | 'popularity';
	order?: 'asc' | 'desc';
};

export type SearchPagination = {
	untilId?: MiNote['id'];
	sinceId?: MiNote['id'];
	limit: number;
	offset?: number;
};

@Injectable()
export class SearchService {
	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.notesRepository) private notesRepository: NotesRepository,
		private queryService: QueryService,
		private idService: IdService,
		private searchIndexService: SearchIndexService,
	) {}

	@bindThis
	public async searchNote(q: string, me: MiUser | null, opts: SearchOpts, pagination: SearchPagination): Promise<MiNote[]> {
		q = q.trim();
		if (!q) return [];
		const provider = this.config.fulltextSearch.provider;
		const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), pagination.sinceId, pagination.untilId)
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser');
		const filter: string[] = [];
		if (opts.userId) {
			query.andWhere('note.userId = :userId', { userId: opts.userId });
			filter.push(`userId = ${searchFilterValue(opts.userId)}`);
		}
		if (opts.channelId) {
			query.andWhere('note.channelId = :channelId', { channelId: opts.channelId });
			filter.push(`channelId = ${searchFilterValue(opts.channelId)}`);
		}
		if (opts.host) {
			if (opts.host === '.') {
				query.andWhere('note.userHost IS NULL');
				filter.push('userHost IS NULL');
			} else {
				query.andWhere('note.userHost = :host', { host: opts.host });
				filter.push(`userHost = ${searchFilterValue(opts.host)}`);
			}
		}
		const scope = provider === 'meilisearch' ? this.config.meilisearch?.scope ?? 'local' : undefined;
		if (provider === 'meilisearch') query.andWhere("note.visibility IN ('public', 'home')");
		if (scope === 'local') query.andWhere('note.userHost IS NULL');
		else if (Array.isArray(scope)) {
			if (scope.length) query.andWhere('(note.userHost IS NULL OR note.userHost IN (:...searchHosts))', { searchHosts: scope });
			else query.andWhere('note.userHost IS NULL');
		}
		if (pagination.untilId) filter.push(`createdAt <= ${this.idService.parse(pagination.untilId).date.getTime()}`);
		if (pagination.sinceId) filter.push(`createdAt >= ${this.idService.parse(pagination.sinceId).date.getTime()}`);
		if (opts.rangeStartAt != null) {
			query.andWhere('note.id >= :rangeStartAt', { rangeStartAt: this.idService.getTimeBoundary(opts.rangeStartAt) });
			filter.push(`createdAt >= ${opts.rangeStartAt}`);
		}
		if (opts.rangeEndAt != null) {
			query.andWhere('note.id < :rangeEndAt', { rangeEndAt: this.idService.getTimeBoundary(opts.rangeEndAt + 1) });
			filter.push(`createdAt <= ${opts.rangeEndAt}`);
		}
		this.queryService.generateVisibilityQuery(query, me);
		if (me == null) this.queryService.generateUgcVisibilityQueryForVisitor(query);
		this.queryService.generateBaseNoteFilteringQuery(query, me);

		const direction = opts.order ?? (opts.sort == null && pagination.sinceId && !pagination.untilId ? 'asc' : 'desc');
		return this.searchIndexService.search('notes', q, query, {
			filter,
			sort: [`${opts.sort === 'popularity' ? 'popularity' : 'createdAt'}:${direction}`, `id:${direction}`],
			limit: pagination.limit,
			offset: pagination.offset,
		}, provider => {
			const databaseQuery = query.clone();
			if (provider === 'sqlPgroonga') {
				databaseQuery.andWhere('note.text &@~ :searchText', { searchText: q });
			} else {
				databaseQuery.andWhere('LOWER(note.text) LIKE :q', { q: `%${sqlLikeEscape(q.toLowerCase())}%` });
			}
			if (opts.sort === 'popularity') {
				databaseQuery.addSelect('note."repliesCount"::bigint + note."renoteCount"::bigint + (SELECT COALESCE(SUM(value::bigint), 0) FROM jsonb_each_text(note.reactions))', 'search_popularity');
				databaseQuery.orderBy('search_popularity', direction === 'asc' ? 'ASC' : 'DESC').addOrderBy('note.id', direction === 'asc' ? 'ASC' : 'DESC');
			} else {
				databaseQuery.orderBy('note.id', direction === 'asc' ? 'ASC' : 'DESC');
			}
			return runSearchQuery(databaseQuery.offset(pagination.offset ?? 0).limit(pagination.limit));
		});
	}
}
