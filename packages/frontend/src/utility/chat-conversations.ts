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

type RecentConversation = { user: Misskey.entities.UserLite; updatedAt: string };
type RecentConversations = Record<string, RecentConversation[]>;
type ChatConversationTitle = { name: string; user: Misskey.entities.UserLite | null };
const conversationTitles = new Map<string, ChatConversationTitle>();

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
		const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') ?? '{}');
		if (drafts && typeof drafts === 'object' && !Array.isArray(drafts)) {
			delete drafts[`${accountId}:${key}`];
			miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
		}
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
			title: i18n.ts.mutePeriod,
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
