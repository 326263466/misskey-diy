/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { HashtagService } from '@/core/HashtagService.js';
import { UtilityService } from '@/core/UtilityService.js';
import HashtagTrends from '@/server/api/endpoints/hashtags/trend.js';

type Candidate = { id: string; name: string; mentionedUsersCount: number };

function createService(rows: Candidate[] = [], hiddenTags: string[] = [], sensitiveWords: string[] = []) {
	const db = new DataSource({ type: 'postgres' });
	const queries: ReturnType<typeof db.createQueryBuilder>[] = [];
	const repository = {
		createQueryBuilder: vi.fn(() => {
			const query = db.createQueryBuilder().from('hashtag', 'tag');
			vi.spyOn(query, 'getMany').mockImplementation(async () => {
				expect(query.getQuery()).toContain('tag.mentionedUsersCount > 0');
				expect(query.getQuery()).toContain('ORDER BY tag.mentionedUsersCount DESC, tag.id DESC');
				const { count, id } = query.getParameters();
				if (id != null) expect(query.getQuery()).toContain('tag.id < :id');
				return rows.filter(row => row.mentionedUsersCount > 0 && (id == null || row.mentionedUsersCount < count || (row.mentionedUsersCount === count && row.id < id)))
					.sort((a, b) => b.mentionedUsersCount - a.mentionedUsersCount || b.id.localeCompare(a.id))
					.slice(0, query.expressionMap.limit);
			});
			queries.push(query);
			return query;
		}),
	};
	const utility = Object.create(UtilityService.prototype) as UtilityService;
	const service = new HashtagService(db, { hiddenTags, sensitiveWords } as never, {} as never, repository as never, {} as never, {} as never, {} as never, utility);
	return { service, repository, queries };
}

function candidates(names: string[]): Candidate[] {
	return names.map((name, i) => ({ id: String(1000 - i), name, mentionedUsersCount: 100 - i }));
}

describe('hashtag trend history', () => {
	test.each([5, 10])('preserves all %s live topics without querying history', async count => {
		const { service, repository } = createService();
		const ranking = Array.from({ length: count }, (_, i) => `live${i}`);
		expect(await service.backfillHashtagsRanking(ranking)).toBe(ranking);
		expect(repository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('keeps the live order and fills only missing slots with distinct historical topics', async () => {
		const { service } = createService(candidates(['liveb', 'ＬＩＶＥＡ', 'old1', 'old2', 'old3', 'old4']));
		expect(await service.backfillHashtagsRanking(['livea', 'liveb'])).toEqual(['livea', 'liveb', 'old1', 'old2', 'old3']);
	});

	test('filters hidden, sensitive and profile-only topics and continues past a filtered page', async () => {
		const filtered = candidates(Array.from({ length: 50 }, (_, i) => `blocked${i}`));
		const { service, repository } = createService([
			...filtered,
			{ id: '030', name: 'hidden', mentionedUsersCount: 30 },
			{ id: '029', name: 'profile', mentionedUsersCount: 0 },
			{ id: '028', name: 'old1', mentionedUsersCount: 20 },
			{ id: '027', name: 'old2', mentionedUsersCount: 20 },
			{ id: '026', name: 'old3', mentionedUsersCount: 10 },
		], ['ＨＩＤＤＥＮ'], ['/blocked\\d+/']);
		expect(await service.backfillHashtagsRanking(['live1', 'live2'])).toEqual(['live1', 'live2', 'old1', 'old2', 'old3']);
		expect(repository.createQueryBuilder).toHaveBeenCalledTimes(2);
	});

	test('returns available topics when history is empty or has fewer than five', async () => {
		expect(await createService().service.backfillHashtagsRanking([])).toEqual([]);
		expect(await createService(candidates(['old'])).service.backfillHashtagsRanking(['live'])).toEqual(['live', 'old']);
	});

	test('keeps live results when historical discovery fails', async () => {
		const { service, repository } = createService();
		repository.createQueryBuilder.mockImplementation(() => { throw new Error('database unavailable'); });
		expect(await service.backfillHashtagsRanking(['live'])).toEqual(['live']);
	});

	test('gets real current charts for both live and historical tags without changing the API shape', async () => {
		const { service } = createService(candidates(['old1', 'old2', 'old3']));
		const featured = { getHashtagsRanking: vi.fn().mockResolvedValue(['live1', 'live2']) };
		const charts = { live1: [1, 2], live2: [3, 0], old1: [0, 0], old2: [0, 1], old3: [0, 0] };
		vi.spyOn(service, 'getCharts').mockResolvedValue(charts);
		const endpoint = new HashtagTrends(featured as never, service);
		const result = await endpoint.exec({}, null, null);
		expect(featured.getHashtagsRanking).toHaveBeenCalledWith(10);
		expect(service.getCharts).toHaveBeenCalledWith(['live1', 'live2', 'old1', 'old2', 'old3'], 20);
		expect(result).toEqual(Object.entries(charts).map(([tag, chart]) => ({ tag, chart, usersCount: Math.max(...chart) })));
	});
});
