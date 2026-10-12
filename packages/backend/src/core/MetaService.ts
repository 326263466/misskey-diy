/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import * as Redis from 'ioredis';
import { CONTENT_LIMITS, DEFAULT_ARTICLE_TAGS } from 'misskey-js';
import { DI } from '@/di-symbols.js';
import { DEFAULT_ARTICLE_CATEGORIES, MiMeta } from '@/models/Meta.js';
import { MiHashtag } from '@/models/Hashtag.js';
import { MiPage } from '@/models/Page.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

@Injectable()
export class MetaService implements OnApplicationShutdown {
	public static InvalidArticleCategoriesError = class extends Error {};
	public static InvalidArticleTagsError = class extends Error {};

	private cache: MiMeta | undefined;
	private intervalId: NodeJS.Timeout;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.db)
		private db: DataSource,

		private idService: IdService,
		private featuredService: FeaturedService,
		private globalEventService: GlobalEventService,
	) {
		//this.onMessage = this.onMessage.bind(this);

		if (process.env.NODE_ENV !== 'test') {
			this.intervalId = setInterval(() => {
				this.fetch(true).then(meta => {
					// fetch内でもセットしてるけど仕様変更の可能性もあるため一応
					this.cache = meta;
				});
			}, 1000 * 60 * 5);
		}

		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'metaUpdated': {
					this.cache = { // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
						...(body.after),
						rootUser: null, // joinなカラムは通常取ってこないので
					};
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async fetch(noCache = false): Promise<MiMeta> {
		if (!noCache && this.cache) return this.cache;

		return await this.db.transaction(async transactionalEntityManager => {
			// 過去のバグでレコードが複数出来てしまっている可能性があるので新しいIDを優先する
			const metas = await transactionalEntityManager.find(MiMeta, {
				order: {
					id: 'DESC',
				},
			});

			const meta = metas[0];

			if (meta) {
				this.cache = meta;
				return meta;
			} else {
				// 并发初始化时保留另一请求已写入的配置。
				await transactionalEntityManager.createQueryBuilder()
					.insert()
					.into(MiMeta)
					.values({ id: 'x', articleCategories: DEFAULT_ARTICLE_CATEGORIES, articleTags: [...DEFAULT_ARTICLE_TAGS] })
					.orIgnore()
					.execute();
				await this.initializeArticleTags(transactionalEntityManager);
				const saved = await transactionalEntityManager.findOneByOrFail(MiMeta, { id: 'x' });

				this.cache = saved;
				return saved;
			}
		});
	}

	@bindThis
	private async initializeArticleTags(manager: EntityManager): Promise<void> {
		await manager.createQueryBuilder()
			.insert()
			.into(MiHashtag)
			.values(DEFAULT_ARTICLE_TAGS.map(name => ({ id: this.idService.gen(), name })))
			.orIgnore()
			.execute();
	}

	@bindThis
	public async updateArticleTags(update: (tags: readonly string[]) => string[]): Promise<{ before: MiMeta; after: MiMeta }> {
		await this.fetch();
		const result = await this.db.transaction(async manager => {
			const before = await manager.findOneOrFail(MiMeta, {
				where: {},
				order: { id: 'DESC' },
				lock: { mode: 'pessimistic_write' },
			});
			// 每次只改锁定后读到的当前列表，避免其他管理员的修改被旧页面覆盖。
			const articleTags = update(before.articleTags);
			await manager.update(MiMeta, before.id, { articleTags });
			return { before, after: { ...before, articleTags } };
		});

		this.cache = result.after;
		this.globalEventService.publishInternalEvent('metaUpdated', result);
		return result;
	}

	@bindThis
	public async update(data: Partial<MiMeta>): Promise<MiMeta> {
		let before: MiMeta | undefined;

		const updated = await this.db.transaction(async transactionalEntityManager => {
			before = await transactionalEntityManager.findOne(MiMeta, {
				where: {},
				order: {
					id: 'DESC',
				},
				lock: data.articleCategories || data.articleTags ? { mode: 'pessimistic_write' } : undefined,
			}) ?? undefined;

			// 与锁定后的数据库原值比较，允许保留历史名称，但不能新增或改成超限值。
			if (data.articleCategories?.some(category => Array.from(category.name).length > CONTENT_LIMITS.articleCategory
				&& !before?.articleCategories.some(previous => previous.id === category.id && previous.name === category.name))) {
				throw new MetaService.InvalidArticleCategoriesError();
			}
			if (data.articleTags?.some(tag => Array.from(tag).length > CONTENT_LIMITS.articleTag && !before?.articleTags.includes(tag))) {
				throw new MetaService.InvalidArticleTagsError();
			}

			if (before) {
				if (data.articleCategories) {
					const categoryIds = new Set(data.articleCategories.map(category => category.id));
					const removedIds = before.articleCategories.filter(category => !categoryIds.has(category.id)).map(category => category.id);
					if (removedIds.length > 0) {
						await transactionalEntityManager.update(MiPage, { articleCategoryId: In(removedIds) }, { articleCategoryId: null });
					}
				}
				await transactionalEntityManager.update(MiMeta, before.id, data);
			} else {
				await transactionalEntityManager.save(MiMeta, {
					articleCategories: DEFAULT_ARTICLE_CATEGORIES,
					articleTags: [...DEFAULT_ARTICLE_TAGS],
					...data,
					id: 'x',
				});
				await this.initializeArticleTags(transactionalEntityManager);
			}

			const afters = await transactionalEntityManager.find(MiMeta, {
				order: {
					id: 'DESC',
				},
			});

			return afters[0];
		});

		if (data.hiddenTags) {
			process.nextTick(() => {
				const hiddenTags = new Set<string>(data.hiddenTags);
				if (before) {
					for (const previousHiddenTag of before.hiddenTags) {
						hiddenTags.delete(previousHiddenTag);
					}
				}

				for (const hiddenTag of hiddenTags) {
					this.featuredService.removeHashtagsFromRanking(hiddenTag);
				}
			});
		}

		this.globalEventService.publishInternalEvent('metaUpdated', { before, after: updated });

		return updated;
	}

	@bindThis
	public dispose(): void {
		clearInterval(this.intervalId);
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
