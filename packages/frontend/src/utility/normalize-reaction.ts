/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function normalizeReaction(reaction: string): string {
	if (reaction.startsWith('text:')) return reaction;
	const normalized = reaction.replace(/^:([\w+-]+):$/, ':$1@.:');
	return normalized.includes('\u200d') ? normalized : normalized.replace(/\ufe0f/g, '');
}
