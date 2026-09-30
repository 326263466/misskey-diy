/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as mfm from 'mfm-js';
import { cjkTextEdge, formatCjkText, needsCjkSpace } from '@/utility/cjk-text-spacing.js';
import type { CjkCharacterKind } from '@/utility/cjk-text-spacing.js';

function hasInlineText(node: mfm.MfmNode): boolean {
	return ['bold', 'italic', 'strike', 'small', 'plain', 'link'].includes(node.type)
		|| (node.type === 'fn' && !['ruby', 'unixtime'].includes(node.props.name));
}

function getChildren(node: mfm.MfmNode): mfm.MfmNode[] | null {
	if (!('children' in node) || !Array.isArray(node.children)) return null;
	return node.children as mfm.MfmNode[];
}

function nodeEdge(node: mfm.MfmNode, edge: 'first' | 'last'): CjkCharacterKind {
	if (node.type === 'text') return cjkTextEdge(node.props.text, edge);
	if (node.type === 'unicodeEmoji' || node.type === 'emojiCode') return 'other';
	const children = getChildren(node);
	if (hasInlineText(node) && children != null) {
		const child = edge === 'first' ? children[0] : children.at(-1);
		return child ? nodeEdge(child, edge) : null;
	}
	return null;
}

/** Work on parsed display text so code, link targets and caller-owned ASTs remain intact. */
export function spaceMfmText(nodes: mfm.MfmNode[]): mfm.MfmNode[] {
	const result: mfm.MfmNode[] = [];
	for (const original of nodes) {
		let node = original;
		if (node.type === 'text') {
			if (node.props.text === '') continue;
			node = { ...node, props: { ...node.props, text: formatCjkText(node.props.text, false).text } };
		} else {
			const children = getChildren(node);
			if (children != null && (hasInlineText(node) || node.type === 'quote' || node.type === 'center')) {
				node = { ...node, children: spaceMfmText(children) } as mfm.MfmNode;
			}
		}
		const previous = result.at(-1);
		if (previous && needsCjkSpace(nodeEdge(previous, 'last'), nodeEdge(node, 'first'))) {
			result.push({ type: 'text', props: { text: '\u2009' } });
		}
		result.push(node);
	}
	return result;
}
