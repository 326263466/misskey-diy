/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { HomeTimelineChannel } from '@/server/api/stream/channels/home-timeline.js';

function note(overrides = {}) {
	return { id: 'note', userId: 'author', userHost: null, user: { id: 'author' }, channelId: 'channel', visibility: 'public', fileIds: ['file'], visibleUserIds: [], ...overrides };
}

describe('channel notes in home timelines', () => {
	test('fans out to author, author followers, channel followers and local media timelines without duplicates', async () => {
		const push = vi.fn();
		const service = Object.assign(Object.create(NoteCreateService.prototype), {
			meta: { enableFanoutTimeline: true, perUserHomeTimelineCacheMax: 100, perLocalUserUserTimelineCacheMax: 100 },
			config: { perChannelMaxNoteCacheCount: 100 },
			redisForTimelines: { pipeline: () => ({ exec: vi.fn() }) },
			fanoutTimelineService: { push },
			channelFollowingsRepository: { find: vi.fn().mockResolvedValue([{ followerId: 'both' }, { followerId: 'channel-follower' }]) },
			followingsRepository: { find: vi.fn().mockResolvedValue([{ followerId: 'both' }, { followerId: 'author-follower' }]) },
		});
		await service.pushToTl(note(), { id: 'author', host: null });
		const timelines = push.mock.calls.map(([timeline]) => timeline);
		for (const recipient of ['author', 'both', 'channel-follower', 'author-follower']) {
			expect(timelines.filter(timeline => timeline === `homeTimeline:${recipient}`)).toHaveLength(1);
			expect(timelines).toContain(`homeTimelineWithFiles:${recipient}`);
		}
		expect(timelines).toContain('localTimeline');
		expect(timelines).toContain('localTimelineWithFiles');
	});

	test.each(['author', 'follower', 'channel-follower', 'stranger', 'muted'])('streams channel posts to %s according to subscription and mute rules', async (viewer) => {
		const channel = new HomeTimelineChannel({ id: 'home', connection: {
			user: { id: viewer },
			following: ['follower', 'muted'].includes(viewer) ? { author: {} } : {},
			followingChannels: new Set(viewer === 'channel-follower' ? ['channel'] : []),
			mutingChannels: new Set(viewer === 'muted' ? ['channel'] : []),
			userIdsWhoMeMuting: new Set(), userIdsWhoBlockingMe: new Set(), userIdsWhoMeMutingRenotes: new Set(),
		} } as never, {} as never, { filter: vi.fn(async value => value) } as never);
		const send = vi.spyOn(channel, 'send').mockImplementation(() => {});
		await (channel as unknown as { onNote: (value: unknown) => Promise<void> }).onNote(note());
		expect(send).toHaveBeenCalledTimes(['author', 'follower', 'channel-follower'].includes(viewer) ? 1 : 0);
	});

	test('does not stream a direct note to an unauthorized channel follower', async () => {
		const channel = new HomeTimelineChannel({ id: 'home', connection: {
			user: { id: 'viewer' }, following: {}, followingChannels: new Set(['channel']),
		} } as never, {} as never, {} as never);
		const send = vi.spyOn(channel, 'send').mockImplementation(() => {});
		await (channel as unknown as { onNote: (value: unknown) => Promise<void> }).onNote(note({ visibility: 'specified' }));
		expect(send).not.toHaveBeenCalled();
	});
});
