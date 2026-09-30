/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { getUnicodeEmojiOrNull } from '@@/js/emojilist.js';

export type UnicodeEmojiPart = { text: string; emoji: boolean };

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const possibleEmoji = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u20e3/u;

function appendPart(parts: UnicodeEmojiPart[], text: string, emoji: boolean): void {
	const previous = parts.at(-1);
	if (!emoji && previous && !previous.emoji) previous.text += text;
	else parts.push({ text, emoji });
}

/** Use MFM's Unicode rules without interpreting source markup or changing its text. */
export function splitUnicodeEmoji(text: string): UnicodeEmojiPart[] {
	const parts: UnicodeEmojiPart[] = [];
	for (const { segment } of segmenter.segment(text)) {
		if (!possibleEmoji.test(segment)) {
			appendPart(parts, segment, false);
			continue;
		}

		// Some complete sequences in the picker (notably eye in speech bubble)
		// are split by the parser's regex. Only extend recognition for a known
		// joined sequence; the picker also contains text symbols such as bare ©.
		if (segment.includes('\u200d') && !segment.includes('\ufe0e') && getUnicodeEmojiOrNull(segment) != null) {
			appendPart(parts, segment, true);
			continue;
		}

		for (const node of mfm.parseSimple(segment)) {
			if (node.type === 'unicodeEmoji') appendPart(parts, node.props.emoji, true);
			else appendPart(parts, mfm.toString([node]), false);
		}
	}
	return parts;
}

/** Repair split Unicode sequences within display leaves, retaining every MFM boundary. */
export function normalizeMfmUnicodeEmoji(nodes: mfm.MfmNode[]): mfm.MfmNode[] {
	const result: mfm.MfmNode[] = [];
	let leaves: (mfm.MfmText | mfm.MfmUnicodeEmoji)[] = [];

	function flush(): void {
		if (leaves.length === 0) return;
		if (!leaves.some(node => node.type === 'unicodeEmoji')) {
			result.push(...leaves);
			leaves = [];
			return;
		}

		let text = '';
		const emojiRanges: { start: number; end: number }[] = [];
		for (const node of leaves) {
			const start = text.length;
			text += node.type === 'text' ? node.props.text : node.props.emoji;
			if (node.type === 'unicodeEmoji') emojiRanges.push({ start, end: text.length });
		}
		if (!text.includes('\u200d')) {
			result.push(...leaves);
			leaves = [];
			return;
		}

		let offset = 0;
		for (const part of splitUnicodeEmoji(text)) {
			const end = offset + part.text.length;
			// Caller-owned text nodes can deliberately contain literal emoji.
			// Only extend a sequence that MFM already began rendering as emoji.
			const emoji = part.emoji && emojiRanges.some(range => range.start < end && range.end > offset);
			result.push(emoji ? mfm.UNI_EMOJI(part.text) : mfm.TEXT(part.text));
			offset = end;
		}
		leaves = [];
	}

	for (const node of nodes) {
		if (node.type === 'text' || node.type === 'unicodeEmoji') {
			leaves.push(node);
			continue;
		}
		flush();
		// <plain> explicitly suppresses Unicode emoji parsing. Code, URL and
		// mention payloads have no children and remain untouched as well.
		result.push('children' in node && Array.isArray(node.children) && node.type !== 'plain'
			? { ...node, children: normalizeMfmUnicodeEmoji(node.children) } as mfm.MfmNode
			: node);
	}
	flush();
	return result;
}
