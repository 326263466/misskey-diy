/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import type * as Misskey from 'misskey-js';

function removeHashtags(nodes: mfm.MfmNode[]): mfm.MfmNode[] {
	return nodes.flatMap<mfm.MfmNode>(node => {
		if (node.type === 'hashtag') return [];
		if (node.children != null) {
			const children = removeHashtags(node.children);
			return children.length === 0 ? [] : [{ ...node, children } as mfm.MfmNode];
		}
		return [node];
	});
}

export function getNoteTopics(note: Pick<Misskey.entities.Note, 'text' | 'tags' | 'isHidden' | 'isDeleted'>, nodes: mfm.MfmNode[] | null = note.text ? mfm.parse(note.text) : null) {
	if (note.isHidden || note.isDeleted) return { nodes: null, tags: [] as string[] };
	const parsed = nodes ?? [];
	const parsedTags = (mfm.extract(parsed, node => node.type === 'hashtag') as mfm.MfmHashtag[]).map(node => node.props.hashtag);
	const seen = new Set<string>();
	const tags = [...parsedTags, ...(note.tags ?? [])].filter(tag => {
		const key = tag.normalize('NFKC').toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	const body = removeHashtags(parsed);
	while (body[0]?.type === 'text') {
		const text = body[0].props.text.trimStart();
		if (text !== '') { body[0] = { type: 'text', props: { text } }; break; }
		body.shift();
	}
	while (body.at(-1)?.type === 'text') {
		const last = body.at(-1) as mfm.MfmText;
		const text = last.props.text.trimEnd();
		if (text !== '') { body[body.length - 1] = { type: 'text', props: { text } }; break; }
		body.pop();
	}
	return { nodes: nodes == null ? null : body, tags };
}
