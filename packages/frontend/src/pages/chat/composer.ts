/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import * as mfm from 'mfm-js';
import type { ChatMember } from './member-menu.js';

export type ChatAttentionContext = {
	/** 是否为群聊消息；提及全体成员只在群聊中有效。 */
	isRoom?: boolean;
	/** 发送者在群内的身份；只有群主和管理员可以提及全体成员。 */
	senderRole?: ChatMember['role'];
};

export type ChatAttention = 'mentionedYou' | 'mentionedEveryone' | 'repliedYou' | 'quotedYou';

type ChatAttentionMessage = {
	fromUserId: string;
	text?: string | null;
	reply?: { id?: string; fromUser?: { id: string } | null } | null;
	replyType?: 'reply' | 'quote' | null;
};

// 判断消息与当前用户的关系；返回值同时是 i18n 的 _chat 键名。
export function getChatAttention(
	message: ChatAttentionMessage,
	me: { id: string; username: string },
	localHost: string,
	context: ChatAttentionContext = {},
): ChatAttention | null {
	if (message.fromUserId === me.id) return null;
	const localHostname = new URL(`https://${localHost}`).hostname.toLowerCase();
	const mentioned = (mfm.extract(mfm.parse(message.text ?? ''), node => node.type === 'mention') as mfm.MfmMention[])
		.filter(node => node.props.host == null || node.props.host.toLowerCase() === localHostname);
	if (mentioned.some(node => node.props.username.toLowerCase() === me.username.toLowerCase())) return 'mentionedYou';
	if (message.reply?.fromUser?.id === me.id && (message.replyType === 'reply' || message.replyType === 'quote')) return message.replyType === 'quote' ? 'quotedYou' : 'repliedYou';
	if (context.isRoom && (context.senderRole === 'owner' || context.senderRole === 'administrator')
		&& mentioned.some(node => node.props.username.toLowerCase() === 'everyone' || node.props.username.toLowerCase() === 'all')) {
		return 'mentionedEveryone';
	}
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

// undefined 表示可发言，null 表示永久禁言；叠加禁言按最后解除的时间计算。
export function getChatSilenceUntil(
	room: Pick<Misskey.entities.ChatRoom, 'ownerId' | 'isSilenced' | 'silenceUntil' | 'myIsSilenced' | 'mySilenceUntil'> | null | undefined,
	userId: string,
	now = Date.now(),
): string | null | undefined {
	if (!room || room.ownerId === userId) return undefined;
	const deadlines: (string | null)[] = [];
	for (const [silenced, until] of [[room.isSilenced, room.silenceUntil], [room.myIsSilenced, room.mySilenceUntil]] as const) {
		if (silenced && (until == null || Date.parse(until) > now)) deadlines.push(until ?? null);
	}
	if (deadlines.length === 0) return undefined;
	if (deadlines.includes(null)) return null;
	return (deadlines as string[]).reduce((latest, until) => Date.parse(until) > Date.parse(latest) ? until : latest);
}

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
