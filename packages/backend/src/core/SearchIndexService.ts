/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MeilisearchApiError } from 'meilisearch';
import type { ObjectLiteral, QueryRunner, SelectQueryBuilder } from 'typeorm';
import type { Meilisearch, SearchParams, Settings } from 'meilisearch';
import type { Config, FulltextSearchProvider } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { MiSearchIndexJob, MiSearchIndexState } from '@/models/SearchIndex.js';
import type { SearchIndexKind } from '@/models/SearchIndex.js';
import { IdService } from '@/core/IdService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { runSearchQuery, searchProviderErrors } from '@/misc/search-query.js';
import type { DatabaseSearchProvider } from '@/misc/search-query.js';
import { ApiError } from '@/server/api/error.js';
import type Logger from '@/logger.js';

const kinds: SearchIndexKind[] = ['notes', 'articles', 'users'];
const batchSize = 100;
const maxHits = 10000;
const lockId = 1793091571;

const settings: Record<SearchIndexKind, Settings> = {
	notes: {
		searchableAttributes: ['text', 'cw'],
		filterableAttributes: ['createdAt', 'userId', 'userHost', 'channelId'],
		sortableAttributes: ['createdAt', 'popularity', 'id'],
	},
	articles: {
		searchableAttributes: ['title', 'summary', 'text'],
		filterableAttributes: ['createdAt', 'userId', 'categoryId', 'tags'],
		sortableAttributes: ['createdAt', 'likedCount', 'id'],
	},
	users: {
		searchableAttributes: ['name', 'username', 'description'],
		filterableAttributes: ['host', 'updatedAt'],
		sortableAttributes: ['updatedAt', 'id'],
	},
};

export function searchFilterValue(value: string): string {
	return JSON.stringify(value);
}

@Injectable()
export class SearchIndexService {
	private diagnosticAfter = 0;
	private readonly target: string;
	private readonly logger: Logger;

	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.meilisearch) private meilisearch: Meilisearch | null,
		@Inject(DI.db) private db: DataSource,
		private idService: IdService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('search-index');
		const connection = config.meilisearch;
		this.target = createHash('sha256').update(JSON.stringify([
			connection?.host, connection?.port, connection?.ssl, connection?.index,
			connection?.scope ?? 'local', settings,
		])).digest('hex');
	}

	public get provider(): FulltextSearchProvider {
		return this.config.fulltextSearch.provider;
	}

	public async process(): Promise<void> {
		await this.synchronize(false);
	}

	public async rebuild(): Promise<void> {
		if (this.provider !== 'meilisearch' || !this.meilisearch) throw new Error('请先在 .config/default.yml 中选择并配置 meilisearch。');
		await this.synchronize(true);
	}

	private index(kind: SearchIndexKind) {
		return this.meilisearch!.index(`${this.config.meilisearch!.index}---${kind}`);
	}

	private async wait(task: { taskUid: number }): Promise<void> {
		const result = await this.meilisearch!.tasks.waitForTask(task.taskUid, { timeout: 60000 });
		if (result.status !== 'succeeded') throw new Error(`搜索索引任务失败：${result.error?.message ?? result.status}`);
	}

	private async synchronize(rebuild: boolean): Promise<void> {
		const drain = rebuild;
		const runner = this.db.createQueryRunner('master');
		let locked = false;
		try {
			await runner.connect();
			if (rebuild) {
				await runner.query('SELECT pg_advisory_lock($1)', [lockId]);
				locked = true;
			} else {
				locked = (await runner.query('SELECT pg_try_advisory_lock($1) AS locked', [lockId]))[0].locked;
			}
			if (!locked) return;
			await runner.query('INSERT INTO search_index_state (id) VALUES (0) ON CONFLICT DO NOTHING');
			if (this.provider !== 'meilisearch') {
				const [, changed] = await runner.query("UPDATE search_index_state SET enabled = false, ready = false, target = '' WHERE id = 0 AND enabled");
				if (changed) await runner.query('DELETE FROM search_index_job');
				return;
			}
			if (!this.meilisearch) throw new Error('已选择 meilisearch，但缺少连接配置。');
			const state = await runner.manager.findOneByOrFail(MiSearchIndexState, { id: 0 });
			if (!rebuild && state.target === this.target) {
				try {
					for (const kind of kinds) await this.index(kind).fetchInfo();
				} catch (error) {
					if (!(error instanceof MeilisearchApiError) || error.cause?.code !== 'index_not_found') throw error;
					rebuild = true;
				}
			}
			if (rebuild || state.target !== this.target || !state.enabled) {
				await runner.startTransaction();
				// 等待启用前的写入事务完成，避免它们既错过回填快照又没有产生 outbox。
				await runner.query('LOCK TABLE note, page, "user", user_profile IN SHARE MODE');
				await runner.query("UPDATE search_index_state SET enabled = true, ready = false, target = '' WHERE id = 0");
				await runner.commitTransaction();
				for (const kind of kinds) {
					await this.wait(await this.index(kind).updateSettings({
						...settings[kind],
						rankingRules: kind === 'users' ? ['words', 'typo', 'attribute', 'sort', 'proximity', 'exactness'] : ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
						typoTolerance: { enabled: false },
						pagination: { maxTotalHits: maxHits },
					}));
					await this.wait(await this.index(kind).deleteAllDocuments());
				}
				// 与业务写入同事务的 outbox 防止离线丢更新；回填不覆盖期间产生的新版本。
				for (const [kind, table] of [['notes', 'note'], ['articles', 'page'], ['users', 'user']]) {
					await runner.query(`INSERT INTO search_index_job (kind, "documentId") SELECT $1, id FROM "${table}" ON CONFLICT DO NOTHING`, [kind]);
				}
				await runner.query('UPDATE search_index_state SET target = $1 WHERE id = 0', [this.target]);
				this.logger.info('开始回填文章、帖子和用户搜索索引；完成前搜索暂不可用。');
			}
			do {
				const jobs = await runner.manager.find(MiSearchIndexJob, { order: { updatedAt: 'ASC', kind: 'ASC', documentId: 'ASC' }, take: batchSize });
				if (jobs.length === 0) {
					await runner.query('UPDATE search_index_state SET ready = true WHERE id = 0 AND NOT ready');
					break;
				}
				for (const kind of kinds) {
					const batch = jobs.filter(job => job.kind === kind);
					if (batch.length === 0) continue;
					const ids = batch.map(job => job.documentId);
					const documents = await this.documents(runner, kind, ids);
					const found = new Set(documents.map(document => document.id));
					const removed = ids.filter(id => !found.has(id));
					if (documents.length) await this.wait(await this.index(kind).addDocuments(documents, { primaryKey: 'id' }));
					if (removed.length) await this.wait(await this.index(kind).deleteDocuments(removed));
					await runner.query(`DELETE FROM search_index_job job USING jsonb_to_recordset($1::jsonb) AS done("documentId" varchar, revision bigint)
						WHERE job.kind = $2 AND job."documentId" = done."documentId" AND job.revision = done.revision`, [JSON.stringify(batch), kind]);
				}
			} while (drain);
		} finally {
			try {
				if (runner.isTransactionActive) await runner.rollbackTransaction();
				if (locked) await runner.query('SELECT pg_advisory_unlock($1)', [lockId]);
			} finally {
				await runner.release();
			}
		}
	}

	private async documents(runner: QueryRunner, kind: SearchIndexKind, ids: string[]): Promise<Record<string, unknown>[]> {
		if (kind === 'notes') {
			const notes = await runner.query(`SELECT id, text, cw, "userId", "userHost", "channelId",
				"repliesCount"::bigint + "renoteCount"::bigint + COALESCE((SELECT SUM(value::bigint) FROM jsonb_each_text(reactions)), 0) AS popularity
				FROM note WHERE id = ANY($1::varchar[]) AND (text IS NOT NULL OR cw IS NOT NULL) AND "deletedBy" IS NULL AND visibility IN ('public', 'home')`, [ids]);
			const scope = this.config.meilisearch?.scope ?? 'local';
			return notes.filter((note: { userHost: string | null }) => scope === 'global' || note.userHost === null || (Array.isArray(scope) && scope.includes(note.userHost)))
				.map((note: { id: string; popularity: string | number }) => ({ ...note, popularity: Number(note.popularity), createdAt: this.idService.parse(note.id).date.getTime() }));
		}
		if (kind === 'articles') {
			const pages = await runner.query(`SELECT id, title, summary, content->0->>'text' AS text, "userId", "articleCategoryId" AS "categoryId",
				COALESCE(content->0->'articleTags', '[]'::jsonb) AS tags, "likedCount"
				FROM page WHERE id = ANY($1::varchar[]) AND visibility = 'public' AND jsonb_array_length(content) = 1
				AND content->0->>'type' = 'markdown' AND jsonb_typeof(content->0->'text') = 'string'`, [ids]);
			return pages.map((page: { id: string }) => ({ ...page, createdAt: this.idService.parse(page.id).date.getTime() }));
		}
		const users = await runner.query(`SELECT u.id, u.name, u."usernameLower" AS username, u.host, u."updatedAt", p.description
			FROM "user" u LEFT JOIN user_profile p ON p."userId" = u.id
			WHERE u.id = ANY($1::varchar[]) AND NOT u."isSuspended" AND NOT u."isDeleted"`, [ids]);
		return users.map((user: { id: string; updatedAt: Date | null }) => ({ ...user, updatedAt: user.updatedAt?.getTime() ?? 0 }));
	}

	private unavailable(reason: string, error?: unknown): ApiError {
		if (Date.now() >= this.diagnosticAfter) {
			this.diagnosticAfter = Date.now() + 30000;
			this.logger.warn(reason, error == null ? undefined : { error });
		}
		return new ApiError(searchProviderErrors.searchUnavailable);
	}

	public async search<T extends ObjectLiteral & { id: string }>(
		kind: SearchIndexKind,
		text: string,
		query: SelectQueryBuilder<T>,
		options: Pick<SearchParams, 'sort' | 'filter' | 'attributesToSearchOn'> & { limit: number; offset?: number },
		databaseSearch: (provider: DatabaseSearchProvider) => Promise<T[]>,
	): Promise<T[]> {
		const provider = this.provider;
		if (provider === 'sqlLike') return databaseSearch(provider);
		if (provider === 'sqlPgroonga') {
			try {
				return await databaseSearch(provider);
			} catch (error) {
				if (error instanceof ApiError) throw error;
				throw this.unavailable('PGroonga 查询失败，请检查扩展和索引。', error);
			}
		}
		if (!this.meilisearch) throw this.unavailable('已选择 meilisearch，但缺少连接配置。请检查 .config/default.yml。');
		const [state] = await this.db.query<Pick<MiSearchIndexState, 'ready' | 'target'>[]>('SELECT ready, target FROM search_index_state WHERE id = 0');
		if (!state?.ready || state.target !== this.target) {
			throw this.unavailable('Meilisearch 首次回填或重建未完成。可运行 pnpm --filter backend cli rebuild-search 检查。');
		}
		const results: T[] = [];
		let skipped = 0;
		const deadline = Date.now() + 2500;
		const signal = AbortSignal.timeout(2500);
		let candidates: string[];
		try {
			// 一次读取形成请求内快照，避免同步写入使补批的 offset 漂移、重复或漏项。
			const result = await this.index(kind).search<{ id: string }>(text, {
				filter: options.filter,
				sort: options.sort,
				attributesToSearchOn: options.attributesToSearchOn,
				attributesToRetrieve: ['id'],
				matchingStrategy: 'all',
				limit: maxHits,
			}, { signal });
			candidates = result.hits.map(hit => hit.id);
		} catch (error) {
			throw this.unavailable('Meilisearch 查询失败，请检查连接、认证及索引状态。', error);
		}
		for (let offset = 0; offset < candidates.length; offset += batchSize) {
			const ids = candidates.slice(offset, offset + batchSize);
			// 索引只提供候选 ID；权限、删除、拉黑与屏蔽始终由数据库复核，并在分页前过滤。
			const rows = await runSearchQuery(query.clone().andWhere(`${query.alias}.id IN (:...searchIds)`, { searchIds: ids }).limit(undefined).offset(undefined), { deadline, master: true });
			const found = new Map(rows.map(row => [row.id, row]));
			for (const id of ids) {
				const row = found.get(id);
				if (!row) continue;
				if (skipped++ < (options.offset ?? 0)) continue;
				results.push(row);
				if (results.length >= options.limit) return results;
			}
		}
		return results;
	}
}
