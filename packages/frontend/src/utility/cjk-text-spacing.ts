/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { splitUnicodeEmoji } from '@/utility/unicode-emoji.js';

export type CjkTextLayout = {
	text: string;
	spaces: number[];
};

export type CjkCharacterKind = 'han' | 'other' | null;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const customEmoji = /^:[\w+-]+(?:@[\w.-]+)?:$/;
const han = /\p{Script=Han}/u;
const alphanumeric = /[\p{Script=Latin}\p{Number}]/u;

function cjkCharacterKind(character: string): CjkCharacterKind {
	return han.test(character) ? 'han' : (alphanumeric.test(character) || customEmoji.test(character) || splitUnicodeEmoji(character).some(part => part.emoji)) ? 'other' : null;
}

export function needsCjkSpace(left: CjkCharacterKind, right: CjkCharacterKind): boolean {
	return left != null && right != null && left !== right;
}

export function cjkTextEdge(text: string, edge: 'first' | 'last'): CjkCharacterKind {
	const character = segmenter.segment(text).containing(edge === 'first' ? 0 : text.length - 1)?.segment;
	return character ? cjkCharacterKind(character) : null;
}

/** Display-only separation at Chinese/Latin, number and emoji boundaries. */
export function formatCjkText(value: string, recognizeCustomEmoji = true): CjkTextLayout {
	const parts = recognizeCustomEmoji ? value.split(/(:[\w+-]+(?:@[\w.-]+)?:)/g) : [value];
	const tokens = parts.flatMap(part => recognizeCustomEmoji && customEmoji.test(part)
		? [part]
		: [...segmenter.segment(part)].map(item => item.segment));
	const layout: CjkTextLayout = { text: '', spaces: [] };
	let previous: CjkCharacterKind = null;
	for (const token of tokens) {
		const kind = cjkCharacterKind(token);
		if (needsCjkSpace(previous, kind)) {
			layout.spaces.push(layout.text.length);
			layout.text += '\u2009';
		}
		layout.text += token;
		previous = kind;
	}
	return layout;
}
