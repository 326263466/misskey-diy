/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import type { NoteEditContent } from '@/events.js';
import { useGlobalEvent } from '@/events.js';

export function useNoteContent(source: Misskey.entities.Note): Misskey.entities.Note {
	const note = reactive({ ...source });
	let deleted = source.isDeleted === true;
	watch(() => [source.text, source.cw, source.emojis, source.tags, source.files, source.fileIds, source.reactionAcceptance] as const, ([text, cw, emojis, tags, files, fileIds, reactionAcceptance]) => {
		if (!deleted) Object.assign(note, { text, cw, emojis, tags, files, fileIds, reactionAcceptance });
	});
	useGlobalEvent('noteEdited', (id, content) => {
		if (id === note.id && !deleted) {
			const fields = Object.fromEntries(Object.entries(content).filter(([, value]) => value !== undefined)) as NoteEditContent;
			Object.assign(note, fields);
		}
	});
	useGlobalEvent('noteDeleted', (id, _replyId, _renoteId, deletedBy) => {
		if (id === note.id) {
			deleted = true;
			note.deletedBy = deletedBy ?? note.deletedBy;
		}
	});
	return note;
}
