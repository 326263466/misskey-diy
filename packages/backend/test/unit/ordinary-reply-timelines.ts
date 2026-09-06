/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';
import { MiNote } from '@/models/Note.js';
import type { Packed } from '@/misc/json-schema.js';
import { HIDDEN_REPLY_THREAD_PREFIX, getNoteThreadId, isOrdinaryReply } from '@/misc/is-reply.js';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import CreateNoteEndpoint from '@/server/api/endpoints/notes/create.js';
import type { MiLocalUser } from '@/models/User.js';
import { NoteDraftService } from '@/core/NoteDraftService.js';
import { PostScheduledNoteProcessorService } from '@/queue/processors/PostScheduledNoteProcessorService.js';
import type { PostScheduledNoteJobData } from '@/queue/types.js';
import type { Job } from 'bullmq';
import { HomeTimelineChannel } from '@/server/api/stream/channels/home-timeline.js';
import { LocalTimelineChannel } from '@/server/api/stream/channels/local-timeline.js';
import { HybridTimelineChannel } from '@/server/api/stream/channels/hybrid-timeline.js';
import { GlobalTimelineChannel } from '@/server/api/stream/channels/global-timeline.js';
import type { ChannelRequest } from '@/server/api/stream/channel.js';

function makeNote(id: string, overrides: Partial<MiNote> = {}): MiNote {
	return new MiNote({
		id,
		userId: 'author',
		userHost: null,
		user: { id: 'author', host: null, isSuspended: false } as MiNote['user'],
		replyId: null,
		renoteId: null,
		replyUserId: null,
		replyUserHost: null,
		renoteUserId: null,
		renoteUserHost: null,
		channelId: null,
		fileIds: [],
		visibleUserIds: [],
		visibility: 'public',
		text: 'comment',
		...overrides,
	});
}

function streamFixture(withReplies = false) {
	const request: ChannelRequest = {
		id: 'timeline',
		connection: {
			user: { id: 'author' },
			following: {},
			followingChannels: new Set(),
			mutingChannels: new Set(),
			userIdsWhoMeMuting: new Set(),
			userIdsWhoMeMutingRenotes: new Set(),
			userIdsWhoBlockingMe: new Set(),
			subscriber: new EventEmitter(),
			sendMessageToWs: vi.fn(),
		} as any,
	};
	const roles = { getUserPolicies: vi.fn().mockResolvedValue({ ltlAvailable: true, gtlAvailable: true }) } as any;
	const notes = {} as any;
	const hiding = { filter: vi.fn(async note => note) } as any;
	return { request, roles, notes, hiding, params: { withReplies }, sent: request.connection.sendMessageToWs };
}

describe('ordinary replies in timelines', () => {
	test.each([undefined, false, true])('creates one reply and keeps publication separate from renotes: %s', async publish => {
		const reply = makeNote('comment', { replyId: 'parent' });
		const create = vi.fn().mockResolvedValue(reply);
		const endpoint = new CreateNoteEndpoint({ pack: vi.fn().mockResolvedValue(reply) } as any, { fetchAndCreate: create } as any);
		await endpoint.exec({ text: 'comment', replyId: 'parent', ...(publish === undefined ? {} : { publishReply: publish }) }, { id: 'author' } as MiLocalUser, null);
		expect(create).toHaveBeenCalledTimes(1);
		expect(create.mock.calls[0][1]).toMatchObject({ replyId: 'parent', renoteId: null, publishReply: publish === true });
	});

	test.each([null, { value: false }, { value: true }])('reads the draft publication choice independently of the parent: %j', async item => {
		const getItem = vi.fn().mockResolvedValue(item);
		const service = Object.assign(Object.create(NoteDraftService.prototype), { registryApiService: { getItem } }) as NoteDraftService;
		expect(await service.getPublication({ id: 'draft', userId: 'author' })).toBe(item?.value === true);
		expect(getItem).toHaveBeenCalledWith('author', null, ['note-drafts', 'publication'], 'draft');
	});

	test.each([false, true])('scheduled replies use the saved publication choice without a renote: %s', async publish => {
		const draft = { id: 'draft', userId: 'author', user: { id: 'author' }, replyId: 'parent', renoteId: null, text: 'comment', scheduledAt: new Date(), isActuallyScheduled: true };
		const create = vi.fn().mockResolvedValue({ id: 'comment' });
		const clearPublication = vi.fn().mockResolvedValue(undefined);
		const service = new PostScheduledNoteProcessorService(
			{ findOne: vi.fn().mockResolvedValue(draft), remove: vi.fn() } as any,
			{ fetchAndCreate: create } as any,
			{ createNotification: vi.fn() } as any,
			{ logger: { createSubLogger: () => ({ error: vi.fn() }) } } as any,
			{ getPublication: vi.fn().mockResolvedValue(publish), clearPublication } as any,
		);
		await service.process({ data: { noteDraftId: draft.id } } as Job<PostScheduledNoteJobData>);
		expect(create).toHaveBeenCalledTimes(1);
		expect(create.mock.calls[0][1]).toMatchObject({ replyId: 'parent', renoteId: null, publishReply: publish });
		expect(clearPublication).toHaveBeenCalledWith(draft);
	});

	test.each([
		[{ replyId: null, renoteId: null }, false],
		[{ replyId: 'parent', renoteId: null }, true],
		[{ replyId: 'parent', renoteId: null, threadId: 'parent' }, false],
		[{ replyId: 'parent', renoteId: null, isPublishedReply: false }, true],
		[{ replyId: 'parent', renoteId: null, isPublishedReply: true }, false],
		[{ replyId: 'parent', renoteId: null, threadId: `${HIDDEN_REPLY_THREAD_PREFIX}parent` }, true],
		[{ replyId: 'parent', renoteId: 'parent' }, false],
		[{ replyId: null, renoteId: 'parent' }, false],
		[{}, false],
	])('classifies replies without relying on packed parent content: %j', (note, expected) => {
		expect(isOrdinaryReply(note)).toBe(expected);
	});

	for (const kind of ['home', 'local', 'hybrid', 'global'] as const) {
		test(`${kind} stream hides ordinary self replies and publishes marked replies`, async () => {
			const { request, roles, notes, hiding, params, sent } = streamFixture();
			const channel = kind === 'home' ? new HomeTimelineChannel(request, notes, hiding)
				: kind === 'local' ? new LocalTimelineChannel(request, {} as any, roles, notes, hiding)
				: kind === 'hybrid' ? new HybridTimelineChannel(request, {} as any, roles, notes, hiding)
				: new GlobalTimelineChannel(request, {} as any, roles, notes, hiding);
			await channel.init(params);
			const comment = makeNote('comment', { replyId: 'parent', replyUserId: 'author' });
			const publishedComment = makeNote('published', { replyId: 'parent', threadId: 'parent' });
			const onNote = request.connection.subscriber.listeners('notesStream')[0];
			await onNote(comment as unknown as Packed<'Note'>);
			expect(sent).not.toHaveBeenCalled();
			await onNote(publishedComment as unknown as Packed<'Note'>);
			expect(sent).toHaveBeenCalledWith('channel', expect.objectContaining({ body: publishedComment }));
			channel.dispose();
		});
	}

	test.each(['local', 'hybrid'] as const)('%s stream preserves explicit withReplies', async kind => {
		const { request, roles, notes, hiding, params, sent } = streamFixture(true);
		const channel = kind === 'local' ? new LocalTimelineChannel(request, {} as any, roles, notes, hiding)
			: new HybridTimelineChannel(request, {} as any, roles, notes, hiding);
		await channel.init(params);
		const comment = makeNote('comment', { replyId: 'parent' });
		await request.connection.subscriber.listeners('notesStream')[0](comment as unknown as Packed<'Note'>);
		expect(sent).toHaveBeenCalledWith('channel', expect.objectContaining({ body: comment }));
		channel.dispose();
	});

	test('Redis filtering excludes historical ordinary replies even for their author', async () => {
		const notes = [makeNote('3', { replyId: 'parent', threadId: null }), makeNote('2', { replyId: 'parent', threadId: 'parent' }), makeNote('1')];
		let requestedIds: string[] = [];
		const query = {
			where: vi.fn((_where, params) => { requestedIds = params.noteIds; return query; }),
			innerJoinAndSelect: vi.fn().mockReturnThis(),
			leftJoinAndSelect: vi.fn().mockReturnThis(),
			getMany: vi.fn(async () => notes.filter(note => requestedIds.includes(note.id))),
		};
		const fetchSet = { fetch: vi.fn().mockResolvedValue(new Set()) };
		const service = new FanoutTimelineEndpointService(
			{ createQueryBuilder: () => query } as any,
			{ blockedHosts: [] } as any,
			{} as any,
			{ userMutingsCache: fetchSet, renoteMutingsCache: fetchSet, userBlockedCache: fetchSet, userProfileCache: { fetch: vi.fn().mockResolvedValue({ mutedInstances: [] }) } } as any,
			{ getMulti: vi.fn().mockResolvedValue([notes.map(note => note.id)]) } as any,
			{ isBlockedHost: () => false } as any,
			{ mutingChannelsCache: fetchSet } as any,
		);
		const options = {
			untilId: null,
			sinceId: null,
			limit: 2,
			allowPartial: false,
			me: { id: 'author' },
			useDbFallback: false,
			redisTimelines: ['localTimeline' as const],
			alwaysIncludeMyNotes: true,
			excludeReplies: true,
			excludePureRenotes: false,
			dbFallback: vi.fn().mockResolvedValue([]),
		};
		expect((await service.getMiNotes(options)).map(note => note.id)).toEqual(['2', '1']);
		expect((await service.getMiNotes({ ...options, excludeReplies: false })).map(note => note.id)).toEqual(['3', '2']);
	});

	test.each([false, true])('fanout routes comments to reply caches and publishes checked replies: %s', async publish => {
		const push = vi.fn();
		const service = Object.assign(Object.create(NoteCreateService.prototype), {
			meta: { enableFanoutTimeline: true },
			redisForTimelines: { pipeline: () => ({ exec: vi.fn() }) },
			followingsRepository: { find: vi.fn().mockResolvedValue([{ followerId: 'default', withReplies: false }, { followerId: 'withReplies', withReplies: true }]) },
			userListMembershipsRepository: { find: vi.fn().mockResolvedValue([]) },
			fanoutTimelineService: { push },
		}) as NoteCreateService;
		Object.defineProperty(service, 'checkHibernation', { value: vi.fn() });
		const note = makeNote('comment', { replyId: 'parent', threadId: publish ? 'parent' : null, replyUserId: 'author' });
		await service['pushToTl'](note, { id: 'author', host: null });
		const targets = push.mock.calls.map(([target]) => target);
		expect(targets).toContain('homeTimeline:withReplies');
		if (publish) {
			expect(targets).toContain('homeTimeline:default');
			expect(targets).toContain('homeTimeline:author');
			expect(targets).toContain('userTimeline:author');
			expect(targets).toContain('localTimeline');
		} else {
			expect(targets).not.toContain('homeTimeline:default');
			expect(targets).not.toContain('homeTimeline:author');
			expect(targets).not.toContain('userTimeline:author');
			expect(targets).not.toContain('localTimeline');
			expect(targets).toContain('userTimelineWithReplies:author');
			expect(targets).toContain('localTimelineWithReplies');
		}
	});

	test.each([false, true])('stores the reply publication choice without changing reply or renote targets: %s', async publish => {
		const service = Object.assign(Object.create(NoteCreateService.prototype), {
			idService: { gen: () => 'comment' },
			notesRepository: { insert: vi.fn().mockResolvedValue({}) },
		}) as NoteCreateService;
		const parent = makeNote('parent', { threadId: 'root' });
		const note = await service['insertNote']({ id: 'author', host: null }, {
			reply: parent,
			publishReply: publish,
			text: 'comment',
		}, [], [], []);

		expect(note.replyId).toBe(parent.id);
		expect(note.renoteId).toBeNull();
		expect(note.threadId).toBe(publish ? 'root' : `${HIDDEN_REPLY_THREAD_PREFIX}root`);
	});

	test.each([false, true])('a child reply keeps the canonical thread and can be published independently: %s', async publish => {
		const service = Object.assign(Object.create(NoteCreateService.prototype), {
			idService: { gen: () => 'child' },
			notesRepository: { insert: vi.fn().mockResolvedValue({}) },
		}) as NoteCreateService;
		const parent = makeNote('parent', { threadId: `${HIDDEN_REPLY_THREAD_PREFIX}root` });
		const note = await service['insertNote']({ id: 'author', host: null }, { reply: parent, publishReply: publish }, [], [], []);
		expect(getNoteThreadId(note)).toBe('root');
		expect(note.threadId).toBe(publish ? 'root' : `${HIDDEN_REPLY_THREAD_PREFIX}root`);
		expect(isOrdinaryReply(note)).toBe(!publish);
	});
});
