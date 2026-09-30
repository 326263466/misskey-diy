/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { misskeyApi } from '@/utility/misskey-api.js';

export const MAX_TOPIC_LENGTH = 128;
export const MAX_TOPICS = 1;
export const TOPIC_RESULT_LIMIT = 10;
export const TOPIC_SEARCH_DELAY = 250;

export function topicKey(tag: string): string {
	return tag.normalize('NFKC').toLowerCase();
}

export function parseTopic(value: string): string | null {
	const tag = value.trim().replace(/^#/, '');
	if (!tag || /\s/u.test(tag) || Array.from(tag).length > MAX_TOPIC_LENGTH || Array.from(topicKey(tag)).length > MAX_TOPIC_LENGTH) return null;
	const nodes = mfm.parse(`#${tag}`);
	return nodes.length === 1 && nodes[0].type === 'hashtag' && nodes[0].props.hashtag === tag ? tag : null;
}

export function uniqueTopics(values: string[]): string[] {
	const seen = new Set<string>();
	return values.flatMap(value => {
		const tag = parseTopic(value);
		if (tag == null || seen.has(topicKey(tag))) return [];
		seen.add(topicKey(tag));
		return [tag];
	});
}

export function parseTopics(value: string): string[] {
	return uniqueTopics(value.split(/\s+/u));
}

/** Shared, bounded cache; concurrent pickers reuse the same public search request. */
export function createTopicSearch(fetchTopics: (query: string) => Promise<string[]>, { ttl = 60_000, capacity = 40 } = {}): (query: string) => Promise<string[]> {
	const cache = new Map<string, { expires: number; tags: string[] }>();
	const pending = new Map<string, Promise<string[]>>();
	return (query: string): Promise<string[]> => {
		const tag = query === '' ? '' : parseTopic(query);
		if (tag == null) return Promise.resolve([]);
		const key = topicKey(tag);
		const hit = cache.get(key);
		if (hit && hit.expires > Date.now()) {
			cache.delete(key);
			cache.set(key, hit);
			return Promise.resolve([...hit.tags]);
		}
		cache.delete(key);
		const inFlight = pending.get(key);
		if (inFlight) return inFlight.then(tags => [...tags]);
		const request = fetchTopics(key).then(values => {
			const tags = uniqueTopics(values).slice(0, TOPIC_RESULT_LIMIT);
			cache.set(key, { tags, expires: Date.now() + ttl });
			while (cache.size > capacity) cache.delete(cache.keys().next().value!);
			return tags;
		}).finally(() => pending.delete(key));
		pending.set(key, request);
		return request.then(tags => [...tags]);
	};
}

export const searchTopics = createTopicSearch(async query => {
	const signal = AbortSignal.timeout(10_000);
	if (query === '') return (await misskeyApi('hashtags/trend', {}, undefined, signal)).map(item => item.tag);
	return misskeyApi('hashtags/search', { query, limit: TOPIC_RESULT_LIMIT }, undefined, signal);
});
