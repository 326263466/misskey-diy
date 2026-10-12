<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps _panel _panelPadding">
	<button type="button" class="_textButton" :class="$style.announcement" @click="emit('announcement')">{{ i18n.ts._chat.announcement }}</button>
	<button v-if="failed" type="button" class="_textButton" @click="load">{{ i18n.ts.retry }}</button>
	<button v-if="membersFailed" type="button" class="_textButton" @click="emit('retry')">{{ i18n.ts.retry }}</button>
	<section v-if="canManage" :aria-label="i18n.ts._chat.joinRequests" :class="$style.requests">
		<div :class="$style.requestsTitle">{{ i18n.ts._chat.joinRequests }}</div>
		<div v-if="!failed && requests.length === 0" :class="$style.requestMessage">{{ i18n.ts._chat.noJoinRequests }}</div>
		<div v-for="request in requests" :key="request.id" :class="$style.request" role="group" :aria-label="request.user.name || request.user.username">
			<MkA :to="userPage(request.user)"><MkUserCardMini :user="request.user" :class="$style.userCard"/></MkA>
			<p v-if="request.requestMessage" :class="$style.requestMessage">{{ request.requestMessage }}</p>
			<div :class="$style.requestActions">
				<MkButton small primary :disabled="answeringId != null || room.joinPolicy === 'closed'" @click="answer(request, true)">{{ i18n.ts._chat.approveJoinRequest }}</MkButton>
				<MkButton small :disabled="answeringId != null" @click="answer(request, false)">{{ i18n.ts._chat.rejectJoinRequest }}</MkButton>
			</div>
		</div>
		<MkButton v-if="requestsMore" small :disabled="loadingMore || answeringId != null" @click="loadMoreRequests">{{ i18n.ts.loadMore }}</MkButton>
	</section>
	<div v-for="member in members" :key="member.user.id" :class="$style.membership">
		<div :class="$style.membershipBody" role="group" :aria-label="member.nickname || member.user.name || member.user.username" tabindex="0" @contextmenu.prevent.stop="emit('menu', $event, member)" @keydown.shift.f10.prevent="emit('menu', $event, member)">
			<div>
				<Mfm v-if="member.nickname" :text="member.nickname" :author="member.user" :plain="true"/>
				<MkUserCardMini :user="member.user" :class="$style.userCard"/>
			</div>
			<span v-if="member.role !== 'member'" :class="$style.role">{{ member.role === 'owner' ? i18n.ts._chat.roomOwner : i18n.ts._chat.roomAdministrator }}</span>
		</div>
		<button type="button" class="_button _iconButton" :class="$style.actions" :aria-label="i18n.ts._chat.manageMember" @click="emit('menu', $event, member)"><i class="ti ti-dots" aria-hidden="true"></i></button>
	</div>
	<template v-if="canManage && invitations.length">
		<hr>
		<div>{{ i18n.ts._chat.sentInvitations }}</div>
		<div v-for="invitation in invitations" :key="invitation.id" :class="$style.invitation">
			<MkA :class="$style.invitationBody" :to="userPage(invitation.user)"><MkUserCardMini :user="invitation.user" :class="$style.userCard"/></MkA>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { roomMembers } from './member-menu.js';
import type { ChatMember } from './member-menu.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { userPage } from '@@/js/user.js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import MkButton from '@/components/MkButton.vue';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';

const props = defineProps<{ room: Misskey.entities.ChatRoom; memberships?: Misskey.entities.ChatRoomMembership[]; membersFailed?: boolean }>();
const emit = defineEmits<{ (event: 'announcement'): void; (event: 'retry'): void; (event: 'menu', ev: MouseEvent | KeyboardEvent, member: ChatMember): void }>();
const canManage = computed(() => props.room.ownerId === ensureSignin().id || props.room.myRole === 'administrator');
const loadedMemberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const members = computed(() => roomMembers(props.room, props.memberships ?? loadedMemberships.value));
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const requests = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const requestsMore = ref(false);
const loadingMore = ref(false);
const answeringId = ref<string | null>(null);
const failed = ref(false);
let disposed = false;

async function load() {
	failed.value = false;
	try {
		if (props.memberships == null) loadedMemberships.value = await misskeyApi('chat/rooms/members', { roomId: props.room.id, limit: 50 });
		if (disposed) return;
		if (canManage.value) {
			const [sentInvitations, pendingRequests] = await Promise.all([
				misskeyApi('chat/rooms/invitations/outbox', { roomId: props.room.id, limit: 50 }),
				misskeyApi('chat/rooms/invitations/outbox', { roomId: props.room.id, isRequest: true, limit: 50 }),
			]);
			if (disposed) return;
			invitations.value = sentInvitations;
			requests.value = pendingRequests;
			requestsMore.value = pendingRequests.length === 50;
		}
	} catch {
		if (!disposed) { failed.value = true; os.toast(i18n.ts.somethingHappened, 'error'); }
	}
}

async function loadMoreRequests() {
	if (loadingMore.value || !requestsMore.value || !canManage.value) return;
	loadingMore.value = true;
	try {
		const result = await misskeyApiWithErrorToast('chat/rooms/invitations/outbox', { roomId: props.room.id, isRequest: true, limit: 50, untilId: requests.value.at(-1)?.id });
		if (disposed) return;
		requests.value.push(...result.filter(request => !requests.value.some(existing => existing.id === request.id)));
		requestsMore.value = result.length === 50;
	} catch {
		// 保留已加载的申请，允许重试下一页。
	} finally {
		loadingMore.value = false;
	}
}

async function answer(request: Misskey.entities.ChatRoomInvitation, approve: boolean) {
	if (!canManage.value || answeringId.value != null || (approve && props.room.joinPolicy === 'closed')) return;
	answeringId.value = request.id;
	try {
		await misskeyApiWithErrorToast('chat/rooms/requests/answer', { roomId: props.room.id, requestId: request.id, approve });
		if (disposed) return;
		requests.value = requests.value.filter(item => item.id !== request.id);
		if (approve) emit('retry');
	} catch {
		// 容量或权限变化时保留申请，修复后可以再次处理。
	} finally {
		answeringId.value = null;
	}
}

onMounted(load);
onBeforeUnmount(() => { disposed = true; });
</script>

<style lang="scss" module>
.requests { display: flex; flex-direction: column; gap: 12px; }
.requestsTitle { font-weight: 600; }
.request { padding-block: 8px; border-bottom: var(--MI-divider); }
.request .userCard { padding-inline: 0; }
.requestMessage { margin: 0 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--MI_THEME-fgTransparentWeak); }
.requestActions { display: flex; gap: 8px; }

.announcement {
	min-height: 32px;
	text-align: start;
}

.membershipBody .userCard,
.invitationBody .userCard {
	padding-inline: 0;
}

.membership {
	display: flex;
	align-items: center;
}

.membershipBody {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 1;
	min-width: 0;
	border-radius: 8px;
	> :first-child { flex: 1; min-width: 0; }
	&:hover { text-decoration: none; background: color-mix(in srgb, var(--MI_THEME-buttonHoverBg) 45%, transparent); }
}

.role { color: var(--MI_THEME-accent); font-size: 12px; flex-shrink: 0; }
.actions { padding: 8px; border-radius: 8px; }

.invitation {
	display: flex;
}

.invitationBody {
	display: block;
	flex: 1;
	min-width: 0;
	&:hover { text-decoration: none; }
}
</style>
