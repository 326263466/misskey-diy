/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type ReplyNote = {
	id: string;
	repliesCount: number;
};

export type FlatNoteRepliesRequest = {
	noteId: string;
	limit: number;
	untilId?: string;
	sinceId?: string;
};

type PendingReplies = {
	noteId: string;
	cursor?: string;
	cursors: Set<string>;
};

export function createFlatNoteRepliesLoader<T extends ReplyNote>(
	rootNote: ReplyNote,
	fetchPage: (request: FlatNoteRepliesRequest) => Promise<readonly T[]>,
	// ascending 时按时间正序，用 sinceId 游标从最早的回复开始。
	options: { recursive?: boolean; ascending?: boolean } = {},
) {
	const requestBudget = 5;
	const pending: PendingReplies[] = rootNote.repliesCount > 0 ? [{ noteId: rootNote.id, cursors: new Set() }] : [];
	const seen = new Set([rootNote.id]);
	const buffered: T[] = [];
	let loading: Promise<{ notes: T[]; hasMore: boolean }> | null = null;

	async function loadPage(pageSize: number) {
		for (let requests = 0; requests < requestBudget && buffered.length < pageSize && pending.length > 0; requests++) {
			const task = pending[0];
			// Commit queue progress only after success, so failed pages remain retryable.
			const cursor = options.ascending ? { sinceId: task.cursor ?? '0' } : task.cursor ? { untilId: task.cursor } : {};
			const notes = await fetchPage({ noteId: task.noteId, limit: pageSize, ...cursor });
			const nextCursor = notes.at(-1)?.id;
			if (notes.length >= pageSize && nextCursor != null && !task.cursors.has(nextCursor)) {
				task.cursor = nextCursor;
				task.cursors.add(nextCursor);
			} else {
				pending.shift();
			}

			for (const note of notes) {
				if (seen.has(note.id)) continue;
				seen.add(note.id);
				buffered.push(note);
				if (options.recursive !== false && note.repliesCount > 0) pending.push({ noteId: note.id, cursors: new Set() });
			}
		}

		return {
			notes: buffered.splice(0, pageSize),
			hasMore: buffered.length > 0 || pending.length > 0,
		};
	}

	return {
		get hasMore() {
			return buffered.length > 0 || pending.length > 0;
		},
		loadMore(limit = 5) {
			if (loading != null) return loading;
			loading = loadPage(Math.max(1, Math.min(100, Math.floor(limit)))).finally(() => {
				loading = null;
			});
			return loading;
		},
	};
}
