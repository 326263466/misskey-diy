<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkPagination :paginator="paginator" withControl pageEmpty>
		<template #empty="{ fetching }"><MkResult type="empty" :text="i18n.ts._chat.noInvitations" :loading="fetching" page/></template>
		<template #default="{ items: invitations }">
			<div :class="$style.list">
				<article v-for="invitation in invitations" :key="invitation.id" class="_panel" :class="$style.invitationCard">
					<header :class="$style.cardHeader">
						<div :class="$style.roomIcon" aria-hidden="true"><i class="ti ti-users-group"></i></div>
						<div :class="$style.roomInfo">
							<h2 :class="$style.roomName"><Mfm :text="invitation.room.name" :plain="true" :nowrap="true" :author="invitation.room.owner"/></h2>
							<div :class="$style.inviter">
								<MkAvatar :user="invitation.room.owner" :class="$style.ownerAvatar" link/>
								<span :class="$style.ownerName">{{ i18n.ts._chat.roomOwner }} · <MkUserName :user="invitation.room.owner"/></span>
							</div>
						</div>
						<MkTime :time="invitation.createdAt" :class="$style.time"/>
					</header>
					<div :class="$style.description">
						<Mfm v-if="invitation.room.description" :text="invitation.room.description" :plain="true" :author="invitation.room.owner"/>
						<template v-else>{{ i18n.ts.noDescription }}</template>
					</div>
					<footer :class="$style.actions">
						<MkButton small rounded primary :wait="pendingAction(invitation.id) === 'join'" :disabled="pendingAction(invitation.id) != null" @click="join(invitation)"><i class="ti ti-check" aria-hidden="true"></i> {{ i18n.ts._chat.join }}</MkButton>
						<MkButton small rounded :wait="pendingAction(invitation.id) === 'ignore'" :disabled="pendingAction(invitation.id) != null" @click="ignore(invitation)"><i class="ti ti-x" aria-hidden="true"></i> {{ i18n.ts._chat.ignore }}</MkButton>
					</footer>
				</article>
			</div>
		</template>
	</MkPagination>
	<!-- 状态区常驻，忽略或失效后读屏才能播报 -->
	<p role="status" aria-live="polite" :class="$style.actionStatus">{{ actionStatus }}</p>
</div>
</template>

<script lang="ts" setup>
import { markRaw, onBeforeUnmount, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkPagination from '@/components/MkPagination.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { getChatRoomJoinErrorMessage, isChatInvitationGoneError } from '@/utility/misskey-api-with-toast.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';

const router = useRouter();

const paginator = markRaw(new Paginator('chat/rooms/invitations/inbox', { limit: 30 }));
const pendingActions = ref<Record<string, 'join' | 'ignore'>>({});
const actionStatus = ref('');
let disposed = false;
onBeforeUnmount(() => { disposed = true; });

function pendingAction(invitationId: string) {
	return pendingActions.value[invitationId] ?? null;
}

function setPendingAction(invitationId: string, action: 'join' | 'ignore' | null) {
	const next = { ...pendingActions.value };
	if (action == null) {
		delete next[invitationId];
	} else {
		next[invitationId] = action;
	}
	pendingActions.value = next;
}

function removeInvitation(invitationId: string) {
	paginator.removeItem(invitationId);
}

// 跳转或列表项消失即为成功反馈；邀请已失效时移出列表，避免反复点击
function onError(invitation: Misskey.entities.ChatRoomInvitation, error: unknown) {
	if (isChatInvitationGoneError(error)) {
		removeInvitation(invitation.id);
		actionStatus.value = i18n.ts._chat.invitationExpired;
	}
	if (!isAccountSessionErrorHandled(error)) os.toast(getChatRoomJoinErrorMessage(error), 'error');
}

async function join(invitation: Misskey.entities.ChatRoomInvitation) {
	if (pendingAction(invitation.id) != null) return;
	const originPath = router.currentRef.value._parsedRoute.fullPath;
	setPendingAction(invitation.id, 'join');
	actionStatus.value = '';
	try {
		await misskeyApi('chat/rooms/join', {
			roomId: invitation.room.id,
		});
	} catch (error) {
		if (!disposed) onError(invitation, error);
		return;
	} finally {
		setPendingAction(invitation.id, null);
	}

	if (disposed) return;
	removeInvitation(invitation.id);
	actionStatus.value = i18n.ts._chat.roomJoined;
	if (router.currentRef.value._parsedRoute.fullPath !== originPath) return;
	router.push('/chat/room/:roomId', {
		params: {
			roomId: invitation.room.id,
		},
	});
}

async function ignore(invitation: Misskey.entities.ChatRoomInvitation) {
	if (pendingAction(invitation.id) != null) return;
	setPendingAction(invitation.id, 'ignore');
	actionStatus.value = '';
	try {
		await misskeyApi('chat/rooms/invitations/ignore', {
			roomId: invitation.room.id,
		});
	} catch (error) {
		if (!disposed) onError(invitation, error);
		return;
	} finally {
		setPendingAction(invitation.id, null);
	}

	if (disposed) return;
	removeInvitation(invitation.id);
	actionStatus.value = i18n.ts._chat.invitationIgnored;
}

</script>

<style lang="scss" module>
.root {
	min-width: 0;
}

.list {
	display: grid;
	gap: 12px;
}

.invitationCard {
	min-width: 0;
	padding: var(--MI-cardPadding);
	border-radius: var(--MI-cardRadius);
}

.cardHeader {
	display: flex;
	align-items: center;
	gap: 12px;
}

.roomIcon {
	display: grid;
	flex: 0 0 42px;
	place-items: center;
	width: 42px;
	height: 42px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 20px;
}

.roomInfo {
	flex: 1;
	min-width: 0;
}

.roomName {
	margin: 0;
	overflow: hidden;
	font-size: 1em;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.inviter {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	margin-top: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}

.ownerAvatar {
	flex: 0 0 20px;
	width: 20px;
	height: 20px;
}

.ownerName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.time {
	flex: 0 0 auto;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
}

.description {
	margin-top: 16px;
	padding: 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 16px;
	padding-top: 12px;
	border-top: var(--MI-divider);
}

.actionStatus {
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);

	&:not(:empty) {
		margin-top: 12px;
	}
}
</style>
