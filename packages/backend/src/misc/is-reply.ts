/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from '@/models/User.js';

// Publication metadata stays in the existing column; thread muting uses its canonical ID.
export const HIDDEN_REPLY_THREAD_PREFIX = 'reply-hidden:';

export function getNoteThreadId(note: { id: string; threadId?: string | null }): string {
	const threadId = note.threadId ?? note.id;
	return threadId.startsWith(HIDDEN_REPLY_THREAD_PREFIX) ? threadId.slice(HIDDEN_REPLY_THREAD_PREFIX.length) : threadId;
}

export function isReply(note: any, viewerId?: MiUser['id'] | undefined | null): boolean {
	return note.replyId && note.replyUserId !== note.userId && note.replyUserId !== viewerId;
}

/** A reply that stays attached to its parent instead of appearing as a standalone post. */
export function isOrdinaryReply(note: {
	replyId?: string | null;
	renoteId?: string | null;
	threadId?: string | null;
	isPublishedReply?: boolean;
}): boolean {
	if (note.replyId == null || note.renoteId != null) return false;
	// Packed notes carry the derived flag; repository entities use threadId.
	if (note.isPublishedReply !== undefined) return !note.isPublishedReply;
	if (note.threadId !== undefined) return note.threadId == null || note.threadId.startsWith(HIDDEN_REPLY_THREAD_PREFIX);
	return true;
}
