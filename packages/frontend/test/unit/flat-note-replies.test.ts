/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { FlatNoteRepliesRequest } from '@/utility/flat-note-replies.js';
import { createFlatNoteRepliesLoader } from '@/utility/flat-note-replies.js';

function makeNote(id: string, repliesCount = 0) {
	return { id, repliesCount };
}

describe('createFlatNoteRepliesLoader', () => {
	test('returns direct siblings in backend order without fetching leaves', async () => {
		const replies = [makeNote('newer'), makeNote('older')];
		const fetchPage = vi.fn().mockResolvedValue(replies);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 2), fetchPage);

		expect(loader.hasMore).toBe(true);
		expect(await loader.loadMore()).toEqual({ notes: replies, hasMore: false });
		expect(fetchPage).toHaveBeenCalledExactlyOnceWith({ noteId: 'root', limit: 5 });
		expect(loader.hasMore).toBe(false);
		expect(await loader.loadMore()).toEqual({ notes: [], hasMore: false });
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});

	test('does not fetch a root without replies', async () => {
		const fetchPage = vi.fn();
		const loader = createFlatNoteRepliesLoader(makeNote('root'), fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: [], hasMore: false });
		expect(fetchPage).not.toHaveBeenCalled();
	});

	test('flattens deep descendants while keeping parents before children', async () => {
		const first = makeNote('first', 1);
		const sibling = makeNote('sibling', 1);
		const child = makeNote('child', 1);
		const secondChild = makeNote('second-child');
		const grandchild = makeNote('grandchild');
		const pages = new Map([
			['root', [first, sibling]],
			['first', [child]],
			['sibling', [secondChild]],
			['child', [grandchild]],
		]);
		const fetchPage = vi.fn(async ({ noteId }: FlatNoteRepliesRequest) => pages.get(noteId) ?? []);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 2), fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: [first, sibling, child, secondChild, grandchild], hasMore: false });
		expect(fetchPage.mock.calls.map(([request]) => request.noteId)).toEqual(['root', 'first', 'sibling', 'child']);
	});

	test('paginates direct replies before fetching descendants', async () => {
		const firstPage = [makeNote('9', 1), makeNote('8'), makeNote('7'), makeNote('6'), makeNote('5')];
		const olderSibling = makeNote('4');
		const child = makeNote('child');
		const fetchPage = vi.fn()
			.mockResolvedValueOnce(firstPage)
			.mockResolvedValueOnce([olderSibling])
			.mockResolvedValueOnce([child]);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 6), fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: firstPage, hasMore: true });
		expect(fetchPage).toHaveBeenCalledTimes(1);
		expect(await loader.loadMore()).toEqual({ notes: [olderSibling, child], hasMore: false });
		expect(fetchPage.mock.calls).toEqual([
			[{ noteId: 'root', limit: 5 }],
			[{ noteId: 'root', limit: 5, untilId: '5' }],
			[{ noteId: '9', limit: 5 }],
		]);
	});

	test('buffers page overflow for the next user call', async () => {
		const parent = makeNote('parent', 6);
		const children = ['5', '4', '3', '2', '1'].map(id => makeNote(id));
		const fetchPage = vi.fn()
			.mockResolvedValueOnce([parent])
			.mockResolvedValueOnce(children)
			.mockResolvedValueOnce([makeNote('0')]);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 1), fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: [parent, ...children.slice(0, 4)], hasMore: true });
		expect(await loader.loadMore()).toEqual({ notes: [children[4], makeNote('0')], hasMore: false });
	});

	test('deduplicates notes and does not revisit root or cyclic descendants', async () => {
		const root = makeNote('root', 2);
		const first = makeNote('first', 1);
		const child = makeNote('child', 1);
		const fetchPage = vi.fn()
			.mockResolvedValueOnce([first, first])
			.mockResolvedValueOnce([child, root])
			.mockResolvedValueOnce([first]);
		const loader = createFlatNoteRepliesLoader(root, fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: [first, child], hasMore: false });
		expect(fetchPage).toHaveBeenCalledTimes(3);
	});

	test('stops paginating if a server repeats a cursor', async () => {
		const repeated = Array.from({ length: 5 }, () => makeNote('same'));
		const fetchPage = vi.fn().mockResolvedValue(repeated);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 10), fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: [makeNote('same')], hasMore: false });
		expect(fetchPage).toHaveBeenCalledTimes(2);
	});

	test('stops paginating if a server cycles between older cursors', async () => {
		const first = Array.from({ length: 5 }, () => makeNote('first'));
		const second = Array.from({ length: 5 }, () => makeNote('second'));
		const fetchPage = vi.fn()
			.mockResolvedValueOnce(first)
			.mockResolvedValueOnce(second)
			.mockResolvedValueOnce(first);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 10), fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: [makeNote('first'), makeNote('second')], hasMore: false });
		expect(fetchPage).toHaveBeenCalledTimes(3);
	});

	test('retries a failed initial page', async () => {
		const reply = makeNote('reply');
		const failure = new Error('Offline');
		const fetchPage = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce([reply]);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 1), fetchPage);

		await expect(loader.loadMore()).rejects.toBe(failure);
		expect(loader.hasMore).toBe(true);
		expect(await loader.loadMore()).toEqual({ notes: [reply], hasMore: false });
		expect(fetchPage.mock.calls).toEqual([
			[{ noteId: 'root', limit: 5 }],
			[{ noteId: 'root', limit: 5 }],
		]);
	});

	test('retains buffered notes and pagination progress after a later failure', async () => {
		const parent = makeNote('parent', 6);
		const children = ['5', '4', '3', '2', '1'].map(id => makeNote(id));
		const failure = new Error('Offline');
		const fetchPage = vi.fn()
			.mockResolvedValueOnce([parent])
			.mockResolvedValueOnce(children)
			.mockRejectedValueOnce(failure)
			.mockResolvedValueOnce([makeNote('0')]);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 1), fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: [parent, ...children.slice(0, 4)], hasMore: true });
		await expect(loader.loadMore()).rejects.toBe(failure);
		expect(loader.hasMore).toBe(true);
		expect(await loader.loadMore()).toEqual({ notes: [children[4], makeNote('0')], hasMore: false });
		expect(fetchPage.mock.calls.slice(2)).toEqual([
			[{ noteId: 'parent', limit: 5, untilId: '1' }],
			[{ noteId: 'parent', limit: 5, untilId: '1' }],
		]);
	});

	test('retains successful pages if a later request fails before returning any notes', async () => {
		const parent = makeNote('parent', 1);
		const child = makeNote('child');
		const failure = new Error('Offline');
		const fetchPage = vi.fn()
			.mockResolvedValueOnce([parent])
			.mockRejectedValueOnce(failure)
			.mockResolvedValueOnce([child]);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 1), fetchPage);

		await expect(loader.loadMore()).rejects.toBe(failure);
		expect(await loader.loadMore()).toEqual({ notes: [parent, child], hasMore: false });
		expect(fetchPage.mock.calls.map(([request]) => request.noteId)).toEqual(['root', 'parent', 'parent']);
	});

	test('makes at most five requests per user call even when scanning yields no new notes', async () => {
		const branches = ['5', '4', '3', '2', '1'].map(id => makeNote(id, 1));
		const fetchPage = vi.fn().mockResolvedValueOnce(branches).mockResolvedValue([]);
		const loader = createFlatNoteRepliesLoader(makeNote('root', 5), fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: branches, hasMore: true });
		expect(fetchPage).toHaveBeenCalledTimes(1);
		expect(await loader.loadMore()).toEqual({ notes: [], hasMore: true });
		expect(fetchPage).toHaveBeenCalledTimes(6);
		expect(await loader.loadMore()).toEqual({ notes: [], hasMore: false });
		expect(fetchPage).toHaveBeenCalledTimes(7);
	});

	test('does not recursively load an unbounded reply chain', async () => {
		const fetchPage = vi.fn(async ({ noteId }: FlatNoteRepliesRequest) => [makeNote(String(Number(noteId) + 1), 1)]);
		const loader = createFlatNoteRepliesLoader(makeNote('0', 1), fetchPage);

		expect(await loader.loadMore()).toEqual({ notes: ['1', '2', '3', '4', '5'].map(id => makeNote(id, 1)), hasMore: true });
		expect(fetchPage).toHaveBeenCalledTimes(5);
		expect(await loader.loadMore()).toEqual({ notes: ['6', '7', '8', '9', '10'].map(id => makeNote(id, 1)), hasMore: true });
		expect(fetchPage).toHaveBeenCalledTimes(10);
	});

	test('does not mutate the supplied root, notes, or page array', async () => {
		const root = Object.freeze(makeNote('root', 1));
		const reply = Object.freeze(makeNote('reply'));
		const page = Object.freeze([reply]);
		const loader = createFlatNoteRepliesLoader(root, async () => page);

		const result = await loader.loadMore();
		expect(result).toEqual({ notes: [reply], hasMore: false });
		expect(result.notes[0]).toBe(reply);
		expect(root).toEqual(makeNote('root', 1));
		expect(page).toEqual([makeNote('reply')]);
	});

	test('shares in-flight requests across overlapping load calls', async () => {
		const reply = makeNote('reply');
		let resolvePage: (notes: ReturnType<typeof makeNote>[]) => void;
		const fetchPage = vi.fn(() => new Promise<ReturnType<typeof makeNote>[]>(resolve => {
			resolvePage = resolve;
		}));
		const loader = createFlatNoteRepliesLoader(makeNote('root', 1), fetchPage);

		const first = loader.loadMore();
		const second = loader.loadMore();
		expect(second).toBe(first);
		resolvePage!([reply]);
		expect(await first).toEqual({ notes: [reply], hasMore: false });
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});
});
