/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const TEXT_REACTION_PREFIX = 'text:';

const textReactionSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function normalizeTextReaction(reaction: string): string | null {
	if (!reaction.startsWith(TEXT_REACTION_PREFIX)) return null;
	const body = reaction.slice(TEXT_REACTION_PREFIX.length);
	if (/[\p{Cc}\u2028\u2029]/u.test(body)) return null;
	const text = body.trim().normalize('NFC');
	if (text.length === 0 || text.length > 240 || Array.from(textReactionSegmenter.segment(text)).length > 16) return null;
	if (!/[^\p{Default_Ignorable_Code_Point}]/u.test(text)) return null;
	return `${TEXT_REACTION_PREFIX}${text}`;
}

export function parseReactionUserPair(pair: string): [string, string] {
	const separator = pair.indexOf('/');
	return [pair.slice(0, separator), pair.slice(separator + 1)];
}
