/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import * as os from '@/os.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { globalEvents } from '@/events.js';

export async function editNote(note: Misskey.entities.Note): Promise<void> {
	if (note.userId !== $i?.id || note.user.host != null || note.replyId == null) return;
	let text = note.text ?? '';
	let cw = note.cw ?? '';

	for (;;) {
		const { canceled, result } = await os.form(i18n.ts.edit, {
			text: { type: 'string', label: i18n.ts.text, multiline: true, treatAsMfm: true, default: text },
			cw: { type: 'string', label: i18n.ts.annotation, required: false, default: cw },
		});
		if (canceled) return;
		text = result.text;
		cw = result.cw ?? '';

		try {
			const updated = await os.apiWithDialog('notes/update', { noteId: note.id, text, cw: cw === '' ? null : cw });
			globalEvents.emit('noteEdited', updated.id, { text: updated.text, cw: updated.cw, emojis: updated.emojis });
			return;
		} catch {
			// Keep the draft available after the API error dialog has been dismissed.
		}
	}
}
