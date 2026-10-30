<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkLoading v-if="loading"/>
	<button v-else-if="failed" type="button" class="_textButton" :disabled="answeringId != null" @click="load">{{ i18n.ts.retry }}</button>
	<section v-else-if="canManage" :aria-label="i18n.ts._chat.joinRequests" :class="$style.requests">
		<p v-if="room.joinQuestion" :class="$style.question">{{ room.joinQuestion }}</p>
		<MkResult v-if="requests.length === 0" type="empty" :text="i18n.ts._chat.noJoinRequests"/>
		<div v-for="request in requests" :key="request.id" :class="$style.request" role="group" :aria-label="request.user.name || request.user.username">
			<div :class="$style.requestHeader">
				<MkA :to="userPage(request.user)" :class="$style.identity">
					<MkAvatar :user="request.user" :link="false" :preview="false" imageOnly :class="$style.avatar"/>
					<div :class="$style.identityText">
						<MkUserName :user="request.user" :class="$style.name"/>
						<span :class="$style.username">@{{ request.user.username }}</span>
					</div>
				</MkA>
				<div :class="$style.requestActions">
					<MkButton small primary :disabled="loadingMore || answeringId != null || room.joinPolicy === 'closed'" @click="answer(request, true)">{{ i18n.ts._chat.approveJoinRequest }}</MkButton>
					<MkButton small :disabled="loadingMore || answeringId != null" @click="answer(request, false)">{{ i18n.ts._chat.rejectJoinRequest }}</MkButton>
				</div>
			</div>
			<p v-if="request.requestMessage" :class="$style.requestMessage">{{ request.requestMessage }}</p>
		</div>
		<div v-if="pageActive && requestsMore && !loading && !loadingMore && !failed && !failedMore && answeringId == null" v-appear="loadMoreRequests" :class="$style.sentinel" aria-hidden="true"></div>
		<MkLoading v-if="loadingMore"/>
		<MkButton v-else-if="failedMore" small :disabled="answeringId != null" @click="loadMoreRequests">{{ i18n.ts.retry }}</MkButton>
	</section>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { userPage } from '@@/js/user.js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import MkButton from '@/components/MkButton.vue';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';
import { DI } from '@/di.js';

const props = defineProps<{ room: Misskey.entities.ChatRoom }>();
const emit = defineEmits<{ (event: 'retry'): void }>();
const canManage = computed(() => props.room.ownerId === ensureSignin().id || props.room.myRole === 'administrator');
const pageActive = inject(DI.pageActive, ref(true));
const requests = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const requestsMore = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const answeringId = ref<string | null>(null);
const failed = ref(false);
const failedMore = ref(false);
let requestsCursor: string | undefined;
let generation = 0;
let disposed = false;

async function load() {
	if (disposed || answeringId.value != null) return;
	const current = ++generation;
	if (!canManage.value) return;
	const roomId = props.room.id;
	loading.value = true;
	loadingMore.value = false;
	failed.value = false;
	failedMore.value = false;
	try {
		const pendingRequests = await misskeyApi('chat/rooms/invitations/outbox', { roomId, isRequest: true, limit: 50 });
		if (disposed || current !== generation) return;
		requests.value = pendingRequests;
		requestsCursor = pendingRequests.at(-1)?.id;
		requestsMore.value = pendingRequests.length === 50;
	} catch {
		if (!disposed && current === generation) { failed.value = true; os.toast(i18n.ts.somethingHappened, 'error'); }
	} finally {
		if (!disposed && current === generation) loading.value = false;
	}
}

async function loadMoreRequests() {
	if (disposed || !pageActive.value || loading.value || loadingMore.value || answeringId.value != null || !requestsMore.value || !canManage.value) return;
	const current = generation;
	const untilId = requestsCursor;
	loadingMore.value = true;
	failedMore.value = false;
	try {
		const result = await misskeyApiWithErrorToast('chat/rooms/invitations/outbox', { roomId: props.room.id, isRequest: true, limit: 50, untilId });
		if (disposed || current !== generation) return;
		requests.value.push(...result.filter(request => !requests.value.some(existing => existing.id === request.id)));
		requestsCursor = result.at(-1)?.id;
		requestsMore.value = result.length === 50 && requestsCursor !== untilId;
	} catch {
		if (!disposed && current === generation) failedMore.value = true;
	} finally {
		if (!disposed && current === generation) loadingMore.value = false;
	}
}

async function answer(request: Misskey.entities.ChatRoomInvitation, approve: boolean) {
	if (disposed || loading.value || loadingMore.value || !canManage.value || answeringId.value != null || (approve && props.room.joinPolicy === 'closed')) return;
	const current = generation;
	answeringId.value = request.id;
	try {
		await misskeyApiWithErrorToast('chat/rooms/requests/answer', { roomId: props.room.id, requestId: request.id, approve });
		if (disposed || current !== generation) return;
		requests.value = requests.value.filter(item => item.id !== request.id);
		if (approve) emit('retry');
	} catch {
		// 容量或权限变化时保留申请，修复后可以再次处理。
	} finally {
		if (!disposed && current === generation) answeringId.value = null;
	}
}

watch([() => props.room.id, canManage], () => {
	requests.value = [];
	requestsCursor = undefined;
	requestsMore.value = false;
	answeringId.value = null;
	loading.value = false;
	loadingMore.value = false;
	failed.value = false;
	failedMore.value = false;
	void load();
}, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; });
</script>

<style lang="scss" module>
.root {
	padding: var(--MI-cardPadding);
}

.requests {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.question {
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.request {
	padding-bottom: 16px;
	border-bottom: var(--MI-divider);

	&:last-child {
		padding-bottom: 0;
		border-bottom: 0;
	}
}

.requestHeader {
	display: flex;
	align-items: center;
	gap: 12px;
}

.identity {
	display: flex;
	align-items: center;
	gap: 10px;
	flex: 1;
	min-width: 0;

	&:hover {
		text-decoration: none;
	}
}

.avatar {
	width: 36px;
	height: 36px;
	flex-shrink: 0;
}

.identityText {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.name,
.username {
	min-width: 0;
	max-width: 100%;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.username {
	font-size: 12px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.requestMessage {
	margin: 10px 0 0;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.requestActions {
	display: flex;
	gap: 6px;
	flex-shrink: 0;
}

.sentinel {
	height: 1px;
}

@media (max-width: 380px) {
	.requestHeader {
		flex-wrap: wrap;
	}

	.identity {
		flex-basis: 100%;
	}

	.requestActions {
		margin-left: 46px;
	}
}
</style>
