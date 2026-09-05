/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { toASCII } from 'punycode.js';
import type * as Misskey from 'misskey-js';
import { host as localHost } from '@@/js/config.js';

export function getNoteThreadAuthor(note: Misskey.entities.Note): Misskey.entities.UserLite | null {
	let current = note;
	while (current.replyId != null) {
		if (current.reply == null) return null;
		current = current.reply;
	}
	return current.user;
}

export function getNoteDisplayNodes(
	note: Misskey.entities.Note,
	omitMentionOf: Misskey.entities.UserLite | null = getNoteThreadAuthor(note),
	nodes: mfm.MfmNode[] | null = note.text ? mfm.parse(note.text) : null,
): mfm.MfmNode[] | null {
	if (nodes == null || note.replyId == null || omitMentionOf == null) return nodes;
	if (note.reply != null && note.reply.userId !== omitMentionOf.id) return nodes;

	const authorHost = toASCII(omitMentionOf.host ?? localHost).toLowerCase();
	let remaining = nodes;
	while (remaining[0]?.type === 'mention') {
		const mention = remaining[0].props;
		const mentionHost = toASCII(mention.host ?? note.user.host ?? localHost).toLowerCase();
		if (mention.username.toLowerCase() !== omitMentionOf.username.toLowerCase() || mentionHost !== authorHost) break;

		const next = remaining[1];
		// Only omit a reply prefix, not a mention attached to punctuation or other content.
		if (next != null && (next.type !== 'text' || !/^\s/.test(next.props.text))) break;

		remaining = remaining.slice(1);
		if (next?.type === 'text') {
			const text = next.props.text.trimStart();
			remaining = text === '' ? remaining.slice(1) : [{ type: 'text', props: { text } }, ...remaining.slice(1)];
		}
	}
	return remaining;
}
