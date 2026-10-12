/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import * as mfm from 'mfm-js';

export function getChatAttention(message: Pick<Misskey.entities.ChatMessageLite, 'fromUserId' | 'text' | 'reply' | 'replyType'>, me: { id: string; username: string }, localHost: string): 'mentionedYou' | null {
	if (message.fromUserId === me.id) return null;
	const localHostname = new URL(`https://${localHost}`).hostname.toLowerCase();
	const mentioned = (mfm.extract(mfm.parse(message.text ?? ''), node => node.type === 'mention') as mfm.MfmMention[])
		.some(node => node.props.username.toLowerCase() === me.username.toLowerCase() && (node.props.host == null || node.props.host.toLowerCase() === localHostname));
	if (mentioned) return 'mentionedYou';
	return null;
}

// 引用/回复/编辑预览固定单行显示：原文中的换行和连续空白压成单个空格，超长由样式省略
export function toSingleLine(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

export type ChatDraftBlock = {
	type: 'text';
	text: string;
} | {
	type: 'code';
	text: string;
	language: string;
};

export type ChatReply = {
	id: string;
	acct: string;
	name?: string;
	user?: Misskey.entities.UserLite;
	type: 'reply' | 'quote';
	text: string;
};

export type ChatComposeAction = 'reply' | 'quote' | 'mention';

export function parseChatDraft(source: string): ChatDraftBlock[] {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const blocks: ChatDraftBlock[] = [];
	let plain: string[] = [];

	for (let index = 0; index < lines.length; index++) {
		const fence = /^```([^`]*)$/.exec(lines[index]);
		// 尚未换行的反引号仍是普通输入，避免输入第三个符号时抢走光标。
		if (!fence || index === lines.length - 1) {
			plain.push(lines[index]);
			continue;
		}
		if (plain.length > 0) blocks.push({ type: 'text', text: plain.join('\n') });
		plain = [];
		const code: string[] = [];
		while (++index < lines.length && lines[index] !== '```') code.push(lines[index]);
		blocks.push({ type: 'code', text: code.join('\n'), language: fence[1].trim() });
	}

	if (plain.length > 0) blocks.push({ type: 'text', text: plain.join('\n') });
	return blocks.length > 0 ? blocks : [{ type: 'text', text: '' }];
}

export function serializeChatDraft(blocks: ChatDraftBlock[]): string {
	return blocks.map(block => block.type === 'code' ? `\`\`\`${block.language}\n${block.text}\n\`\`\`` : block.text).join('\n');
}

export function chatTextForSend(source: string): string {
	return serializeChatDraft(parseChatDraft(source).filter(block => block.type !== 'code' || block.text.trim() !== ''));
}
