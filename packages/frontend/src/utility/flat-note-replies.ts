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
};

type PendingReplies = {
	noteId: string;
	untilId?: string;
	cursors: Set<string>;
};

export function createFlatNoteRepliesLoader<T extends ReplyNote>(
	rootNote: ReplyNote,
	fetchPage: (request: FlatNoteRepliesRequest) => Promise<readonly T[]>,
) {
	const pageSize = 5;
	const requestBudget = 5;
	const pending: PendingReplies[] = rootNote.repliesCount > 0 ? [{ noteId: rootNote.id, cursors: new Set() }] : [];
	const seen = new Set([rootNote.id]);
	const buffered: T[] = [];
	let loading: Promise<{ notes: T[]; hasMore: boolean }> | null = null;

	async function loadPage() {
		for (let requests = 0; requests < requestBudget && buffered.length < pageSize && pending.length > 0; requests++) {
			const task = pending[0];
			// Commit queue progress only after success, so failed pages remain retryable.
			const notes = await fetchPage({ noteId: task.noteId, limit: pageSize, ...(task.untilId ? { untilId: task.untilId } : {}) });
			const nextCursor = notes.at(-1)?.id;
			if (notes.length >= pageSize && nextCursor != null && !task.cursors.has(nextCursor)) {
				task.untilId = nextCursor;
				task.cursors.add(nextCursor);
			} else {
				pending.shift();
			}

			for (const note of notes) {
				if (seen.has(note.id)) continue;
				seen.add(note.id);
				buffered.push(note);
				if (note.repliesCount > 0) pending.push({ noteId: note.id, cursors: new Set() });
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
		loadMore() {
			if (loading != null) return loading;
			loading = loadPage().finally(() => {
				loading = null;
			});
			return loading;
		},
	};
}
