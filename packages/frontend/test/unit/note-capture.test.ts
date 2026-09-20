/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, render } from '@testing-library/vue';
import { EventEmitter } from 'eventemitter3';
import { defineComponent, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';
import type { NoteUpdatedEvent } from 'misskey-js/streaming.types.js';
import { noteEvents, useNoteCapture } from '@/composables/use-note-capture.js';
import { globalEvents } from '@/events.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	interval: vi.fn(),
	store: { s: { realtimeMode: true } },
}));
const stream = Object.assign(new EventEmitter<{ noteUpdated: (event: NoteUpdatedEvent) => void; _connected_: () => void }>(), { send: vi.fn() });

vi.mock('@/i.js', () => ({ $i: { id: 'self' } }));
vi.mock('@/store.js', () => ({ store: mocks.store }));
vi.mock('@/stream.js', () => ({ useStream: () => stream }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@@/js/interval.js', () => ({ createVisibilityAwareInterval: mocks.interval }));

type PartialNote = Misskey.entities.NotesShowPartialBulkResponse[number];
const serverNotes = new Map<string, PartialNote>();
const poll = mocks.interval.mock.calls[0][0] as () => void;

function makeNote(id: string, overrides: Partial<Misskey.entities.Note> = {}): Misskey.entities.Note & PartialNote {
	return {
		id, createdAt: '2026-09-06T00:00:00.000Z', userId: 'self',
		user: { id: 'self', username: 'self', host: null } as Misskey.entities.UserLite,
		text: id, cw: null, visibility: 'public', localOnly: false,
		reactionCount: 0, reactions: {}, reactionEmojis: {}, repliesCount: 0, renoteCount: 0,
		viewsCount: 0, favoritesCount: 0, isFavorited: false,
		reactionAcceptance: null,
		likeCount: 0, isLiked: false, likeUsers: [],
		...overrides,
	};
}

function captureNote(note: Misskey.entities.Note & PartialNote) {
	serverNotes.set(note.id, { ...note, likeCount: note.likeCount ?? 0, isLiked: note.isLiked ?? false, likeUsers: note.likeUsers ?? [] });
	const active = ref(true);
	let capture!: ReturnType<typeof useNoteCapture>;
	const view = render(defineComponent({
		setup() {
			capture = useNoteCapture({ note, parentNote: null, active });
			return { captured: capture.$note };
		},
		template: '<span>{{ captured.repliesCount }}</span>',
	}));
	return { ...capture, active, view };
}

describe('note deletion capture', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		serverNotes.clear();
		mocks.store.s.realtimeMode = true;
		mocks.api.mockImplementation(async (_endpoint: string, { noteIds }: { noteIds: string[] }) =>
			noteIds.flatMap(id => serverNotes.has(id) ? [serverNotes.get(id)!] : []));
	});

	afterEach(async () => {
		cleanup();
		await vi.runOnlyPendingTimersAsync();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test('counts own replies and deep descendants once in every ancestor using repliesCount', async () => {
		const source = makeNote('own-reply-root', { repliesCount: 3 });
		const captured = captureNote(source);
		const parentNote = makeNote('nested-parent', { replyId: source.id, repliesCount: 1 });
		const parent = captureNote(parentNote);
		const childNote = makeNote('nested-child', { replyId: parentNote.id });
		const child = captureNote(childNote);
		await vi.advanceTimersByTimeAsync(50);
		const own = makeNote('own-reply', { replyId: source.id });
		serverNotes.set(source.id, { ...source, repliesCount: 4 });
		globalEvents.emit('notePosted', own);
		stream.emit('noteUpdated', { id: source.id, type: 'replied', body: { noteId: own.id } });
		expect(captured.$note.repliesCount).toBe(4);
		await vi.advanceTimersByTimeAsync(50);
		expect(captured.$note.repliesCount).toBe(4);

		const descendant = makeNote('new-deep-reply', { replyId: childNote.id });
		serverNotes.set(source.id, { ...source, repliesCount: 5 });
		serverNotes.set(parentNote.id, { ...parentNote, repliesCount: 2 });
		serverNotes.set(childNote.id, { ...childNote, repliesCount: 1 });
		globalEvents.emit('notePosted', descendant);
		for (const id of [source.id, parentNote.id, childNote.id]) {
			stream.emit('noteUpdated', { id, type: 'replied', body: { noteId: descendant.id } });
		}
		expect(captured.$note.repliesCount).toBe(5);
		expect(parent.$note.repliesCount).toBe(2);
		expect(child.$note.repliesCount).toBe(1);
		await vi.advanceTimersByTimeAsync(50);
		expect(captured.$note.repliesCount).toBe(5);

		globalEvents.emit('noteDeleted', descendant.id, childNote.id);
		globalEvents.emit('notePosted', descendant);
		await vi.advanceTimersByTimeAsync(50);
		expect(captured.$note.repliesCount).toBe(5);
		expect(parent.$note.repliesCount).toBe(2);
		expect(child.$note.repliesCount).toBe(1);
	});

	test('propagates local reply counts through embedded ancestors when intermediate comments are not mounted', () => {
		const source = makeNote('embedded-root', { repliesCount: 2 });
		const root = captureNote(source);
		const parent = makeNote('embedded-parent', { replyId: source.id });
		const child = makeNote('embedded-child', { replyId: parent.id, reply: parent });
		const descendant = makeNote('embedded-new', { replyId: child.id, reply: child });
		globalEvents.emit('notePosted', descendant);
		globalEvents.emit('notePosted', descendant);
		expect(root.$note.repliesCount).toBe(3);
	});

	test('like state changes never modify reactions and stale polls cannot replace a saved like', async () => {
		const source = makeNote('liked-note', { reactions: { heart: 7 }, reactionCount: 7, myReaction: 'heart' });
		const captured = captureNote(source);
		let finish!: (notes: PartialNote[]) => void;
		mocks.api.mockImplementationOnce(() => new Promise<PartialNote[]>(resolve => { finish = resolve; }));
		await vi.advanceTimersByTimeAsync(50);
		const updated = { likeCount: 1, isLiked: true, likeUsers: [source.user] };
		globalEvents.emit('likesUpdated', source.id, updated);
		serverNotes.set(source.id, { ...source, ...updated });
		finish([source]);
		await vi.advanceTimersByTimeAsync(100);
		expect(captured.$note.likeCount).toBe(1);
		expect(captured.$note.isLiked).toBe(true);
		expect(captured.$note.reactionCount).toBe(7);
		expect(captured.$note.myReaction).toBe('heart');
	});

	test('ignores likes for another note', async () => {
		const source = makeNote('shared-id');
		const captured = captureNote(source);
		await vi.advanceTimersByTimeAsync(50);
		const updated = { likeCount: 5, isLiked: true, likeUsers: [source.user] };
		globalEvents.emit('likesUpdated', 'another-id', updated);
		expect(captured.$note.likeCount).toBe(0);
		expect(captured.$note.isLiked).toBe(false);
		expect(captured.$note.likeUsers).toEqual([]);
	});

	test('refreshes count and avatar previews after remote likes without treating them as reactions', async () => {
		const source = makeNote('remote-like-note');
		const captured = captureNote(source);
		await vi.advanceTimersByTimeAsync(50);
		serverNotes.set(source.id, { ...source, likeCount: 1, isLiked: false, likeUsers: [source.user] });
		stream.emit('noteUpdated', { id: source.id, type: 'statsUpdated', body: null });
		await vi.advanceTimersByTimeAsync(50);
		expect(captured.$note.likeCount).toBe(1);
		expect(captured.$note.likeUsers).toEqual([source.user]);
		expect(captured.$note.reactions).toEqual({});
	});

	test('updates all mounted instances from remote statistics without a user action', async () => {
		const source = makeNote('live-stats');
		const list = captureNote(source);
		const detail = captureNote(source);
		await vi.advanceTimersByTimeAsync(50);
		mocks.api.mockClear();
		serverNotes.set(source.id, { ...source, viewsCount: 102, favoritesCount: 3, isFavorited: true });
		stream.emit('noteUpdated', { id: source.id, type: 'statsUpdated', body: null });
		await vi.advanceTimersByTimeAsync(50);
		for (const capture of [list, detail]) {
			expect(capture.$note).toMatchObject({ viewsCount: 102, favoritesCount: 3, isFavorited: true });
		}
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/show-partial-bulk', { noteIds: [source.id] });
	});

	test('rejects an older statistics response and reconciles after reconnecting', async () => {
		const source = makeNote('reconnected-stats', { viewsCount: 9, favoritesCount: 2 });
		const captured = captureNote(source);
		let finish!: (notes: PartialNote[]) => void;
		mocks.api.mockImplementationOnce(() => new Promise<PartialNote[]>(resolve => { finish = resolve; }));
		await vi.advanceTimersByTimeAsync(50);
		serverNotes.set(source.id, { ...source, viewsCount: 12, favoritesCount: 1 });
		stream.emit('noteUpdated', { id: source.id, type: 'statsUpdated', body: null });
		finish([source]);
		await vi.advanceTimersByTimeAsync(50);
		expect(captured.$note).toMatchObject({ viewsCount: 12, favoritesCount: 1 });
		serverNotes.set(source.id, { ...source, viewsCount: 15, favoritesCount: 0 });
		stream.emit('_connected_');
		await vi.advanceTimersByTimeAsync(50);
		expect(captured.$note).toMatchObject({ viewsCount: 15, favoritesCount: 0 });
	});

	test('reconciles every statistic without a stream event while realtime mode is enabled', async () => {
		const source = makeNote('missed-stats');
		const list = captureNote(source);
		const detail = captureNote(source);
		await vi.advanceTimersByTimeAsync(50);
		mocks.api.mockClear();
		const updated = {
			...source, viewsCount: 15, favoritesCount: 2, isFavorited: true,
			likeCount: 3, isLiked: true, likeUsers: [source.user],
			repliesCount: 4, renoteCount: 5, reactions: { heart: 6 },
		};
		serverNotes.set(source.id, updated);
		poll();
		await vi.advanceTimersByTimeAsync(0);
		for (const capture of [list, detail]) {
			expect(capture.$note).toMatchObject({
				viewsCount: 15, favoritesCount: 2, isFavorited: true,
				likeCount: 3, isLiked: true, likeUsers: [source.user],
				repliesCount: 4, renoteCount: 5, reactions: { heart: 6 }, reactionCount: 6,
			});
		}
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/show-partial-bulk', { noteIds: [source.id] });
	});

	test('recovers a failed statistics request on the shared timer without another interaction', async () => {
		const source = makeNote('retry-stats');
		const captured = captureNote(source);
		await vi.advanceTimersByTimeAsync(50);
		serverNotes.set(source.id, { ...source, likeCount: 8, viewsCount: 10 });
		mocks.api.mockRejectedValueOnce(new Error('temporary network failure'));
		stream.emit('noteUpdated', { id: source.id, type: 'statsUpdated', body: null });
		await vi.advanceTimersByTimeAsync(50);
		expect(captured.$note.likeCount).toBe(0);
		poll();
		await vi.advanceTimersByTimeAsync(0);
		expect(captured.$note).toMatchObject({ likeCount: 8, viewsCount: 10 });
	});

	test('rotates batches without starving earlier visible notes and releases inactive subscriptions', async () => {
		const captures = Array.from({ length: 31 }, (_, i) => captureNote(makeNote(`rotation-${i}`)));
		await vi.advanceTimersByTimeAsync(100);
		mocks.api.mockClear();
		for (const [id, source] of serverNotes) serverNotes.set(id, { ...source, viewsCount: 12 });
		poll();
		await vi.advanceTimersByTimeAsync(10);
		poll();
		await vi.advanceTimersByTimeAsync(0);
		expect(captures.every(capture => capture.$note.viewsCount === 12)).toBe(true);
		expect(mocks.api.mock.calls.every(([, params]) => params.noteIds.length <= 30)).toBe(true);
		for (const capture of captures) capture.active.value = false;
		await nextTick();
		mocks.api.mockClear();
		poll();
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test.each([undefined, 'author', 'community'] as const)('broadcasts a remote reply deletion by %s and reconciles its subtree', async deletedBy => {
		const source = makeNote('remote-parent', { repliesCount: 4 });
		const parent = captureNote(source);
		await vi.advanceTimersByTimeAsync(50);
		const emit = vi.spyOn(globalEvents, 'emit');
		const noteEmit = vi.spyOn(noteEvents, 'emit');
		const event: NoteUpdatedEvent = { id: 'remote-parent', type: 'unreplied', body: { noteId: 'remote-child', deletedBy } };
		serverNotes.set(source.id, { ...source, repliesCount: 1 });

		stream.emit('noteUpdated', event);
		expect(emit).toHaveBeenCalledExactlyOnceWith('noteDeleted', 'remote-child', 'remote-parent', undefined, deletedBy);
		expect(noteEmit).toHaveBeenCalledExactlyOnceWith('unreplied:remote-parent', { noteId: 'remote-child' });
		await vi.advanceTimersByTimeAsync(50);
		expect(parent.$note.repliesCount).toBe(1);

		stream.emit('noteUpdated', event);
		globalEvents.emit('noteDeleted', 'remote-child', 'remote-parent');
		await vi.advanceTimersByTimeAsync(50);
		expect(parent.$note.repliesCount).toBe(1);
	});

	test('ignores late creation events for deleted replies and never subtracts twice', async () => {
		const source = makeNote('late-parent', { repliesCount: 1 });
		const parent = captureNote(source);
		const child = makeNote('late-child', { replyId: 'late-parent' });
		serverNotes.set(source.id, { ...source, repliesCount: 0 });
		globalEvents.emit('noteDeleted', child.id, child.replyId);
		globalEvents.emit('notePosted', child);
		stream.emit('noteUpdated', { id: 'late-parent', type: 'replied', body: { noteId: child.id } });
		await vi.advanceTimersByTimeAsync(100);
		expect(parent.$note.repliesCount).toBe(0);

		globalEvents.emit('noteDeleted', child.id, child.replyId);
		globalEvents.emit('noteDeleted', 'another-deleted-child', child.replyId);
		await vi.advanceTimersByTimeAsync(100);
		expect(parent.$note.repliesCount).toBe(0);
	});

	test('does not restore a pre-deletion subtree count from an older response', async () => {
		const note = makeNote('stale-parent', { repliesCount: 2 });
		const parent = captureNote(note);
		let finish!: (notes: PartialNote[]) => void;
		mocks.api.mockImplementationOnce(() => new Promise<PartialNote[]>(resolve => { finish = resolve; }));
		await vi.advanceTimersByTimeAsync(50);

		globalEvents.emit('noteDeleted', 'stale-child', note.id);
		serverNotes.set(note.id, { ...note, repliesCount: 0 });
		finish([note]);
		await vi.advanceTimersByTimeAsync(0);
		expect(parent.$note.repliesCount).toBe(2);

		await vi.advanceTimersByTimeAsync(50);
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(parent.$note.repliesCount).toBe(0);
	});

	test('removes comments missing from polling without subtracting an already refreshed parent count twice', async () => {
		mocks.store.s.realtimeMode = false;
		const parentNote = makeNote('polled-parent', { repliesCount: 2 });
		const parent = captureNote(parentNote);
		captureNote(makeNote('polled-child', { replyId: parentNote.id }));
		serverNotes.set(parentNote.id, { ...parentNote, repliesCount: 1 });
		serverNotes.delete('polled-child');
		const emit = vi.spyOn(globalEvents, 'emit');

		await vi.advanceTimersByTimeAsync(50);
		expect(emit).toHaveBeenCalledExactlyOnceWith('noteDeleted', 'polled-child', parentNote.id, undefined, undefined);
		expect(parent.$note.repliesCount).toBe(1);

		await vi.advanceTimersByTimeAsync(50);
		expect(parent.$note.repliesCount).toBe(1);
		expect(mocks.api).toHaveBeenLastCalledWith('notes/show-partial-bulk', { noteIds: ['polled-parent'] });
		poll();
		expect(mocks.api).toHaveBeenLastCalledWith('notes/show-partial-bulk', { noteIds: ['polled-parent'] });
	});

	test.each(['author', 'community'] as const)('preserves deletion source %s from polling a retained comment', async deletedBy => {
		mocks.store.s.realtimeMode = false;
		const source = makeNote(`polled-deleted-${deletedBy}`, { replyId: 'polled-source-parent' });
		captureNote(source);
		serverNotes.set(source.id, { ...source, isDeleted: true, deletedBy });
		const emit = vi.spyOn(globalEvents, 'emit');
		await vi.advanceTimersByTimeAsync(50);
		expect(emit).toHaveBeenCalledWith('noteDeleted', source.id, source.replyId, undefined, deletedBy);
	});

	test('refreshes the parent count after only the child deletion is received', async () => {
		const parentNote = makeNote('deleted-parent', { repliesCount: 2 });
		const parent = captureNote(parentNote);
		captureNote(makeNote('deleted-child', { replyId: parentNote.id }));
		await vi.advanceTimersByTimeAsync(50);

		serverNotes.set(parentNote.id, { ...parentNote, repliesCount: 1 });
		serverNotes.delete('deleted-child');
		stream.emit('noteUpdated', { id: 'deleted-child', type: 'deleted', body: { deletedAt: '2026-09-06T00:01:00.000Z' } });
		await vi.advanceTimersByTimeAsync(50);
		expect(parent.$note.repliesCount).toBe(1);
		expect(stream.send).toHaveBeenCalledWith('un', { id: 'deleted-child' });
	});

	test('does not forward the root deletion source to comments removed with the root', async () => {
		const root = makeNote('source-cascade-root');
		const child = makeNote('source-cascade-child', { replyId: root.id, userId: 'other' });
		captureNote(root);
		captureNote(child);
		await vi.advanceTimersByTimeAsync(50);
		const emit = vi.spyOn(globalEvents, 'emit');
		globalEvents.emit('noteDeleted', root.id, null, null, 'author');
		expect(emit).toHaveBeenCalledWith('noteDeleted', child.id, root.id);
		expect(emit).not.toHaveBeenCalledWith('noteDeleted', child.id, root.id, undefined, 'author');
	});

	test('retains the server count when a delayed deletion event arrives', async () => {
		const note = makeNote('refreshed-parent', { repliesCount: 2 });
		const parent = captureNote(note);
		serverNotes.set(note.id, { ...note, repliesCount: 1 });
		await vi.advanceTimersByTimeAsync(50);
		expect(parent.$note.repliesCount).toBe(1);

		stream.emit('noteUpdated', { id: note.id, type: 'unreplied', body: { noteId: 'refreshed-child' } });
		await vi.advanceTimersByTimeAsync(50);
		expect(parent.$note.repliesCount).toBe(1);
		globalEvents.emit('noteDeleted', 'refreshed-child', note.id);
		expect(parent.$note.repliesCount).toBe(1);
	});

	test('refreshes an ancestor when a later deletion event supplies a previously unknown reply relationship', async () => {
		const source = makeNote('late-relationship-root', { repliesCount: 2 });
		const root = captureNote(source);
		await vi.advanceTimersByTimeAsync(50);
		globalEvents.emit('noteDeleted', 'unloaded-descendant');
		serverNotes.set(source.id, { ...source, repliesCount: 1 });
		stream.emit('noteUpdated', { id: source.id, type: 'unreplied', body: { noteId: 'unloaded-descendant' } });
		await vi.advanceTimersByTimeAsync(50);
		expect(root.$note.repliesCount).toBe(1);
	});

	test('stops interacting with the deleted comment while keeping its descendants and totals active', async () => {
		const root = makeNote('cascade-root', { repliesCount: 3 });
		const rootCapture = captureNote(root);
		const parent = makeNote('cascade-parent', { replyId: root.id, repliesCount: 1 });
		const child = makeNote('cascade-child', { replyId: parent.id });
		captureNote(parent);
		captureNote(child);
		captureNote(makeNote('cascade-sibling', { replyId: root.id }));
		await vi.advanceTimersByTimeAsync(50);
		serverNotes.delete(parent.id);
		globalEvents.emit('noteDeleted', parent.id, root.id);
		await vi.advanceTimersByTimeAsync(50);
		expect(rootCapture.$note.repliesCount).toBe(3);
		expect(stream.send).toHaveBeenCalledWith('un', { id: parent.id });
		expect(stream.send).not.toHaveBeenCalledWith('un', { id: child.id });
		expect(stream.send).not.toHaveBeenCalledWith('un', { id: root.id });
		expect(stream.send).not.toHaveBeenCalledWith('un', { id: 'cascade-sibling' });
		globalEvents.emit('notePosted', makeNote('cascade-late', { replyId: child.id, reply: child }));
		serverNotes.set(root.id, { ...root, repliesCount: 4 });
		await vi.advanceTimersByTimeAsync(50);
		expect(rootCapture.$note.repliesCount).toBe(4);
	});

	test('does not treat failed requests or superseded missing-note responses as deletions', async () => {
		const parent = captureNote(makeNote('request-parent', { repliesCount: 1 }));
		const emit = vi.spyOn(globalEvents, 'emit');
		mocks.api.mockRejectedValueOnce(new Error('network error'));
		await vi.advanceTimersByTimeAsync(50);
		expect(emit).not.toHaveBeenCalled();

		let finish!: (notes: PartialNote[]) => void;
		mocks.api.mockImplementationOnce(() => new Promise<PartialNote[]>(resolve => { finish = resolve; }));
		parent.subscribe();
		await vi.advanceTimersByTimeAsync(50);
		parent.subscribe();
		await vi.advanceTimersByTimeAsync(50);
		finish([]);
		await vi.advanceTimersByTimeAsync(0);
		expect(emit).not.toHaveBeenCalled();
		expect(parent.$note.repliesCount).toBe(1);
	});

	test('stops capturing deleted notes and ignores their pending responses', async () => {
		const note = makeNote('stopped-note');
		const captured = captureNote(note);
		let finish!: (notes: PartialNote[]) => void;
		mocks.api.mockImplementationOnce(() => new Promise<PartialNote[]>(resolve => { finish = resolve; }));
		await vi.advanceTimersByTimeAsync(50);
		globalEvents.emit('noteDeleted', note.id);
		finish([{ ...note, repliesCount: 10, reactions: { like: 20 } }]);
		await vi.advanceTimersByTimeAsync(0);
		expect(captured.$note.repliesCount).toBe(0);
		expect(captured.$note.reactionCount).toBe(0);
		expect(stream.send).toHaveBeenCalledWith('un', { id: note.id });

		captured.active.value = false;
		await nextTick();
		captured.active.value = true;
		await nextTick();
		captured.subscribe();
		await vi.advanceTimersByTimeAsync(50);
		expect(stream.send.mock.calls.filter(([type]) => type === 'sr')).toHaveLength(1);
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});
});
