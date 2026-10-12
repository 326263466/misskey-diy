/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';
import { i18n } from '@/i18n.js';

export type ChatNotificationMode = 'all' | 'silent' | 'assistant' | 'blocked';
export type ChatConversationTarget = { userId: string; roomId?: never } | { roomId: string; userId?: never };
export type ChatConversationSetting = Misskey.entities.ChatConversationsUpdateResponse;

const settings = shallowRef<Record<string, Record<string, ChatConversationSetting>>>({});
const revisions = new Map<string, number>();
const loadSequences = new Map<string, number>();
const appliedLoads = new Map<string, number>();
let revision = 0;

export function chatConversationKey(target: { userId?: string | null; roomId?: string | null }): string {
	return target.roomId ? `room:${target.roomId}` : `user:${target.userId}`;
}

export function getChatConversationSetting(key: string): ChatConversationSetting | undefined {
	return settings.value[ensureSignin().id]?.[key];
}

export function forgetChatConversationSetting(key: string) {
	const accountId = ensureSignin().id;
	const next = { ...settings.value[accountId] };
	delete next[key];
	revisions.set(`${accountId}:${key}`, ++revision);
	settings.value = { ...settings.value, [accountId]: next };
}

export function clearChatManualUnread(key: string) {
	const accountId = ensureSignin().id;
	const setting = settings.value[accountId]?.[key];
	if (!setting?.markedUnread) return;
	revisions.set(`${accountId}:${key}`, ++revision);
	settings.value = { ...settings.value, [accountId]: { ...settings.value[accountId], [key]: { ...setting, markedUnread: false } } };
}

export async function loadChatConversationSettings(): Promise<void> {
	const accountId = ensureSignin().id;
	const startedAt = revision;
	const sequence = (loadSequences.get(accountId) ?? 0) + 1;
	loadSequences.set(accountId, sequence);
	const result = await misskeyApi('chat/conversations');
	if (sequence < (appliedLoads.get(accountId) ?? 0)) return;
	appliedLoads.set(accountId, sequence);
	const previous = settings.value[accountId] ?? {};
	const next: Record<string, ChatConversationSetting> = Object.fromEntries(result.map(item => [chatConversationKey(item), item]));
	// 列表轮询不能覆盖请求期间刚保存的会话设置。
	for (const [key, value] of Object.entries(previous)) {
		if ((revisions.get(`${accountId}:${key}`) ?? 0) > startedAt) next[key] = value;
	}
	for (const key of Object.keys(next)) {
		if ((revisions.get(`${accountId}:${key}`) ?? 0) > startedAt && !previous[key]) delete next[key];
	}
	settings.value = { ...settings.value, [accountId]: next };
}

export async function updateChatConversation(target: ChatConversationTarget, changes: { notificationMode?: ChatNotificationMode; hidden?: boolean; unread?: boolean }): Promise<ChatConversationSetting> {
	const accountId = ensureSignin().id;
	const result = await misskeyApiWithErrorToast('chat/conversations/update', { ...target, ...changes });
	const key = chatConversationKey(target);
	revisions.set(`${accountId}:${key}`, ++revision);
	settings.value = { ...settings.value, [accountId]: { ...settings.value[accountId], [key]: result } };
	return result;
}

export function getChatNotificationMode(key: string, room?: Misskey.entities.ChatRoom | null): ChatNotificationMode {
	const setting = getChatConversationSetting(key);
	if (setting) return setting.mutedUntil && Date.parse(setting.mutedUntil) <= Date.now() ? 'all' : setting.notificationMode;
	return room?.isMuted && (!room.mutedUntil || Date.parse(room.mutedUntil) > Date.now()) ? 'silent' : 'all';
}

export function chatNotificationOptions() {
	return [
		{ value: 'all' as const, label: i18n.ts._chat.allowNotifications },
		{ value: 'silent' as const, label: i18n.ts._chat.silentNotifications },
		{ value: 'assistant' as const, label: i18n.ts._chat.moveToAssistant },
		{ value: 'blocked' as const, label: i18n.ts._chat.blockMessages },
	];
}
