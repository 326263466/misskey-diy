/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import * as os from '@/os.js';
import { $i } from '@/i.js';

export async function editNote(note: Misskey.entities.Note): Promise<void> {
	if (note.userId !== $i?.id || note.user.host != null || Misskey.note.isPureRenote(note)) return;
	let current: Misskey.entities.Note;
	try {
		current = await os.apiWithDialog('notes/show', { noteId: note.id });
	} catch {
		return;
	}
	if (current.userId !== $i.id || current.user.host != null || Misskey.note.isPureRenote(current) || current.isDeleted) return;
	await os.post({ editingNote: current });
}
