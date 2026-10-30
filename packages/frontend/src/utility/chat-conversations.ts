/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { miLocalStorage } from '@/local-storage.js';
import { globalEvents } from '@/events.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import { forgetChatConversationSetting, loadChatConversationSettings } from '@/utility/chat-conversation-settings.js';
import { prefer } from '@/preferences.js';

type RecentConversation = { user: Misskey.entities.UserLite; updatedAt: string };
type RecentConversations = Record<string, RecentConversation[]>;
type ChatConversationTitle = { name: string; user: Misskey.entities.UserLite | null };
const conversationTitles = new Map<string, ChatConversationTitle>();
// 整页和浮窗可能同时打开同一会话，按次数记录。
const viewingConversations = new Map<string, number>();

export function markChatConversationViewing(conversationKey: string): () => void {
	viewingConversations.set(conversationKey, (viewingConversations.get(conversationKey) ?? 0) + 1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const count = (viewingConversations.get(conversationKey) ?? 1) - 1;
		if (count > 0) viewingConversations.set(conversationKey, count);
		else viewingConversations.delete(conversationKey);
	};
}

export function isChatConversationViewing(conversationKey: string): boolean {
	return viewingConversations.has(conversationKey);
}

export function nudgeChatEntry(element: HTMLElement | null | undefined): void {
	if (!element || typeof element.animate !== 'function' || !prefer.s.animation || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	element.animate([
		{ rotate: '0deg' },
		{ rotate: '-14deg', offset: 0.2 },
		{ rotate: '10deg', offset: 0.45 },
		{ rotate: '-6deg', offset: 0.7 },
		{ rotate: '0deg' },
	], { duration: 500, easing: 'ease-in-out' });
}

export function cacheChatConversationTitle(accountId: string, conversation: { user?: Misskey.entities.UserLite | null; room?: Pick<Misskey.entities.ChatRoom, 'id' | 'name'> | null }) {
	const { user, room } = conversation;
	const key = room ? `room:${room.id}` : user ? `user:${user.id}` : null;
	if (!key) return;
	const cacheKey = `${accountId}:${key}`;
	conversationTitles.delete(cacheKey);
	conversationTitles.set(cacheKey, { name: room?.name ?? user?.name ?? user?.username ?? '', user: room ? null : user ?? null });
	if (conversationTitles.size > 500) conversationTitles.delete(conversationTitles.keys().next().value!);
}

export function getChatConversationTitle(accountId: string, conversationKey: string): ChatConversationTitle | undefined {
	const cached = conversationTitles.get(`${accountId}:${conversationKey}`);
	if (cached) return cached;
	const user = getRecentChatConversations(accountId).find(entry => conversationKey === `user:${entry.user.id}`)?.user;
	return user ? { name: user.name ?? user.username, user } : undefined;
}

export function forgetChatRoom(accountId: string, roomId: string) {
	const key = `room:${roomId}`;
	conversationTitles.delete(`${accountId}:${key}`);
	forgetChatConversationSetting(key);
	try {
		miLocalStorage.removeItem(`chat-scroll:${accountId}:${key}`);
		miLocalStorage.removeItem(`chat-hidden-members:${accountId}:${roomId}`);
		const pins = JSON.parse(miLocalStorage.getItem(`chat-pinned:${accountId}`) ?? '[]');
		if (Array.isArray(pins)) miLocalStorage.setItem(`chat-pinned:${accountId}`, JSON.stringify(pins.filter(id => id !== key)));
		const draftPrefix = `misskey:chatDraft:${accountId}:${key}:`;
		for (const draftKey of Object.keys(localStorage)) if (draftKey.startsWith(draftPrefix)) localStorage.removeItem(draftKey);
	} catch { /* 本地缓存损坏不影响退出和即时移除。 */ }
	globalEvents.emit('chatPinsUpdated');
	globalEvents.emit('chatDraftUpdated');
	globalEvents.emit('chatRoomLeft', roomId);
}

export function getRecentChatConversations(accountId: string): RecentConversation[] {
	try {
		const entries = JSON.parse(miLocalStorage.getItem('chatRecentConversations') ?? '{}')[accountId];
		return Array.isArray(entries) ? entries.filter(entry => typeof entry?.user?.id === 'string' && typeof entry?.user?.username === 'string' && typeof entry?.updatedAt === 'string').slice(0, 100) : [];
	} catch { return []; }
}

// 最近会话只存在本机，账号已不存在时服务端无法记录“移除”，直接从本机删除。
export function forgetRecentChatConversation(accountId: string, userId: string) {
	conversationTitles.delete(`${accountId}:user:${userId}`);
	try {
		const all = JSON.parse(miLocalStorage.getItem('chatRecentConversations') ?? '{}');
		if (all == null || Array.isArray(all) || typeof all !== 'object' || !Array.isArray(all[accountId])) return;
		all[accountId] = all[accountId].filter(entry => entry?.user?.id !== userId);
		miLocalStorage.setItem('chatRecentConversations', JSON.stringify(all));
	} catch { /* 本地缓存损坏时只从当前列表移除。 */ }
}

export function rememberChatConversation(accountId: string, user: Misskey.entities.UserLite) {
	if (user.id === accountId) return;
	cacheChatConversationTitle(accountId, { user });
	try {
		let all: RecentConversations;
		try { all = JSON.parse(miLocalStorage.getItem('chatRecentConversations') ?? '{}'); } catch { all = {}; }
		if (all == null || Array.isArray(all) || typeof all !== 'object') all = {};
		const { id, username, name, host, avatarUrl, avatarBlurhash, avatarDecorations, emojis, isBot, isCat } = user;
		const recent: RecentConversation = { user: { id, username, name, host, avatarUrl, avatarBlurhash, avatarDecorations, emojis, isBot, isCat, onlineStatus: 'unknown' }, updatedAt: new Date().toISOString() };
		all[accountId] = [recent, ...getRecentChatConversations(accountId).filter(entry => entry.user.id !== user.id)].slice(0, 100);
		miLocalStorage.setItem('chatRecentConversations', JSON.stringify(all));
	} finally {
		globalEvents.emit('chatConversationStarted', user);
	}
}

export async function setChatRoomMuted(room: Misskey.entities.ChatRoom, mute: boolean): Promise<Misskey.entities.ChatRoom | null> {
	let duration: number | undefined;
	if (mute) {
		const { canceled, result } = await os.select({
			title: i18n.ts._chat.doNotDisturbPeriod,
			items: [
				{ value: 3600, label: i18n.ts.oneHour },
				{ value: 600, label: i18n.ts.tenMinutes },
				{ value: 86400, label: i18n.ts.oneDay },
				{ value: 604800, label: i18n.ts.oneWeek },
				{ value: 0, label: i18n.ts.indefinitely },
			],
			default: 3600,
		});
		if (canceled) return null;
		duration = result || undefined;
	}
	try {
		await misskeyApi('chat/rooms/mute', { roomId: room.id, mute, duration });
		const updated = await misskeyApi('chat/rooms/show', { roomId: room.id });
		await loadChatConversationSettings();
		globalEvents.emit('chatRoomUpdated', updated);
		return updated;
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
		return null;
	}
}
