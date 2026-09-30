/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { FanoutTimelineService, type FanoutTimelineName } from '@/core/FanoutTimelineService.js';

describe('channel-inclusive timeline cache version', () => {
	test.each<[FanoutTimelineName, string]>([
		['homeTimeline:user', 'list:v2:homeTimeline:user'],
		['homeTimelineWithFiles:user', 'list:v2:homeTimelineWithFiles:user'],
		['localTimeline', 'list:v2:localTimeline'],
		['localTimelineWithFiles', 'list:v2:localTimelineWithFiles'],
		['localTimelineWithReplies', 'list:v2:localTimelineWithReplies'],
		['localTimelineWithReplyTo:user', 'list:v2:localTimelineWithReplyTo:user'],
		['channelTimeline:channel', 'list:channelTimeline:channel'],
		['userTimeline:user', 'list:userTimeline:user'],
		['userListTimeline:list', 'list:userListTimeline:list'],
	])('uses the same key for every operation on %s', async (timeline, key) => {
		const pipeline = { lpush: vi.fn(), ltrim: vi.fn(), lrange: vi.fn(), eval: vi.fn(), exec: vi.fn().mockResolvedValue([[null, []]]) };
		const redis = { pipeline: () => pipeline, lrange: vi.fn().mockResolvedValue([]), del: vi.fn(), lrem: vi.fn(), lindex: vi.fn().mockResolvedValue(null), lpush: vi.fn() };
		const parse = vi.fn(() => ({ date: new Date() }));
		const service = new FanoutTimelineService(redis as never, { parse } as never);
		vi.spyOn(Math, 'random').mockReturnValue(0);
		service.push(timeline, 'note', 100, pipeline as never);
		expect(pipeline.lpush).toHaveBeenCalledWith(key, 'note');
		expect(pipeline.ltrim).toHaveBeenCalledWith(key, 0, 99);
		service.updateFiles(timeline, 'note', true, 100, pipeline as never);
		expect(pipeline.eval.mock.calls[0][2]).toBe(key);
		for (const [until, since] of [[null, null], ['z', null], [null, 'a'], ['z', 'a']]) {
			await service.get(timeline, until, since);
		}
		expect(redis.lrange.mock.calls.every(([readKey]) => readKey === key)).toBe(true);
		await service.getMulti([timeline]);
		expect(pipeline.lrange).toHaveBeenCalledWith(key, 0, -1);
		await service.purge(timeline);
		expect(redis.del).toHaveBeenCalledWith(key);
		await service.remove(timeline, 'note');
		expect(redis.lrem).toHaveBeenCalledWith(key, 1, 'note');
		parse.mockReturnValue({ date: new Date(0) });
		service.push(timeline, 'old-note', 100, pipeline as never);
		await Promise.resolve();
		expect(redis.lindex).toHaveBeenCalledWith(key, -1);
		expect(redis.lpush).toHaveBeenCalledWith(key, 'old-note');
	});
});
