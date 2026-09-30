/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { url as local } from '@@/js/config.js';
import { miLocalStorage } from '@/local-storage.js';

export const MAX_TRENDS = 5;

export type CachedTrend = {
	stat: Misskey.entities.HashtagsTrendResponse[number];
	fetchedAt: number;
};

export type TrendsSnapshot = {
	entries: CachedTrend[];
};

function hasValidTimestamp(entry: CachedTrend, now: number): boolean {
	return Number.isFinite(entry.fetchedAt) && now >= entry.fetchedAt;
}

function normalizeStats(input: unknown): Misskey.entities.HashtagsTrendResponse {
	if (!Array.isArray(input)) return [];
	const result: Misskey.entities.HashtagsTrendResponse = [];
	const seen = new Set<string>();
	for (const entry of input) {
		if (entry == null || typeof entry !== 'object') continue;
		if (typeof entry.tag !== 'string' || entry.tag.length === 0 || seen.has(entry.tag)) continue;
		if (typeof entry.usersCount !== 'number' || !Number.isFinite(entry.usersCount) || entry.usersCount < 0) continue;
		if (!Array.isArray(entry.chart) || !entry.chart.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) continue;
		result.push({ tag: entry.tag, usersCount: entry.usersCount, chart: entry.chart.slice(-20) });
		seen.add(entry.tag);
		if (result.length === MAX_TRENDS) break;
	}
	return result;
}

export function getVisibleTrends(snapshot: TrendsSnapshot | null, now = Date.now()): Misskey.entities.HashtagsTrendResponse {
	return snapshot?.entries.filter(entry => hasValidTimestamp(entry, now)).slice(0, MAX_TRENDS).map(entry => entry.stat) ?? [];
}

export function mergeTrendsWithCache(fresh: Misskey.entities.HashtagsTrendResponse, previous: TrendsSnapshot | null, now = Date.now()): TrendsSnapshot {
	const entries = normalizeStats(fresh).map(stat => ({ stat, fetchedAt: now }));
	const seen = new Set(entries.map(entry => entry.stat.tag));
	for (const entry of previous?.entries ?? []) {
		if (entries.length === MAX_TRENDS) break;
		if (!hasValidTimestamp(entry, now) || seen.has(entry.stat.tag)) continue;
		// Filling a gap must not make an old topic appear freshly observed.
		entries.push(entry);
		seen.add(entry.stat.tag);
	}
	return { entries };
}

export function readTrendsCache(now = Date.now()): TrendsSnapshot | null {
	try {
		const stored = miLocalStorage.getItem('trendsCache');
		if (stored == null) return null;
		const parsed = JSON.parse(stored);
		if (parsed?.version !== 2 || parsed.origin !== local || !Array.isArray(parsed.entries)) return null;
		const entries: CachedTrend[] = [];
		const seen = new Set<string>();
		for (const item of parsed.entries) {
			if (item == null || typeof item.fetchedAt !== 'number') continue;
			const stat = normalizeStats([item.stat])[0];
			if (stat == null || seen.has(stat.tag)) continue;
			const entry = { stat, fetchedAt: item.fetchedAt };
			if (!hasValidTimestamp(entry, now)) continue;
			entries.push(entry);
			seen.add(stat.tag);
			if (entries.length === MAX_TRENDS) break;
		}
		return entries.length > 0 ? { entries } : null;
	} catch {
		return null;
	}
}

export function saveTrendsCache(snapshot: TrendsSnapshot): void {
	try {
		if (snapshot.entries.length === 0) {
			miLocalStorage.removeItem('trendsCache');
		} else {
			miLocalStorage.setItem('trendsCache', JSON.stringify({ version: 2, origin: local, ...snapshot }));
		}
	} catch {
		// A disabled or full storage must not prevent showing the fetched trends.
	}
}
