/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { miLocalStorage } from '@/local-storage.js';
import { getVisibleTrends, MAX_TRENDS, mergeTrendsWithCache, readTrendsCache, saveTrendsCache } from '@/utility/trends-cache.js';

const now = 1000000000;
const oneYear = 365 * 24 * 60 * 60 * 1000;
const stat = (tag: string, usersCount = 2) => ({ tag, usersCount, chart: [0, 1, usersCount] });

afterEach(() => {
	vi.restoreAllMocks();
	miLocalStorage.removeItem('trendsCache');
});

describe('trend backfill cache', () => {
	test('places live topics first and fills to five with distinct older topics', () => {
		const previous = mergeTrendsWithCache(['A', 'B', 'C', 'D', 'E'].map(tag => stat(tag)), null, now);
		const merged = mergeTrendsWithCache([stat('B', 10), stat('X')], previous, now + 1000);
		expect(getVisibleTrends(merged, now + 1000)).toEqual([stat('B', 10), stat('X'), stat('A'), stat('C'), stat('D')]);
		expect(merged.entries.map(entry => entry.fetchedAt)).toEqual([now + 1000, now + 1000, now, now, now]);
	});

	test('keeps the original live ranking when at least five topics are available', () => {
		const fresh = Array.from({ length: 10 }, (_, i) => stat(`tag-${i}`));
		const previous = mergeTrendsWithCache([stat('old')], null, now);
		expect(getVisibleTrends(mergeTrendsWithCache(fresh, previous, now), now)).toEqual(fresh.slice(0, MAX_TRENDS));
	});

	test('leaves missing rows empty when there is not enough history, including a new browser', () => {
		expect(getVisibleTrends(mergeTrendsWithCache([], null, now), now)).toEqual([]);
		expect(getVisibleTrends(mergeTrendsWithCache([stat('only')], null, now), now)).toEqual([stat('only')]);
	});

	test('does not extend old timestamps on partial or empty refreshes', () => {
		const previous = mergeTrendsWithCache([stat('old')], null, now);
		const updated = mergeTrendsWithCache([stat('new')], previous, now + 1000);
		const empty = mergeTrendsWithCache([], updated, now + 2000);
		expect(empty.entries.map(entry => entry.fetchedAt)).toEqual([now + 1000, now]);
		expect(getVisibleTrends(empty, now + oneYear)).toEqual([stat('new'), stat('old')]);
		expect(mergeTrendsWithCache([], empty, now + oneYear)).toEqual(empty);
		expect(getVisibleTrends(mergeTrendsWithCache([stat('latest')], empty, now + oneYear), now + oneYear)).toEqual([stat('latest'), stat('new'), stat('old')]);
		expect(getVisibleTrends(empty, now - 1)).toEqual([]);
	});

	test('persists each topic timestamp across widget instances', () => {
		const saved = mergeTrendsWithCache([stat('A'), stat('B', 0)], null, now);
		saveTrendsCache(saved);
		expect(readTrendsCache(now + 1000)).toEqual(saved);
		expect(readTrendsCache(now + oneYear)).toEqual(saved);
	});

	test('rejects malformed and future timestamps without expiring old entries', () => {
		const valid = mergeTrendsWithCache([stat('old')], null, now);
		const invalid = [NaN, Infinity, now + 1].map(fetchedAt => ({ stat: stat('invalid'), fetchedAt }));
		const snapshot = { entries: [...invalid, ...valid.entries] };
		expect(getVisibleTrends(snapshot, now)).toEqual([stat('old')]);
		expect(mergeTrendsWithCache([], snapshot, now)).toEqual(valid);
		saveTrendsCache(snapshot);
		expect(readTrendsCache(now)).toEqual(valid);
	});

	test.each(['{', 'null', '[]', '{"version":42}', '{"version":2,"origin":"https://another.example"}'])('ignores invalid stored data: %s', value => {
		miLocalStorage.setItem('trendsCache', value);
		expect(readTrendsCache(now)).toBeNull();
	});

	test('filters malformed and duplicate rows while retaining valid zero-count topics', () => {
		const saved = mergeTrendsWithCache([stat('zero', 0)], null, now);
		saveTrendsCache(saved);
		const stored = JSON.parse(miLocalStorage.getItem('trendsCache')!);
		stored.entries = [null, { fetchedAt: now, stat: { tag: 'bad', usersCount: '1', chart: [] } }, { fetchedAt: now, stat: { tag: 'negative', usersCount: -1, chart: [] } }, { fetchedAt: now, stat: { tag: 'chart', usersCount: 1, chart: ['bad'] } }, ...saved.entries, ...saved.entries];
		miLocalStorage.setItem('trendsCache', JSON.stringify(stored));
		expect(readTrendsCache(now)).toEqual(saved);
	});

	test('tolerates unavailable storage and clears empty snapshots', () => {
		const saved = mergeTrendsWithCache([stat('A')], null, now);
		saveTrendsCache(saved);
		saveTrendsCache({ entries: [] });
		expect(readTrendsCache(now)).toBeNull();
		vi.spyOn(miLocalStorage, 'getItem').mockImplementation(() => { throw new Error('Storage disabled'); });
		vi.spyOn(miLocalStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
		expect(readTrendsCache(now)).toBeNull();
		expect(() => saveTrendsCache(saved)).not.toThrow();
	});
});
