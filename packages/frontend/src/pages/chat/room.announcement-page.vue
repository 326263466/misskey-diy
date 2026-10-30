<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div data-page-body :class="$style.root">
	<header :class="$style.header">
		<button type="button" class="_button" :class="$style.back" :aria-label="i18n.ts.goBack" @click="goBack"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
		<div :class="$style.titleTexts">
			<h1 :class="$style.title">{{ i18n.ts._chat.announcement }}</h1>
			<Mfm v-if="room" :text="room.name" :plain="true" :nowrap="true" :class="$style.subtitle"/>
		</div>
	</header>
	<div v-if="loading && !room" :class="$style.state" aria-busy="true"><MkLoading/></div>
	<MkError v-else-if="failed && !room" :class="$style.state" @retry="load"/>
	<div v-else-if="pageActive && room?.isMember === true" :class="$style.body">
		<p v-if="failed" :class="$style.retry" role="alert">{{ i18n.ts.somethingHappened }} <button type="button" class="_textButton" :disabled="loading" @click="load">{{ i18n.ts.retry }}</button></p>
		<XAnnouncement :room="room" :pageMode="true" @updated="onUpdated"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import XAnnouncement from './room.announcement.vue';
import { DI } from '@/di.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{ roomId: string }>();
const router = useRouter();
const pageActive = inject(DI.pageActive, ref(true));
const room = ref<Misskey.entities.ChatRoom | null>(null);
const loading = ref(false);
const failed = ref(false);
let generation = 0;
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

function cancelRequest() {
	generation++;
	controller?.abort();
	controller = null;
	loading.value = false;
}

function clearPage() {
	cancelRequest();
	connection?.dispose();
	connection = null;
	room.value = null;
	failed.value = false;
}

function revokeAccess() {
	accessLost = true;
	clearPage();
	if (!disposed && pageActive.value) router.push('/chat');
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

async function load() {
	if (disposed || !pageActive.value || accessLost) return;
	cancelRequest();
	const current = generation;
	const request = new AbortController();
	controller = request;
	loading.value = true;
	failed.value = false;
	try {
		const updated = await misskeyApi('chat/rooms/show', { roomId: props.roomId }, undefined, request.signal);
		if (!isCurrent(current)) return;
		if (updated.isMember !== true) { revokeAccess(); return; }
		room.value = updated;
		connectRoom();
	} catch (error) {
		if (!isCurrent(current)) return;
		if (typeof error === 'object' && error != null && 'code' in error && error.code === 'NO_SUCH_ROOM') revokeAccess();
		else failed.value = true;
	} finally {
		if (isCurrent(current)) loading.value = false;
	}
}

function onUpdated(updated: Misskey.entities.ChatRoom) {
	if (disposed || !pageActive.value || accessLost || room.value?.id !== updated.id) return;
	// 保存后的 room 不触发二次读取，公告组件保留当前编辑内容。
	cancelRequest();
	if (updated.isMember !== true) { revokeAccess(); return; }
	room.value = updated;
	failed.value = false;
	globalEvents.emit('chatRoomUpdated', updated);
}

useGlobalEvent('chatRoomUpdated', updated => {
	if (disposed || !pageActive.value || accessLost || room.value?.id !== updated.id) return;
	if (updated.isMember !== true) { revokeAccess(); return; }
	room.value = updated;
});
useGlobalEvent('chatRoomLeft', roomId => { if (props.roomId === roomId) revokeAccess(); });

watch([pageActive, () => props.roomId], ([active]) => {
	clearPage();
	if (!active || disposed) return;
	accessLost = false;
	void load();
}, { immediate: true, flush: 'sync' });

onBeforeUnmount(() => {
	disposed = true;
	clearPage();
});

definePage(computed(() => ({
	title: i18n.ts._chat.announcement,
	subtitle: room.value?.name,
	icon: 'ti ti-speakerphone',
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

.body {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
}

.state {
	display: grid;
	flex: 1;
	place-items: center;
}

.retry {
	margin: var(--MI-margin);
	color: var(--MI_THEME-error);
}
</style>
