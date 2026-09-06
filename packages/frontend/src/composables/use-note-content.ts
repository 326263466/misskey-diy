/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { useGlobalEvent } from '@/events.js';

export function useNoteContent(source: Misskey.entities.Note): Misskey.entities.Note {
	const note = reactive({ ...source });
	watch(() => [source.text, source.cw, source.emojis] as const, ([text, cw, emojis]) => {
		Object.assign(note, { text, cw, emojis });
	});
	useGlobalEvent('noteEdited', (id, content) => {
		if (id === note.id) Object.assign(note, content);
	});
	return note;
}
