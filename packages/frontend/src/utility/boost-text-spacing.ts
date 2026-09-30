/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { formatCjkText } from '@/utility/cjk-text-spacing.js';
import type { CjkTextLayout } from '@/utility/cjk-text-spacing.js';

export type BoostTextLayout = CjkTextLayout;

export function formatBoostText(value: string): BoostTextLayout {
	return formatCjkText(value);
}

export function boostRawOffset(layout: BoostTextLayout, offset: number): number {
	return offset - layout.spaces.filter(index => index < offset).length;
}

export function boostDisplayOffset(layout: BoostTextLayout, offset: number, afterSpace = false): number {
	return offset + layout.spaces.filter((index, added) => afterSpace ? index - added <= offset : index - added < offset).length;
}

/** Remove only generated spaces retained from the previous display, preserving pasted/typed spaces. */
export function readBoostInput(previous: BoostTextLayout, value: string, start: number, end = start): { text: string; start: number; end: number } {
	let prefix = 0;
	while (prefix < previous.text.length && prefix < value.length && previous.text[prefix] === value[prefix]) prefix++;
	let suffix = 0;
	while (suffix < previous.text.length - prefix && suffix < value.length - prefix && previous.text[previous.text.length - suffix - 1] === value[value.length - suffix - 1]) suffix++;
	const retainedSpaces = previous.spaces.flatMap(index => index < prefix ? [index] : index >= previous.text.length - suffix ? [index + value.length - previous.text.length] : []);
	const spaces = new Set(retainedSpaces);
	return {
		text: value.split('').filter((_, index) => !spaces.has(index)).join(''),
		start: start - retainedSpaces.filter(index => index < start).length,
		end: end - retainedSpaces.filter(index => index < end).length,
	};
}
