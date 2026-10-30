<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div data-page-body :class="$style.root">
	<header :class="$style.header">
		<button type="button" class="_button" :class="$style.back" :aria-label="i18n.ts.goBack" @click="goBack"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
		<div :class="$style.titleTexts">
			<h1 :class="$style.title">{{ i18n.ts._chat.members }}</h1>
			<Mfm v-if="room" :text="room.name" :plain="true" :nowrap="true" :class="$style.subtitle"/>
		</div>
	</header>
	<div v-if="loading && !ready" :class="$style.state" aria-busy="true"><MkLoading/></div>
	<MkError v-else-if="failed && !ready" :class="$style.state" @retry="load"/>
	<XSidebar
		v-else-if="pageActive && room?.isMember === true && ready"
		:room="room"
		:memberships="memberships"
		:pageMode="true"
		:membersFailed="failed || failedMore"
		:membersLoading="loading || loadingMore"
		:membersMore="more"
		:class="$style.sidebar"
		@retry="retry"
		@menu="showMemberMenu"
		@more="loadMore"
	/>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import XSidebar from './room.sidebar.vue';
import { getChatMemberMenu, roomMembers } from './member-menu.js';
import type { ChatMember } from './member-menu.js';
import { DI } from '@/di.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{ roomId: string }>();
const me = ensureSignin();
const router = useRouter();
const pageActive = inject(DI.pageActive, ref(true));
const room = ref<Misskey.entities.ChatRoom | null>(null);
const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const memberList = computed(() => room.value ? roomMembers(room.value, memberships.value) : []);
const ready = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const failed = ref(false);
const failedMore = ref(false);
const more = ref(false);
const hiddenMembers = ref<string[]>([]);
const hiddenMembersKey = computed(() => `chat-hidden-members:${me.id}:${props.roomId}` as const);
const PAGE_SIZE = 50;
let cursor: string | undefined;
let generation = 0;
let activityGeneration = 0;
let disposed = false;
let accessLost = false;
let controller: AbortController | null = null;
let connection: Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null = null;

function goBack() {
	if (router.canGoBack.value) router.back();
	else router.push('/chat/room/:roomId', { params: { roomId: props.roomId } });
}

function isCurrent(current: number) {
	return !disposed && pageActive.value && !accessLost && current === generation;
}

function isActiveCurrent(current: number) {
	return !disposed && pageActive.value && !accessLost && current === activityGeneration;
}

function cancelRequests() {
	generation++;
	controller?.abort();
	controller = null;
	loading.value = false;
	loadingMore.value = false;
}

function clearPage() {
	activityGeneration++;
	cancelRequests();
	connection?.dispose();
	connection = null;
	room.value = null;
	memberships.value = [];
	cursor = undefined;
	ready.value = false;
	more.value = false;
	failed.value = false;
	failedMore.value = false;
}

function revokeAccess() {
	accessLost = true;
	clearPage();
	if (!disposed && pageActive.value) router.push('/chat');
}

function isAccessError(error: unknown) {
	return typeof error === 'object' && error != null && 'code' in error && error.code === 'NO_SUCH_ROOM';
}

function connectRoom() {
	if (connection || !pageActive.value || room.value?.isMember !== true) return;
	const roomId = props.roomId;
	connection = useStream().useChannel('chatRoom', { roomId });
	const active = () => !disposed && pageActive.value && !accessLost && props.roomId === roomId;
	const refresh = () => { if (active()) void load(); };
	connection.on('membersChanged', refresh);
	connection.on('roomUpdated', refresh);
	connection.on('accessRevoked', () => { if (active()) revokeAccess(); });
}

function applyMembers(batch: Misskey.entities.ChatRoomMembership[], append: boolean, untilId?: string) {
	const byUser = new Map((append ? memberships.value : []).map(item => [item.userId, item]));
	for (const membership of batch) byUser.set(membership.userId, membership);
	memberships.value = [...byUser.values()];
	cursor = batch.at(-1)?.id;
	// 游标取原始页末项，不受成员去重影响；不前进时停止，避免反复请求同一页。
	more.value = batch.length === PAGE_SIZE && cursor != null && (untilId == null || cursor < untilId);
}

async function load() {
	if (disposed || !pageActive.value || accessLost) return;
	cancelRequests();
	const current = generation;
	const roomId = props.roomId;
	const request = new AbortController();
	controller = request;
	loading.value = true;
	failed.value = false;
	failedMore.value = false;
	try {
		const updated = await misskeyApi('chat/rooms/show', { roomId }, undefined, request.signal);
		if (!isCurrent(current)) return;
		// 公开群信息也可被非成员读取，不能据此授权成员列表。
		if (updated.isMember !== true) { revokeAccess(); return; }
		room.value = updated;
		connectRoom();
		const batch = await misskeyApi('chat/rooms/members', { roomId, limit: PAGE_SIZE }, undefined, request.signal);
		if (!isCurrent(current)) return;
		applyMembers(batch, false);
		ready.value = true;
		globalEvents.emit('chatRoomUpdated', room.value);
	} catch (error) {
		if (!isCurrent(current)) return;
		if (isAccessError(error)) revokeAccess();
		else failed.value = true;
	} finally {
		if (isCurrent(current)) loading.value = false;
	}
}

async function loadMore() {
	if (disposed || !pageActive.value || accessLost || !ready.value || room.value?.isMember !== true || loading.value || loadingMore.value || failed.value || !more.value || !controller) return;
	const current = generation;
	const untilId = cursor;
	const request = controller;
	loadingMore.value = true;
	failedMore.value = false;
	try {
		const batch = await misskeyApi('chat/rooms/members', { roomId: props.roomId, limit: PAGE_SIZE, untilId }, undefined, request.signal);
		if (!isCurrent(current)) return;
		applyMembers(batch, true, untilId);
	} catch (error) {
		if (!isCurrent(current)) return;
		if (isAccessError(error)) revokeAccess();
		else failedMore.value = true;
	} finally {
		if (isCurrent(current)) loadingMore.value = false;
	}
}

function retry() {
	if (failed.value) void load();
	else void loadMore();
}

function loadHiddenMembers() {
	hiddenMembers.value = [];
	try {
		const stored = JSON.parse(miLocalStorage.getItem(hiddenMembersKey.value) ?? '[]');
		if (Array.isArray(stored)) hiddenMembers.value = stored.filter(id => typeof id === 'string' && id !== me.id);
	} catch { /* 损坏的本地设置不影响查看成员。 */ }
}

function showMemberMenu(event: MouseEvent | KeyboardEvent, member: ChatMember) {
	if (!pageActive.value || room.value?.isMember !== true) return;
	const current = activityGeneration;
	const roomId = room.value.id;
	const menu = getChatMemberMenu(room.value, member, {
		canCompose: false,
		isHidden: hiddenMembers.value.includes(member.user.id),
		getMember: () => isActiveCurrent(current) && room.value?.id === roomId ? memberList.value.find(item => item.user.id === member.user.id) : undefined,
		updated: membership => {
			if (!isActiveCurrent(current) || room.value?.id !== roomId) return;
			if (membership) {
				const index = memberships.value.findIndex(item => item.userId === membership.userId);
				if (index !== -1) {
					const previous = memberships.value[index];
					memberships.value[index] = { ...previous, ...membership, user: membership.user ?? previous.user };
				}
			}
			void load();
		},
		toggleHidden: () => {
			if (!isActiveCurrent(current) || room.value?.id !== roomId || member.user.id === me.id) return;
			hiddenMembers.value = hiddenMembers.value.includes(member.user.id) ? hiddenMembers.value.filter(id => id !== member.user.id) : [...hiddenMembers.value, member.user.id];
			try { miLocalStorage.setItem(hiddenMembersKey.value, JSON.stringify(hiddenMembers.value)); } catch { os.toast(i18n.ts.somethingHappened, 'error'); }
		},
	});
	if (event.type === 'contextmenu') os.contextMenu(menu, event as PointerEvent);
	else os.popupMenu(menu, event.currentTarget as HTMLElement);
}

useGlobalEvent('chatRoomUpdated', updated => {
	if (!pageActive.value || room.value?.id !== updated.id) return;
	if (updated.isMember !== true) { revokeAccess(); return; }
	room.value = updated;
});
useGlobalEvent('chatRoomLeft', roomId => { if (props.roomId === roomId) revokeAccess(); });

watch([pageActive, () => props.roomId], ([active]) => {
	clearPage();
	if (!active || disposed) return;
	accessLost = false;
	loadHiddenMembers();
	void load();
}, { immediate: true, flush: 'sync' });

onBeforeUnmount(() => {
	disposed = true;
	clearPage();
});

definePage(computed(() => ({
	title: i18n.ts._chat.members,
	subtitle: room.value?.name,
	icon: 'ti ti-users',
})));
</script>

<style lang="scss" module>
@use '../../styles/chat-header.scss';

.root {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
	height: 100%;
	overflow: hidden;
	background: var(--MI_THEME-panel);
}

.header {
	display: flex;
	flex: none;
	align-items: center;
	gap: 8px;
	height: var(--MI-chatHeaderHeight);
	box-sizing: border-box;
	padding-inline: 12px;
	border-bottom: var(--MI-divider);
}

.back {
	@include chat-header.action;
}

.titleTexts {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.title {
	margin: 0;
	font-size: 16px;
	font-weight: 650;
	line-height: 1.25;
}

.subtitle {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 12px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.sidebar {
	flex: 1;
	min-height: 0;
}

.state {
	display: grid;
	flex: 1;
	place-items: center;
}
</style>
