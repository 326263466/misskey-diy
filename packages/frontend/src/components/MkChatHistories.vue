<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<slot :history="history" :initializing="initializing" :failed="failed" :retry="() => fetchHistory(true)">
	<button v-if="compact && !roomsOnly && (assistantOpen || assistantHistory.length > 0)" type="button" class="_button" :class="$style.assistantButton" @click="assistantOpen = !assistantOpen"><i :class="assistantOpen ? 'ti ti-arrow-left' : 'ti ti-folders'" aria-hidden="true"></i>{{ assistantOpen ? i18n.ts.goBack : i18n.ts._chat.groupAssistant }}<span v-if="!assistantOpen">{{ assistantHistory.length }}</span></button>
	<div v-if="displayHistory.length > 0" :class="compact ? $style.compactList : '_gaps_s'">
		<MkA
			v-for="item in displayHistory"
			:key="item.id"
			:class="[$style.message, compact ? $style.compact : '_panel', { [$style.selected]: item.to === selectedTo, [$style.isRead]: !isUnread(item) }]"
			:to="item.to"
			:aria-current="item.to === selectedTo ? 'page' : undefined"
			@click.capture="keepConversationSelected($event, item)"
			@dblclick="showConversationLatest($event, item)"
			@contextmenu.capture="showConversationMenu($event, item)"
			@keydown.shift.f10="showConversationMenu($event, item)"
		>
			<img v-if="item.room?.avatarUrl" :class="$style.messageAvatar" :src="item.room.avatarUrl" alt=""/>
			<MkAvatar v-else-if="item.room" :class="$style.messageAvatar" :user="item.room.owner" :preview="false" :link="false"/>
			<MkAvatar v-else-if="item.other" :class="$style.messageAvatar" :user="item.other" indicator :preview="false"/>
			<div :class="$style.messageBody">
				<header v-if="item.room" :class="$style.messageHeader">
					<span :class="$style.messageHeaderName"><Mfm :text="item.room.name" :plain="true" :nowrap="true"/></span>
				</header>
				<header v-else :class="$style.messageHeader">
					<MkUserName :class="$style.messageHeaderName" :user="item.other!"/>
					<MkAcct v-if="!compact" :class="$style.messageHeaderUsername" :user="item.other!"/>
				</header>
				<div :class="$style.messageBodyText">
					<div :class="$style.preview">
						<span v-if="getChatNotificationMode(item.id, item.room) === 'blocked'">{{ i18n.ts._chat.blockMessages }}</span>
						<template v-else-if="draftPreview(item)">
							<span :class="$style.youSaid">[{{ i18n.ts.draft }}]</span>
							<Mfm :class="$style.previewText" :text="draftPreview(item)" :plain="true" :nowrap="true"/>
						</template>
						<Mfm v-else-if="item.message?.systemEvent" :class="$style.previewText" :text="systemMessagePreview(item.message)" :plain="true" :nowrap="true"/>
						<template v-else>
							<span v-if="item.isMe" :class="$style.youSaid">{{ i18n.ts.you }}：</span>
							<span v-else-if="item.room && item.message?.fromUser" :class="$style.youSaid"><MkUserName :user="item.message.fromUser"/>：</span>
							<span v-if="item.message?.redPacket" :class="$style.previewText"><i class="mi-red-packet" aria-hidden="true"></i>{{ i18n.ts._redPacket.title }}</span>
							<span v-if="item.message?.file" :class="$style.previewAttachment">[{{ previewFileType(item.message.file) }}]</span>
							<span v-if="item.message?.isPoke" :class="$style.previewText">{{ i18n.ts._chat.poked }} <MkUserName v-if="item.message.pokeUser" :user="item.message.pokeUser"/></span>
							<Mfm v-if="item.message?.text" :class="$style.previewText" :text="item.message.text" :plain="true" :nowrap="true" :author="item.message.fromUser"/>
						</template>
					</div>
					<span :class="$style.indicators">
						<i v-if="getChatNotificationMode(item.id, item.room) !== 'all'" class="ti ti-volume-3" :class="$style.statusIcon" role="img" :aria-label="i18n.ts._chat.enableDoNotDisturb"></i>
						<span v-if="isUnread(item)" :class="[$style.unreadBadge, { [$style.unreadDot]: !unreadCounts[item.id] }]" :aria-label="unreadCounts[item.id] ? i18n.tsx._chat.unreadMessages({ count: unreadCounts[item.id] }) : i18n.ts.unread">{{ unreadCounts[item.id] > 999 ? '999+' : unreadCounts[item.id] || '' }}</span>
						<i v-else-if="compact && pinnedIds.includes(item.id)" class="ti ti-pin-filled" :class="$style.statusIcon" role="img" :aria-label="i18n.ts.pin"></i>
					</span>
				</div>
			</div>
			<MkTime v-if="item.message" :time="item.message.createdAt" :class="$style.messageHeaderTime"/>
		</MkA>
	</div>
	<MkError v-if="failed && history.length === 0" @retry="fetchHistory"/>
	<MkResult v-else-if="!initializing && displayHistory.length === 0 && (roomsOnly || assistantOpen || assistantHistory.length === 0)" type="empty" :text="roomsOnly ? i18n.ts._chat.noRooms : i18n.ts._chat.noHistory"/>
	<MkLoading v-if="initializing && !hideLoading"/>
</slot>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import * as os from '@/os.js';
import { cacheChatConversationTitle, forgetChatRoom, getRecentChatConversations } from '@/utility/chat-conversations.js';
import { miLocalStorage } from '@/local-storage.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { chatNotificationOptions, getChatConversationSetting, getChatNotificationMode, loadChatConversationSettings, updateChatConversation } from '@/utility/chat-conversation-settings.js';
import type { ChatConversationTarget } from '@/utility/chat-conversation-settings.js';
import type { MenuItem } from '@/types/menu.js';
import { useRouter } from '@/router.js';
import { useStream } from '@/stream.js';

const $i = ensureSignin();
const router = useRouter();

function systemMessagePreview(message: NonNullable<ChatHistoryItem['message']>): string {
	const event = message.systemEvent;
	if (!event) return '';
	const actor = message.fromUserId === $i.id ? i18n.ts.you : message.fromUser?.name || message.fromUser?.username || '';
	return `${event.invited ? `${actor}${i18n.ts._chat.invitedMembers}` : ''}${event.users.map(user => user.name || user.username).join(' ')}${i18n.ts._chat.membersJoined}`;
}

function previewFileType(file: Misskey.entities.DriveFile): string {
	if (file.type.startsWith('image/')) return i18n.ts.image;
	if (file.type.startsWith('video/')) return i18n.ts.video;
	if (file.type.startsWith('audio/')) return i18n.ts.audio;
	return i18n.ts.file;
}

const props = withDefaults(defineProps<{
	limit?: number;
	all?: boolean;
	compact?: boolean;
	selectedTo?: string | null;
	query?: string;
	hideLoading?: boolean;
	roomsOnly?: boolean;
}>(), { limit: 10, all: false, compact: false, selectedTo: null, query: '' });

type ChatHistoryItem = {
	id: string;
	to: string;
	message: Misskey.entities.ChatMessage | null;
	room: Misskey.entities.ChatRoom | null;
	other: Misskey.entities.ChatMessage['fromUser'] | Misskey.entities.ChatMessage['toUser'] | null;
	isMe: boolean;
};

const history = ref<ChatHistoryItem[]>([]);
const unreadCounts = ref<Record<string, number>>({});
watch(history, items => {
	for (const item of items) cacheChatConversationTitle($i.id, { user: item.other, room: item.room });
}, { deep: true, flush: 'sync' });
const pinsKey = `chat-pinned:${$i.id}` as const;

function keepConversationSelected(event: MouseEvent, item: ChatHistoryItem) {
	if (item.to !== props.selectedTo || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
	event.preventDefault();
	event.stopImmediatePropagation();
}

function showConversationLatest(event: MouseEvent, item: ChatHistoryItem) {
	if (item.to !== props.selectedTo || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
	event.preventDefault();
	// 同路径仅触发现有 same 事件，交给聊天室滚动，不新增历史记录。
	router.pushByPath(item.to);
}

function readPins(): string[] {
	try {
		const saved = JSON.parse(miLocalStorage.getItem(pinsKey) ?? '[]');
		return Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === 'string'))].slice(0, 5) : [];
	} catch { return []; }
}

const pinnedIds = ref(readPins());
useGlobalEvent('chatPinsUpdated', () => { pinnedIds.value = readPins(); });

function onPinsStorage(event: StorageEvent) {
	if (event.key === pinsKey || event.key == null) pinnedIds.value = readPins();
}

window.addEventListener('storage', onPinsStorage);
onBeforeUnmount(() => window.removeEventListener('storage', onPinsStorage));

function togglePin(item: ChatHistoryItem) {
	const pins = readPins();
	const pinned = pins.includes(item.id);
	if (!pinned && pins.length >= 5) { os.toast(i18n.ts._chat.pinLimit, 'error'); return; }
	try {
		miLocalStorage.setItem(pinsKey, JSON.stringify(pinned ? pins.filter(id => id !== item.id) : [...pins, item.id]));
		pinnedIds.value = readPins();
		globalEvents.emit('chatPinsUpdated');
	} catch { os.toast(i18n.ts.somethingHappened, 'error'); }
}

function showConversationMenu(event: MouseEvent | KeyboardEvent, item: ChatHistoryItem) {
	if (!props.compact) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	const pinned = pinnedIds.value.includes(item.id);
	const unread = isUnread(item);
	const mode = getChatNotificationMode(item.id, item.room);
	const target: ChatConversationTarget = item.room ? { roomId: item.room.id } : { userId: item.other!.id };
	const menu: MenuItem[] = [
		{ text: pinned ? i18n.ts.unpin : i18n.ts.pin, icon: pinned ? 'ti ti-pinned-off' : 'ti ti-pin', action: () => togglePin(item) },
		{ text: item.room ? i18n.ts._chat.copyRoomId : i18n.ts._chat.copyAccount, icon: 'ti ti-copy', action: () => { void copyToClipboard(item.room?.id ?? Misskey.acct.toString(item.other!)); } },
		{ text: unread ? i18n.ts._chat.markRead : i18n.ts._chat.markUnread, icon: unread ? 'ti ti-check' : 'ti ti-message-circle', action: () => saveSetting(target, { unread: !unread }, () => {
			if (item.message) item.message.isRead = true;
			if (unread) { unreadCounts.value[item.id] = 0; unreadVersions.set(item.id, ++requestSequence); }
		}) },
		{ text: i18n.ts._chat.openChatWindow, icon: 'ti ti-app-window', action: () => os.pageWindow(item.to) },
	];
	if (item.room) {
		menu.push({ type: 'parent', text: i18n.ts._chat.messageSettings, icon: 'ti ti-users', children: [
			...chatNotificationOptions().map(option => ({ type: 'button' as const, text: option.label, icon: mode === option.value ? 'ti ti-check' : undefined, active: mode === option.value, actionOnActive: true, action: () => mode === option.value ? undefined : saveSetting(target, { notificationMode: option.value }) })),
			{ type: 'divider' },
			{ text: i18n.ts._chat.batchMessageSettings, icon: 'ti ti-list-check', action: showMessageSettings },
		] });
	} else {
		menu.push({ text: mode === 'all' ? i18n.ts._chat.enableDoNotDisturb : i18n.ts._chat.disableDoNotDisturb, icon: 'ti ti-bell-off', action: () => saveSetting(target, { notificationMode: mode === 'all' ? 'silent' : 'all' }) });
	}
	menu.push({ type: 'divider' }, { text: i18n.ts._chat.removeFromList, icon: 'ti ti-trash', action: () => saveSetting(target, { hidden: true }, () => {
		if (pinnedIds.value.includes(item.id)) togglePin(item);
		if (item.to === props.selectedTo) router.push('/chat');
	}) });
	if (event.type === 'contextmenu') os.contextMenu(menu, event as PointerEvent);
	else os.popupMenu(menu, event.currentTarget as HTMLElement);
}

const savingSettings = new Set<string>();

async function saveSetting(target: ChatConversationTarget, changes: Parameters<typeof updateChatConversation>[1], saved?: () => void) {
	const key = target.roomId ?? target.userId;
	if (savingSettings.has(key)) return;
	savingSettings.add(key);
	try { await updateChatConversation(target, changes); saved?.(); } catch { /* 错误由 API helper 提示，保留列表状态。 */ } finally { savingSettings.delete(key); }
}

function showMessageSettings() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/pages/chat/message-settings-dialog.vue')), {
		rooms: history.value.flatMap(item => item.room ? [item.room] : []),
	}, { closed: () => dispose() });
}

function isUnread(item: ChatHistoryItem) {
	if (getChatConversationSetting(item.id)?.markedUnread) return true;
	if (getChatNotificationMode(item.id, item.room) === 'blocked') return false;
	if (unreadCounts.value[item.id] != null) return unreadCounts.value[item.id] > 0;
	return item.message?.isRead === false;
}

const drafts = ref<Record<string, { data?: { text?: string; redPacket?: unknown } }>>({});

function refreshDrafts() {
	try { drafts.value = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') ?? '{}'); } catch { drafts.value = {}; }
}

function draftPreview(item: ChatHistoryItem): string {
	const data = drafts.value?.[`${$i.id}:${item.id}`]?.data;
	return data?.text || (data?.redPacket ? i18n.ts._redPacket.title : '');
}

refreshDrafts();
useGlobalEvent('chatDraftUpdated', refreshDrafts);
useGlobalEvent('chatConversationStarted', user => {
	if (!props.all || history.value.some(item => item.other?.id === user.id)) return;
	history.value.unshift({ id: `user:${user.id}`, to: `/chat/user/${user.id}`, room: null, other: user, isMe: false, message: null });
});
const pendingRoomUpdates = new Map<string, Misskey.entities.ChatRoom>();
const leftRooms = new Map<string, number>();
useGlobalEvent('chatRoomLeft', roomId => {
	leftRooms.set(roomId, ++requestSequence);
	pendingRoomUpdates.delete(roomId);
	pendingHistoryUpdates.delete(`room:${roomId}`);
	history.value = history.value.filter(item => item.room?.id !== roomId);
	delete unreadCounts.value[`room:${roomId}`];
	unreadVersions.set(`room:${roomId}`, ++requestSequence);
	readThroughIds.delete(`room:${roomId}`);
	queuedUnreadRefreshes.delete(`room:${roomId}`);
});
useGlobalEvent('chatRoomUpdated', room => {
	if (room.isMember || room.ownerId === $i.id) leftRooms.delete(room.id);
	if (fetching.value) pendingRoomUpdates.set(room.id, room);
	if (props.all && (room.ownerId === $i.id || room.isMember === true) && !history.value.some(item => item.room?.id === room.id)) {
		history.value.unshift({ id: `room:${room.id}`, to: `/chat/room/${room.id}`, room, other: null, isMe: false, message: null });
	}
	for (const item of history.value) {
		if (item.room?.id === room.id) item.room = room;
	}
});
const availableHistory = computed(() => history.value.filter(item => {
	const setting = getChatConversationSetting(item.id);
	return !setting?.hidden || (item.message != null && item.message.id > (setting.hiddenThroughId ?? ''));
}));
const visibleHistory = computed(() => {
	const query = props.query.trim().toLocaleLowerCase();
	const available = props.roomsOnly ? availableHistory.value.filter(item => item.room != null) : availableHistory.value;
	const items = query === '' ? available : available.filter(item => [
		item.room?.name,
		item.other?.name,
		item.other?.username,
		item.message?.text,
	].some(value => value?.toLocaleLowerCase().includes(query)));
	if (!props.compact) return items;
	const name = (item: ChatHistoryItem) => item.room?.name || item.other?.name || item.other?.username || '';
	return items.toSorted((a, b) => Number(pinnedIds.value.includes(b.id)) - Number(pinnedIds.value.includes(a.id))
		|| name(a).localeCompare(name(b), 'zh-CN-u-co-pinyin', { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id));
});
const assistantOpen = ref(false);
watch(() => availableHistory.value.some(item => getChatNotificationMode(item.id, item.room) === 'assistant'), hasRooms => {
	if (!hasRooms) assistantOpen.value = false;
});
const assistantHistory = computed(() => visibleHistory.value.filter(item => getChatNotificationMode(item.id, item.room) === 'assistant'));
const displayHistory = computed(() => !props.compact || props.roomsOnly || props.query.trim() ? visibleHistory.value : assistantOpen.value ? assistantHistory.value : visibleHistory.value.filter(item => getChatNotificationMode(item.id, item.room) !== 'assistant'));

const initializing = ref(true);
const fetching = ref(false);
const failed = ref(false);
let disposed = false;
let lastFullRefresh: number | null = null;
let refreshQueued = false;
const deletedMessageIds = new Set<string>();
const pendingHistoryUpdates = new Map<string, ChatHistoryItem>();
const refreshingConversations = new Set<string>();
const queuedConversations = new Set<string>();
let requestSequence = 0;
const appliedSequences = new Map<string, number>();
const unreadVersions = new Map<string, number>();
const readThroughIds = new Map<string, string>();
const unreadRequests = new Map<string, Promise<void>>();
const queuedUnreadRefreshes = new Set<string>();
const stream = useStream();
const mainConnection = stream.useChannel('main');

useGlobalEvent('chatUnreadChanged', ({ id, count, throughId }) => {
	unreadVersions.set(id, ++requestSequence);
	unreadCounts.value[id] = count;
	if (throughId && throughId > (readThroughIds.get(id) ?? '')) readThroughIds.set(id, throughId);
	const item = history.value.find(item => item.id === id);
	if (item?.message) item.message.isRead = count === 0;
});

function refreshUnread(item: ChatHistoryItem): Promise<void> {
	if (unreadRequests.has(item.id)) {
		queuedUnreadRefreshes.add(item.id);
		return unreadRequests.get(item.id)!;
	}
	if (item.message?.isRead !== false && !unreadCounts.value[item.id]) {
		unreadCounts.value[item.id] = 0;
		return Promise.resolve();
	}
	const request = (async () => {
		try {
			do {
				queuedUnreadRefreshes.delete(item.id);
				const version = unreadVersions.get(item.id) ?? 0;
				const unread = await misskeyApi('chat/unread', item.room ? { roomId: item.room.id } : { userId: item.other!.id });
				if (disposed || (item.room && leftRooms.has(item.room.id))) return;
				const throughId = readThroughIds.get(item.id);
				// 本地已读先于服务器确认；旧快照不能把已读消息重新计入。
				if (version === (unreadVersions.get(item.id) ?? 0) && !(throughId && unread.firstMessageId && unread.firstMessageId <= throughId)) {
					unreadCounts.value[item.id] = unread.count;
					const current = history.value.find(current => current.id === item.id);
					if (current?.message) current.message.isRead = unread.count === 0;
				}
			} while (queuedUnreadRefreshes.has(item.id));
		} catch { /* 保留已知计数，下一条消息或轮询时重新校准。 */ } finally {
			unreadRequests.delete(item.id);
			queuedUnreadRefreshes.delete(item.id);
		}
	})();
	unreadRequests.set(item.id, request);
	return request;
}

type HistoryUpdate = { messageId: string; userId?: string; roomId?: string; deleted?: boolean };

function onHistoryUpdated(event: HistoryUpdate) {
	if (disposed) return;
	if (event.roomId && leftRooms.has(event.roomId)) { void fetchHistory(true); return; }
	const id = event.roomId ? `room:${event.roomId}` : `user:${event.userId}`;
	const item = history.value.find(item => item.id === id);
	if (event.deleted) {
		deletedMessageIds.add(event.messageId);
		if (item?.message?.id === event.messageId) {
			item.message = null;
			item.isMe = false;
		}
	}
	if (fetching.value && item) pendingHistoryUpdates.set(id, { ...item });
	void refreshConversation(event, id);
}

async function refreshConversation(event: HistoryUpdate, id: string) {
	if (!event.roomId && !event.userId) return;
	if (refreshingConversations.has(id)) {
		queuedConversations.add(id);
		return;
	}
	refreshingConversations.add(id);
	try {
		do {
			queuedConversations.delete(id);
			const sequence = ++requestSequence;
			const messages = await misskeyApi('chat/history', { limit: 1, room: !!event.roomId, ...(event.roomId ? { roomId: event.roomId } : { userId: event.userId }) });
			if (disposed || (event.roomId && leftRooms.has(event.roomId))) return;
			if ((appliedSequences.get(id) ?? 0) > sequence) continue;
			const message = messages.find(message => !deletedMessageIds.has(message.id)) ?? null;
			const current = history.value.find(item => item.id === id);
			const other = message ? (message.toRoomId ? null : message.fromUserId === $i.id ? message.toUser : message.fromUser) : current?.other;
			if (!current && !message) continue;
			const item: ChatHistoryItem = {
				id, to: event.roomId ? `/chat/room/${event.roomId}` : `/chat/user/${event.userId}`,
				message, other: other ?? null, room: message?.toRoom ?? current?.room ?? null, isMe: message?.fromUserId === $i.id,
			};
			if (current) Object.assign(current, item);
			else history.value.unshift(item);
			appliedSequences.set(id, sequence);
			history.value = sortHistory(history.value);
			if (fetching.value) pendingHistoryUpdates.set(id, { ...item });
			if ((unreadVersions.get(id) ?? 0) <= sequence) void refreshUnread(item);
		} while (!disposed && queuedConversations.has(id));
	} catch {
		// 保留当前预览，断线重连或下一次轮询会重新校准。
		lastFullRefresh = null;
	} finally {
		refreshingConversations.delete(id);
		queuedConversations.delete(id);
	}
}

function onConnected() {
	void fetchHistory(true);
}

function sortHistory(items: ChatHistoryItem[]): ChatHistoryItem[] {
	const counts = { room: 0, user: 0 };
	return items.toSorted((a, b) => (b.message?.createdAt ?? b.room?.createdAt ?? '').localeCompare(a.message?.createdAt ?? a.room?.createdAt ?? ''))
		.filter(item => props.all || ++counts[item.room ? 'room' : 'user'] <= props.limit);
}

mainConnection.on('chatHistoryUpdated', onHistoryUpdated);
mainConnection.on('chatReadState', ({ hasUnreadChatMessages }) => {
	for (const item of history.value) {
		if (hasUnreadChatMessages) {
			if (isUnread(item)) void refreshUnread(item);
		} else {
			unreadVersions.set(item.id, ++requestSequence);
			unreadCounts.value[item.id] = 0;
			if (item.message) item.message.isRead = true;
		}
	}
});
mainConnection.on('chatRoomLeft', ({ roomId }) => forgetChatRoom($i.id, roomId));
stream.on('_connected_', onConnected);

async function fetchMessages(room: boolean, allPages: boolean): Promise<Misskey.entities.ChatMessage[]> {
	const messages: Misskey.entities.ChatMessage[] = [];
	const limit = props.all ? 100 : props.limit;
	let previousLastId: string | undefined;
	do {
		const batch = await misskeyApi('chat/history', { room, limit, ...(allPages ? { offset: messages.length } : {}) });
		if (disposed) return [];
		if (batch.length > 0 && batch.at(-1)!.id === previousLastId) throw new Error('Chat history pagination did not advance');
		previousLastId = batch.at(-1)?.id;
		messages.push(...batch);
		if (!allPages || batch.length < limit) return messages;
	} while (!disposed);
	return [];
}

async function fetchAllPages<T extends { id: string }>(request: (untilId?: string) => Promise<T[]>): Promise<T[]> {
	const items: T[] = [];
	let untilId: string | undefined;
	do {
		const batch = await request(untilId);
		if (disposed) return [];
		items.push(...batch);
		if (batch.length < 100) return items;
		const nextId = batch.at(-1)!.id;
		if (nextId === untilId) throw new Error('Chat room pagination did not advance');
		untilId = nextId;
	} while (!disposed);
	return [];
}

async function fetchHistory(forceFull = false) {
	if (disposed) return;
	if (fetching.value) {
		refreshQueued ||= forceFull;
		return;
	}

	fetching.value = true;
	const sequence = ++requestSequence;
	pendingRoomUpdates.clear();
	pendingHistoryUpdates.clear();
	// 轮询只更新最近会话，定期完整校准以移除已退出或被屏蔽的会话。
	const refreshAll = props.all && (forceFull || lastFullRefresh == null || Date.now() - lastFullRefresh >= 5 * 60 * 1000);
	try {
		const [usersResult, roomsResult, ownedResult, membershipsResult, settingsResult] = await Promise.allSettled([
			fetchMessages(false, refreshAll),
			fetchMessages(true, refreshAll),
			refreshAll ? fetchAllPages(untilId => misskeyApi('chat/rooms/owned', { limit: 100, untilId })) : [],
			refreshAll ? fetchAllPages(untilId => misskeyApi('chat/rooms/joining', { limit: 100, untilId })) : [],
			props.all ? loadChatConversationSettings() : undefined,
		]);
		if (disposed) return;
		if (usersResult.status === 'rejected') throw usersResult.reason;
		if (roomsResult.status === 'rejected') throw roomsResult.reason;
		if (ownedResult.status === 'rejected') throw ownedResult.reason;
		if (membershipsResult.status === 'rejected') throw membershipsResult.reason;
		if (settingsResult.status === 'rejected') throw settingsResult.reason;
		const userMessages = usersResult.value;
		const roomMessages = roomsResult.value;
		const ownedRooms = ownedResult.value;
		const memberships = membershipsResult.value;
		// 仅退群之后发起的成员快照可以证明已重新加入，旧响应不能解除退群标记。
		for (const room of [...ownedRooms, ...memberships.flatMap(membership => membership.room ? [membership.room] : [])]) {
			if ((leftRooms.get(room.id) ?? Infinity) < sequence) leftRooms.delete(room.id);
		}
		const conversations = new Map<string, ChatHistoryItem>(props.all && !refreshAll ? history.value.map(item => [item.id, item]) : []);
		for (const room of [...ownedRooms, ...memberships.flatMap(membership => membership.room ? [membership.room] : [])]) {
			conversations.set(`room:${room.id}`, { id: `room:${room.id}`, to: `/chat/room/${room.id}`, room, other: null, isMe: false, message: null });
		}
		for (const message of [...userMessages, ...roomMessages]
			.filter(message => !deletedMessageIds.has(message.id))
			.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))) {
			const other = message.toRoomId ? null : (message.fromUserId === $i.id ? message.toUser : message.fromUser);
			if (!message.toRoomId && !other) continue;
			const id = message.toRoomId ? `room:${message.toRoomId}` : `user:${other!.id}`;
			conversations.set(id, {
				id,
				to: message.toRoomId ? `/chat/room/${message.toRoomId}` : `/chat/user/${other!.id}`,
				message,
				room: message.toRoom ?? conversations.get(id)?.room ?? null,
				other,
				isMe: message.fromUserId === $i.id,
			});
		}
		// 定向刷新期间保留已收到的新状态，慢速全量请求不能覆盖即时预览。
		for (const [id, item] of pendingHistoryUpdates) conversations.set(id, item);
		for (const item of history.value) {
			if ((appliedSequences.get(item.id) ?? 0) > sequence) conversations.set(item.id, item);
		}
		// 保存群资料后，进行中的旧列表请求不能把头像和名称改回去。
		for (const item of conversations.values()) {
			if (item.room && pendingRoomUpdates.has(item.room.id)) item.room = pendingRoomUpdates.get(item.room.id)!;
		}
		for (const room of pendingRoomUpdates.values()) {
			if (props.all && (room.ownerId === $i.id || room.isMember === true) && !conversations.has(`room:${room.id}`)) {
				conversations.set(`room:${room.id}`, { id: `room:${room.id}`, to: `/chat/room/${room.id}`, room, other: null, isMe: false, message: null });
			}
		}
		if (props.all) {
			for (const { user } of getRecentChatConversations($i.id)) {
				if (!conversations.has(`user:${user.id}`)) conversations.set(`user:${user.id}`, { id: `user:${user.id}`, to: `/chat/user/${user.id}`, room: null, other: user, isMe: false, message: null });
			}
		}
		history.value = sortHistory([...conversations.values()].filter(item => !item.room || !leftRooms.has(item.room.id)));
		for (const item of history.value) {
			if ((unreadVersions.get(item.id) ?? 0) <= sequence) void refreshUnread(item);
		}
		for (const item of history.value) appliedSequences.set(item.id, Math.max(sequence, appliedSequences.get(item.id) ?? 0));
		if (refreshAll) {
			const pins = readPins();
			const availablePins = pins.filter(id => conversations.has(id));
			if (availablePins.length !== pins.length) {
				try {
					miLocalStorage.setItem(pinsKey, JSON.stringify(availablePins));
					pinnedIds.value = availablePins;
					globalEvents.emit('chatPinsUpdated');
				} catch { /* 存储暂时不可用时保留设置，列表仍可使用。 */ }
			}
		}
		if (refreshAll) lastFullRefresh = Date.now();
		failed.value = false;
	} catch {
		if (!disposed) failed.value = true;
	} finally {
		if (!disposed) {
			fetching.value = false;
			initializing.value = false;
			if (refreshQueued) {
				refreshQueued = false;
				void fetchHistory(true);
			}
		}
	}
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
});

onDeactivated(() => {
	isActivated = false;
});

useInterval(() => {
	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (isActivated) {
		fetchHistory();
	}
}, 1000 * 10, {
	immediate: false,
	afterMounted: true,
});

onActivated(() => {
	fetchHistory(true);
});

onMounted(() => {
	fetchHistory();
});

onBeforeUnmount(() => {
	disposed = true;
	mainConnection.dispose();
	stream.off('_connected_', onConnected);
});
</script>

<style lang="scss" module>
.message {
	position: relative;
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	grid-template-rows: auto auto;
	align-items: center;
	row-gap: 2px;
	padding: var(--MI-cardPadding);

	&:not(.isRead):not(.compact) {
		&::before {
			content: '';
			position: absolute;
			top: 8px;
			right: 8px;
			width: 8px;
			height: 8px;
			border-radius: 100%;
			background-color: var(--MI_THEME-accent);
		}
	}
}

.compactList {
	display: flex;
	flex-direction: column;
	gap: 1px;
	min-height: 0;
	padding: 6px 0;
}

.assistantButton {
	display: flex;
	align-items: center;
	gap: 10px;
	width: calc(100% - 8px);
	margin: 4px;
	padding: 10px;
	border-radius: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	&:hover { background: var(--MI_THEME-buttonHoverBg); }
	> span { margin-left: auto; }
}

.message.compact {
	flex: none;
	align-items: center;
	align-content: center;
	grid-template-rows: repeat(2, 20px);
	row-gap: 4px;
	box-sizing: border-box;
	padding: 8px 10px;
	margin: 0 4px;
	border-radius: var(--MI-radius);
	background: transparent;
	font-size: 14px;

	.messageAvatar {
		width: 40px;
		height: 40px;
		margin-right: 10px;
	}

	.messageHeaderTime {
		font-size: 12px;
	}

	.messageHeader,
	.messageHeaderTime,
	.messageBodyText,
	.indicators {
		height: 20px;
		min-height: 0;
		line-height: 20px;
	}

	.messageHeaderName {
		flex: 1;
		font-weight: 500;
	}

	.messageBodyText {
		font-size: 13px;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.indicators {
		margin: 0;
		gap: 4px;
		min-height: 0;
		line-height: 1;
		pointer-events: none;
	}

	.statusIcon {
		width: 13px;
		height: 13px;
		font-size: 13px;
	}

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.selected {
		background: var(--MI_THEME-accentedBg);
		box-shadow: inset 3px 0 var(--MI_THEME-accent);
	}
}

@container (max-width: 500px) {
	.message {
		font-size: 90%;
	}
}

@container (max-width: 450px) {
	.message {
		font-size: 80%;
	}
}

.messageAvatar {
	grid-column: 1;
	grid-row: 1 / span 2;
	object-fit: cover;
	border-radius: 50%;
	width: 50px;
	height: 50px;
	margin: 0 16px 0 0;
}

@container (max-width: 500px) {
	.messageAvatar {
		width: 45px;
		height: 45px;
	}
}

@container (max-width: 450px) {
	.messageAvatar {
		width: 40px;
		height: 40px;
	}
}

.messageBody {
	display: contents;
}

.messageHeader {
	grid-column: 2;
	grid-row: 1;
	min-width: 0;
	display: flex;
	align-items: center;
	line-height: 1.5;
	white-space: nowrap;
	overflow: clip;
}

.messageHeaderName {
	min-width: 0;
	margin: 0;
	padding: 0;
	color: var(--MI_THEME-fg);
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	font-size: 1em;
	font-weight: normal;
}

.messageHeaderUsername {
	margin: 0 8px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.messageHeaderTime {
	grid-column: 3;
	grid-row: 1;
	justify-self: end;
	margin-left: 8px;
	line-height: 1.5;
	white-space: nowrap;
	color: var(--MI_THEME-fgTransparentWeak);
}

.indicators {
	display: flex;
	flex: none;
	align-items: center;
	gap: 6px;
	margin-left: 8px;
	&:empty { display: none; }
}

.statusIcon {
	display: inline-block;
	width: 13px;
	height: 13px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 13px;
	line-height: 1;
	pointer-events: none;
}

.unreadBadge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 20px;
	height: 20px;
	padding: 0 5px;
	box-sizing: border-box;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	line-height: 1;

	&.unreadDot { min-width: 8px; width: 8px; height: 8px; padding: 0; }
}

.messageBodyText {
	grid-column: 2 / -1;
	grid-row: 2;
	display: flex;
	align-items: center;
	gap: 2px;
	min-width: 0;
	min-height: 1.5em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	white-space: nowrap;
	font-size: 1.1em;
}

.preview {
	display: block;
	flex: 1;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.previewText,
.previewAttachment,
.youSaid {
	min-width: 0;
	white-space: nowrap;
	font-size: inherit;
	line-height: inherit;
	font-weight: normal;
	display: inline;
}

.previewText {
	> i {
		margin-right: 2px;
		font-size: 1em;
		line-height: 1;
	}
}
</style>
