/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';

export function toDeletedNote(note: Misskey.entities.Note, deletedBy?: Misskey.entities.Note['deletedBy']): Misskey.entities.Note {
	return {
		...note, isDeleted: true, deletedBy: deletedBy ?? note.deletedBy, text: null, cw: null, files: [], fileIds: [], poll: undefined,
		reactions: {}, reactionCount: 0, reactionEmojis: {}, myReaction: null,
		renote: null, renoteId: null, renoteCount: 0,
		likeCount: 0, isLiked: false, likeUsers: [],
	};
}

export function getDeletedText(deletedBy: Misskey.entities.Note['deletedBy'], comment = false): string {
	if (comment) {
		if (deletedBy === 'community') return i18n.ts.deletedCommentByCommunity;
		if (deletedBy === 'author') return i18n.ts.deletedCommentByAuthor;
		return i18n.ts.deletedComment;
	}
	if (deletedBy === 'community') return i18n.ts.deletedNoteByCommunity;
	if (deletedBy === 'author') return i18n.ts.deletedNoteByAuthor;
	return i18n.ts.deletedNote;
}
