/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isSupportedEmoji } from '@@/js/emojilist.js';

export const REACTION_KIND_LIMIT = 100;

export function isEmojiReaction(reaction: string): boolean {
	return /^:[\w+-]+(?:@[\w.-]+)?:$/.test(reaction) || isSupportedEmoji(reaction);
}

export function normalizeReaction(reaction: string): string {
	const normalized = reaction.replace(/^:([\w+-]+):$/, ':$1@.:');
	return normalized.includes('\u200d') ? normalized : normalized.replace(/\ufe0f/g, '');
}

export function getMyReactions(note: { myReactions?: string[] }): string[] {
	return [...new Set((note.myReactions ?? [])
		.filter(isEmojiReaction).map(normalizeReaction))];
}
