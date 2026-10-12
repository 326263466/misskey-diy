<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="480" :height="560" :closeOnBackdrop="joiningId == null" @close="close" @closed="emit('closed')">
	<template #header>{{ i18n.ts._chat.searchRooms }}</template>
	<div :class="$style.body">
		<form @submit.prevent="search">
			<MkInput v-model="query" type="search" :autofocus="true" :placeholder="i18n.ts._chat.searchRoomsPlaceholder" :maxLength="256" :disabled="joiningId != null" :class="$style.searchInput">
				<template #label>{{ i18n.ts._chat.searchRooms }}</template>
				<template #prefix><i class="ti ti-search" aria-hidden="true"></i></template>
			</MkInput>
		</form>
		<section :aria-label="i18n.ts.searchResult" :class="$style.results">
			<div v-if="fetching" aria-busy="true"></div>
			<MkError v-else-if="failed" @retry="search"/>
			<MkResult v-else-if="rooms.length === 0" type="empty" :text="i18n.ts._chat.noRooms"/>
			<article v-for="room in rooms" :key="room.id" :class="$style.room">
				<img v-if="room.avatarUrl" :src="room.avatarUrl" alt="" :class="$style.avatar"/>
				<MkAvatar v-else :user="room.owner" :link="false" :preview="false" :class="$style.avatar"/>
				<div :class="$style.roomInfo">
					<div :class="$style.roomName"><Mfm :text="room.name" :plain="true" :nowrap="true" :author="room.owner"/></div>
					<div :class="$style.roomMeta">
						<span :class="$style.roomId" :title="room.id">{{ i18n.ts._chat.roomId }}：{{ room.id }}</span>
						<span :class="$style.memberCount" :aria-label="`${i18n.ts._chat.members} (${room.memberCount})`"><i class="ti ti-users" aria-hidden="true"></i>{{ room.memberCount }}</span>
					</div>
					<div v-if="room.description" :class="$style.description"><Mfm :text="room.description" :plain="true" :nowrap="true" :author="room.owner"/></div>
				</div>
				<MkButton small primary :disabled="joiningId != null || (!room.isMember && (room.joinPolicy === 'closed' || (!room.invitationExists && ((room.joinPolicy === 'approval' && room.joinRequestPending) || room.joinPolicy === 'invitation'))))" @click="select(room)">{{ joinLabel(room) }}</MkButton>
			</article>
			<MkButton v-if="canFetchMore && !fetching" :disabled="fetchingMore || joiningId != null" full @click="fetchMore">{{ i18n.ts.loadMore }}</MkButton>
		</section>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import * as os from '@/os.js';

const emit = defineEmits<{
	(ev: 'selected', room: Misskey.entities.ChatRoom): void;
	(ev: 'closed'): void;
}>();

const PAGE_SIZE = 20;
const SEARCH_DELAY = 300;
const dialogEl = useTemplateRef('dialogEl');
const query = ref('');
const rooms = ref<Misskey.entities.ChatRoom[]>([]);
useGlobalEvent('chatRoomUpdated', room => {
	const index = rooms.value.findIndex(item => item.id === room.id);
	if (index !== -1) rooms.value[index] = room;
});
const fetching = ref(false);
const fetchingMore = ref(false);
const failed = ref(false);
const canFetchMore = ref(false);
const joiningId = ref<string | null>(null);
let searchedQuery = '';
let requestRevision = 0;
let searchTimer: number | undefined;
let searchController: AbortController | null = null;
let disposed = false;

function close() {
	if (joiningId.value == null) dialogEl.value?.close();
}

async function search() {
	if (joiningId.value != null) return;
	searchController?.abort();
	const controller = new AbortController();
	searchController = controller;
	const revision = ++requestRevision;
	searchedQuery = query.value.trim();
	fetching.value = true;
	fetchingMore.value = false;
	failed.value = false;
	canFetchMore.value = false;
	rooms.value = [];
	try {
		const result = await misskeyApi('chat/rooms/search', { query: searchedQuery, limit: PAGE_SIZE }, undefined, controller.signal);
		if (disposed || controller.signal.aborted || revision !== requestRevision) return;
		rooms.value = result;
		canFetchMore.value = result.length === PAGE_SIZE;
	} catch {
		if (!disposed && !controller.signal.aborted && revision === requestRevision) failed.value = true;
	} finally {
		if (!disposed && revision === requestRevision) {
			fetching.value = false;
			if (searchController === controller) searchController = null;
		}
	}
}

async function fetchMore() {
	if (fetching.value || fetchingMore.value || !canFetchMore.value) return;
	const revision = requestRevision;
	const untilId = rooms.value.at(-1)?.id;
	fetchingMore.value = true;
	try {
		const result = await misskeyApiWithErrorToast('chat/rooms/search', { query: searchedQuery, limit: PAGE_SIZE, untilId });
		if (disposed || revision !== requestRevision) return;
		rooms.value.push(...result.filter(room => !rooms.value.some(existing => existing.id === room.id)));
		canFetchMore.value = result.length === PAGE_SIZE && result.at(-1)?.id !== untilId;
	} catch {
		// 加载失败保留当前结果，允许重试下一页。
	} finally {
		if (!disposed && revision === requestRevision) fetchingMore.value = false;
	}
}

function joinLabel(room: Misskey.entities.ChatRoom): string {
	if (room.isMember) return i18n.ts.chat;
	if (room.joinPolicy === 'closed') return i18n.ts._chat.joinPolicyClosed;
	if (room.invitationExists || room.joinPolicy === 'public') return i18n.ts._chat.join;
	if (room.joinRequestPending) return i18n.ts._chat.joinRequestPending;
	return room.joinPolicy === 'approval' ? i18n.ts._chat.requestJoin : i18n.ts._chat.joinPolicyInvitation;
}

async function select(room: Misskey.entities.ChatRoom) {
	if (joiningId.value != null) return;
	if (room.isMember) {
		emit('selected', room);
		dialogEl.value?.close();
		return;
	}
	if (room.joinPolicy === 'closed' || (!room.invitationExists && ((room.joinPolicy === 'approval' && room.joinRequestPending) || room.joinPolicy === 'invitation'))) return;
	joiningId.value = room.id;
	let completed = false;
	try {
		if (room.joinPolicy === 'approval' && !room.invitationExists) {
			const { canceled, result } = await os.inputText({
				title: i18n.ts._chat.requestJoin, text: i18n.ts._chat.joinRequestDescription,
				placeholder: i18n.ts._chat.joinRequestMessage, default: '', maxLength: 500,
			});
			if (canceled || disposed) return;
			const updated = await misskeyApiWithErrorToast('chat/rooms/requests/create', { roomId: room.id, requestMessage: result.trim() });
			if (disposed) return;
			Object.assign(room, updated);
			globalEvents.emit('chatRoomUpdated', updated);
			if (updated.isMember) {
				completed = true;
				emit('selected', updated);
				dialogEl.value?.close();
				return;
			}
			if (!updated.invitationExists) {
				os.toast(i18n.ts._chat.joinRequestSent, 'success');
				return;
			}
		}
		await misskeyApiWithErrorToast('chat/rooms/join', { roomId: room.id });
		if (disposed) return;
		completed = true;
		emit('selected', { ...room, isMember: true, joinRequestPending: false });
		dialogEl.value?.close();
	} catch {
		// 群权限或人数可能在搜索后改变，失败时保留搜索结果。
	} finally {
		if (!completed) joiningId.value = null;
	}
}

function scheduleSearch() {
	window.clearTimeout(searchTimer);
	requestRevision++;
	searchController?.abort();
	searchController = null;
	if (joiningId.value != null || disposed) return;
	const value = query.value.trim();
	if (!value) {
		void search();
		return;
	}
	fetching.value = true;
	fetchingMore.value = false;
	failed.value = false;
	canFetchMore.value = false;
	rooms.value = [];
	searchTimer = window.setTimeout(() => { void search(); }, SEARCH_DELAY);
}

watch(query, scheduleSearch);

onMounted(() => { void search(); });
onBeforeUnmount(() => {
	disposed = true;
	requestRevision++;
	searchController?.abort();
	window.clearTimeout(searchTimer);
});
</script>

<style lang="scss" module>
.body {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 16px;
}

.searchInput {
	flex: 1;
	min-width: 0;
}

.results {
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.room {
	display: grid;
	grid-template-columns: 36px minmax(0, 1fr) auto;
	align-items: center;
	gap: 10px;
	padding: 10px 0;
	border-bottom: var(--MI-divider);
}

.avatar {
	object-fit: cover;
	border-radius: 50%;
	flex-shrink: 0;
	width: 36px;
	height: 36px;
}

.roomInfo {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.roomName {
	min-width: 0;
	font-weight: bold;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	line-height: 1.4;
}

.description {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 85%;
	line-height: 1.4;
	color: var(--MI_THEME-fgTransparentWeak);
}

.roomMeta {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 80%;
	line-height: 1.4;
}

.roomId {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.memberCount {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	flex-shrink: 0;

	> i {
		line-height: 1;
	}
}
</style>
