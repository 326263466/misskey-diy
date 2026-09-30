/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createTopicSearch, MAX_TOPIC_LENGTH, parseTopic, parseTopics, TOPIC_RESULT_LIMIT } from '@/utility/topic-picker.js';

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));

afterEach(() => vi.useRealTimers());

describe('topic validation', () => {
	test('accepts whole MFM hashtags and rejects text that would silently split when published', () => {
		for (const value of ['Vue', '#日常', '#hello_world', 'café']) expect(parseTopic(value)).toBe(value.replace(/^#/, ''));
		for (const value of ['', '#', 'two words', 'foo#bar', 'foo,bar', '<script>']) expect(parseTopic(value)).toBeNull();
		expect(parseTopic('a'.repeat(MAX_TOPIC_LENGTH))).toHaveLength(MAX_TOPIC_LENGTH);
		expect(parseTopic('a'.repeat(MAX_TOPIC_LENGTH + 1))).toBeNull();
		// NFKC can expand characters before the backend writes its 128-character column.
		expect(parseTopic('㍿'.repeat(33))).toBeNull();
	});

	test('deduplicates NFKC/case variants while retaining the first display spelling', () => {
		expect(parseTopics('#Vue vue #ＶＵＥ #日常 日常')).toEqual(['Vue', '日常']);
	});
});

describe('topic search cache', () => {
	test('deduplicates concurrent requests and bounds results', async () => {
		const fetch = vi.fn(async () => ['Vue', 'ＶＵＥ', ...Array.from({ length: 20 }, (_, index) => `vue${index}`)]);
		const search = createTopicSearch(fetch);
		const [first, second] = await Promise.all([search('Vue'), search('#ＶＵＥ')]);
		expect(fetch).toHaveBeenCalledOnce();
		expect(fetch).toHaveBeenCalledWith('vue');
		expect(first).toHaveLength(TOPIC_RESULT_LIMIT);
		expect(second).toEqual(first);
		first.push('changed');
		expect(await search('vue')).not.toContain('changed');
	});

	test('expires old entries and evicts the least recently used entry', async () => {
		vi.useFakeTimers();
		const fetch = vi.fn(async query => [query]);
		const search = createTopicSearch(fetch, { ttl: 60_000, capacity: 2 });
		await search('a'); await search('b'); await search('a'); await search('c');
		expect(fetch).toHaveBeenCalledTimes(3);
		await search('b');
		expect(fetch).toHaveBeenCalledTimes(4);
		await vi.advanceTimersByTimeAsync(60_001);
		await search('b');
		expect(fetch).toHaveBeenCalledTimes(5);
	});

	test('does not send invalid queries and retries failed requests', async () => {
		const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(['Vue']);
		const search = createTopicSearch(fetch);
		expect(await search('bad query')).toEqual([]);
		expect(fetch).not.toHaveBeenCalled();
		await expect(search('vue')).rejects.toThrow('offline');
		expect(await search('vue')).toEqual(['Vue']);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
