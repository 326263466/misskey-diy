/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { getAppearNote } from '@/utility/get-appear-note.js';
import { copyShareLink } from '@/utility/share.js';
import { openShareDialog } from '@/utility/share-dialog.js';

function getShareData(target: Misskey.entities.Note) {
	const restricted = target.visibility === 'followers' || target.visibility === 'specified';
	return {
		title: i18n.tsx.noteOf({ user: target.user.name ?? target.user.username }),
		// Do not expose restricted or CW-hidden content in another app's preview.
		text: restricted ? undefined : (target.cw ?? target.text ?? undefined),
		url: `${url}/notes/${target.id}`,
		restricted,
	};
}

export function getNoteShareData(note: Misskey.entities.Note) {
	return getShareData(getAppearNote(note) ?? note);
}

export function shareNote(note: Misskey.entities.Note): void {
	openShareDialog(getNoteShareData(note));
}

export async function copyNoteLink(note: Misskey.entities.Note): Promise<void> {
	// Unlike sharing displayed content, copying a renote link must retain its own ID.
	const data = getShareData(note);
	if (await copyShareLink(data.url)) {
		os.toast(i18n.ts.copiedToClipboard);
	} else {
		// Keep a selectable link available even when browser clipboard access fails.
		openShareDialog(data);
	}
}
