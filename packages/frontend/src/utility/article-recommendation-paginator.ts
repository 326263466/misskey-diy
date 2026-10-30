/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import type { Endpoints } from 'misskey-js';
import { Paginator } from '@/utility/paginator.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type Filters = Pick<Endpoints['articles/list']['req'], 'categoryId' | 'tag'>;

const PAGE_LIMIT = 30;

export class ArticleRecommendationPaginator extends Paginator<'articles/list'> {
	public loadError = ref<'expired' | 'failed' | null>(null);
	private session: { id: string };
	private filters: Filters;
	private cursor: string | undefined;

	constructor(filters: Filters = {}) {
		const session = { id: '' };
		const params = { ...filters, sort: 'recommended' as const };
		super('articles/list', {
			limit: 20,
			canFetchDetection: 'limit',
			params: () => ({ ...params, recommendationId: session.id }),
		});
		this.session = session;
		this.filters = params;
		this.retry = this.retry.bind(this);
	}

	public override async init(): Promise<void> {
		const id = crypto.randomUUID();
		this.session.id = id;
		this.cursor = undefined;
		this.loadError.value = null;
		await super.init();
		if (this.session.id === id) this.cursor = this.items.value.at(-1)?.id;
	}

	public override async fetchOlder(): Promise<void> {
		if (!this.canFetchOlder.value || this.fetching.value || this.fetchingOlder.value || !this.cursor) return;
		const id = this.session.id;
		this.fetchingOlder.value = true;
		try {
			const articles = await misskeyApi('articles/list', {
				...this.filters,
				sort: 'recommended',
				recommendationId: id,
				recommendationCursor: this.cursor,
				limit: PAGE_LIMIT,
			});
			if (this.session.id !== id) return;
			// 游标记录服务端返回位置，不跟随列表删项或展示顺序变化。
			this.cursor = articles.at(-1)?.id ?? this.cursor;
			const displayed = new Set(this.items.value.map(article => article.id));
			this.pushItems(articles.filter(article => !displayed.has(article.id)));
			this.canFetchOlder.value = articles.length === PAGE_LIMIT;
		} catch (error) {
			if (this.session.id !== id) return;
			const code = (error as { code?: string } | null)?.code;
			this.loadError.value = code === 'RECOMMENDATION_EXPIRED' || code === 'INVALID_RECOMMENDATION_CURSOR' ? 'expired' : 'failed';
			this.canFetchOlder.value = false;
		} finally {
			if (this.session.id === id) this.fetchingOlder.value = false;
		}
	}

	public override fetchNewer(): Promise<void> {
		return Promise.resolve();
	}

	public retry(): Promise<void> {
		if (this.loadError.value === 'expired') return this.reload();
		this.loadError.value = null;
		this.canFetchOlder.value = true;
		return this.fetchOlder();
	}
}
