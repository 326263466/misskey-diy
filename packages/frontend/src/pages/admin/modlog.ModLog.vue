<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<tbody>
	<tr>
		<td class="_adminTableMain">
			<div class="_adminTableIdentity">
				<span :class="$style.typeIcon">
					<i v-if="log.type === 'updateServerSettings'" class="ti ti-settings"></i>
					<i v-else-if="log.type === 'updateUserNote'" class="ti ti-pencil"></i>
					<i v-else-if="log.type === 'suspend'" class="ti ti-user-x"></i>
					<i v-else-if="log.type === 'unsuspend'" class="ti ti-user-check"></i>
					<i v-else-if="log.type === 'resetPassword'" class="ti ti-key"></i>
					<i v-else-if="log.type === 'assignRole'" class="ti ti-user-plus"></i>
					<i v-else-if="log.type === 'unassignRole'" class="ti ti-user-minus"></i>
					<i v-else-if="log.type === 'createRole'" class="ti ti-plus"></i>
					<i v-else-if="log.type === 'updateRole'" class="ti ti-pencil"></i>
					<i v-else-if="log.type === 'deleteRole'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'addCustomEmoji'" class="ti ti-plus"></i>
					<i v-else-if="log.type === 'updateCustomEmoji'" class="ti ti-pencil"></i>
					<i v-else-if="log.type === 'deleteCustomEmoji'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'markSensitiveDriveFile'" class="ti ti-eye-exclamation"></i>
					<i v-else-if="log.type === 'unmarkSensitiveDriveFile'" class="ti ti-eye"></i>
					<i v-else-if="log.type === 'suspendRemoteInstance'" class="ti ti-x"></i>
					<i v-else-if="log.type === 'unsuspendRemoteInstance'" class="ti ti-check"></i>
					<i v-else-if="log.type === 'createGlobalAnnouncement'" class="ti ti-plus"></i>
					<i v-else-if="log.type === 'updateGlobalAnnouncement'" class="ti ti-pencil"></i>
					<i v-else-if="log.type === 'deleteGlobalAnnouncement'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'createUserAnnouncement'" class="ti ti-plus"></i>
					<i v-else-if="log.type === 'updateUserAnnouncement'" class="ti ti-pencil"></i>
					<i v-else-if="log.type === 'deleteUserAnnouncement'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'deleteNote'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'deleteDriveFile'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'createAd'" class="ti ti-plus"></i>
					<i v-else-if="log.type === 'updateAd'" class="ti ti-pencil"></i>
					<i v-else-if="log.type === 'deleteAd'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'unsetMfa'" class="ti ti-shield"></i>
					<i v-else-if="log.type === 'createAvatarDecoration'" class="ti ti-plus"></i>
					<i v-else-if="log.type === 'updateAvatarDecoration'" class="ti ti-pencil"></i>
					<i v-else-if="log.type === 'deleteAvatarDecoration'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'createSystemWebhook'" class="ti ti-plus"></i>
					<i v-else-if="log.type === 'updateSystemWebhook'" class="ti ti-pencil"></i>
					<i v-else-if="log.type === 'deleteSystemWebhook'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'createAbuseReportNotificationRecipient'" class="ti ti-plus"></i>
					<i v-else-if="log.type === 'updateAbuseReportNotificationRecipient'" class="ti ti-pencil"></i>
					<i v-else-if="log.type === 'deleteAbuseReportNotificationRecipient'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'deleteAccount'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'deletePage'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'deleteFlash'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'deleteGalleryPost'" class="ti ti-trash"></i>
					<i v-else-if="log.type === 'deleteChatRoom'" class="ti ti-trash"></i>
				</span>
				<b
					:class="{
						[$style.logGreen]: [
							'createRole',
							'addCustomEmoji',
							'createGlobalAnnouncement',
							'createUserAnnouncement',
							'createAd',
							'createInvitation',
							'createAvatarDecoration',
							'createSystemWebhook',
							'createAbuseReportNotificationRecipient',
						].includes(log.type),
						[$style.logYellow]: [
							'markSensitiveDriveFile',
							'resetPassword',
							'unsetMfa',
							'suspendRemoteInstance',
						].includes(log.type),
						[$style.logRed]: [
							'suspend',
							'deleteRole',
							'deleteGlobalAnnouncement',
							'deleteUserAnnouncement',
							'deleteCustomEmoji',
							'deleteNote',
							'deleteDriveFile',
							'deleteAd',
							'deleteAvatarDecoration',
							'deleteSystemWebhook',
							'deleteAbuseReportNotificationRecipient',
							'deleteAccount',
							'deletePage',
							'deleteFlash',
							'deleteGalleryPost',
							'deleteChatRoom',
						].includes(log.type)
					}"
				>{{ i18n.ts._moderationLogTypes[log.type] }}</b>
			</div>
			<div class="_adminTableSecondary" :class="$style.target">
				<span v-if="log.type === 'updateUserNote'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
				<span v-else-if="log.type === 'suspend'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
				<span v-else-if="log.type === 'unsuspend'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
				<span v-else-if="log.type === 'resetPassword'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
				<span v-else-if="log.type === 'assignRole'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }} <i class="ti ti-arrow-right"></i> {{ log.info.roleName }}</span>
				<span v-else-if="log.type === 'unassignRole'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }} <i class="ti ti-equal-not"></i> {{ log.info.roleName }}</span>
				<span v-else-if="log.type === 'createRole'">{{ log.info.role.name }}</span>
				<span v-else-if="log.type === 'updateRole'">{{ log.info.before.name }}</span>
				<span v-else-if="log.type === 'deleteRole'">{{ log.info.role.name }}</span>
				<span v-else-if="log.type === 'addCustomEmoji'">{{ log.info.emoji.name }}</span>
				<span v-else-if="log.type === 'updateCustomEmoji'">{{ log.info.before.name }}</span>
				<span v-else-if="log.type === 'deleteCustomEmoji'">{{ log.info.emoji.name }}</span>
				<span v-else-if="log.type === 'markSensitiveDriveFile'">@{{ log.info.fileUserUsername }}{{ log.info.fileUserHost ? '@' + log.info.fileUserHost : '' }}</span>
				<span v-else-if="log.type === 'unmarkSensitiveDriveFile'">@{{ log.info.fileUserUsername }}{{ log.info.fileUserHost ? '@' + log.info.fileUserHost : '' }}</span>
				<span v-else-if="log.type === 'suspendRemoteInstance'">{{ log.info.host }}</span>
				<span v-else-if="log.type === 'unsuspendRemoteInstance'">{{ log.info.host }}</span>
				<span v-else-if="log.type === 'createGlobalAnnouncement'">{{ log.info.announcement.title }}</span>
				<span v-else-if="log.type === 'updateGlobalAnnouncement'">{{ log.info.before.title }}</span>
				<span v-else-if="log.type === 'deleteGlobalAnnouncement'">{{ log.info.announcement.title }}</span>
				<span v-else-if="log.type === 'createUserAnnouncement'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
				<span v-else-if="log.type === 'updateUserAnnouncement'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
				<span v-else-if="log.type === 'deleteUserAnnouncement'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
				<span v-else-if="log.type === 'deleteNote'">@{{ log.info.noteUserUsername }}{{ log.info.noteUserHost ? '@' + log.info.noteUserHost : '' }}</span>
				<span v-else-if="log.type === 'deleteDriveFile'">@{{ log.info.fileUserUsername }}{{ log.info.fileUserHost ? '@' + log.info.fileUserHost : '' }}</span>
				<span v-else-if="log.type === 'unsetMfa'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
				<span v-else-if="log.type === 'createAvatarDecoration'">{{ log.info.avatarDecoration.name }}</span>
				<span v-else-if="log.type === 'updateAvatarDecoration'">{{ log.info.before.name }}</span>
				<span v-else-if="log.type === 'deleteAvatarDecoration'">{{ log.info.avatarDecoration.name }}</span>
				<span v-else-if="log.type === 'createSystemWebhook'">{{ log.info.webhook.name }}</span>
				<span v-else-if="log.type === 'updateSystemWebhook'">{{ log.info.before.name }}</span>
				<span v-else-if="log.type === 'deleteSystemWebhook'">{{ log.info.webhook.name }}</span>
				<span v-else-if="log.type === 'createAbuseReportNotificationRecipient'">{{ log.info.recipient.name }}</span>
				<span v-else-if="log.type === 'updateAbuseReportNotificationRecipient'">{{ log.info.before.name }}</span>
				<span v-else-if="log.type === 'deleteAbuseReportNotificationRecipient'">{{ log.info.recipient.name }}</span>
				<span v-else-if="log.type === 'deleteAccount'">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
				<span v-else-if="log.type === 'deletePage'">@{{ log.info.pageUserUsername }}</span>
				<span v-else-if="log.type === 'deleteFlash'">@{{ log.info.flashUserUsername }}</span>
				<span v-else-if="log.type === 'deleteGalleryPost'">@{{ log.info.postUserUsername }}</span>
				<span v-else-if="log.type === 'deleteChatRoom'">@{{ log.info.room.name }}</span>
			</div>
		</td>
		<td>
			<MkA :to="`/admin/user/${log.userId}`" behavior="window" class="_adminTableIdentity _link">
				<MkAvatar v-if="log.user" :user="log.user" :link="false" class="_adminTableAvatar"/>
				<MkAcct v-if="log.user" :user="log.user"/><span v-else>#{{ log.userId }}</span>
			</MkA>
		</td>
		<td><MkTime :time="log.createdAt" mode="absolute"/></td>
		<td class="_adminTableActions">
			<button type="button" class="_button _textButton" @click="showDetails($event)">
				<i class="ti ti-info-circle" aria-hidden="true"></i> {{ i18n.ts.details }}
			</button>
		</td>
	</tr>
</tbody>
<Teleport to="#misskey-popups" defer>
	<MkModalWindow
		v-if="detailsOpen"
		:width="680"
		:height="700"
		autoHeight
		headerIcon="ti ti-list-search"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		:aria-label="i18n.ts.details"
		@closed="onDetailsClosed"
	>
		<template #header>{{ i18n.ts._moderationLogTypes[log.type] }}</template>
		<div :class="$style.details">
			<div style="display: flex; gap: var(--MI-margin); flex-wrap: wrap;">
				<div style="flex: 1;">{{ i18n.ts.moderator }}: <MkA :to="`/admin/user/${log.userId}`" behavior="window" class="_link">@{{ log.user?.username }}</MkA></div>
				<div style="flex: 1;">{{ i18n.ts.dateAndTime }}: <MkTime :time="log.createdAt" mode="detail"/></div>
			</div>

			<template v-if="log.type === 'updateServerSettings'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateUserNote'">
				<div>{{ i18n.ts.user }}: {{ log.info.userId }}</div>
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'suspend'">
				<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" behavior="window" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
			</template>
			<template v-else-if="log.type === 'unsuspend'">
				<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" behavior="window" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
			</template>
			<template v-else-if="log.type === 'updateRole'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'assignRole'">
				<div>{{ i18n.ts.user }}: {{ log.info.userId }}</div>
				<div>{{ i18n.ts.role }}: {{ log.info.roleName }} [{{ log.info.roleId }}]</div>
			</template>
			<template v-else-if="log.type === 'unassignRole'">
				<div>{{ i18n.ts.user }}: {{ log.info.userId }}</div>
				<div>{{ i18n.ts.role }}: {{ log.info.roleName }} [{{ log.info.roleId }}]</div>
			</template>
			<template v-else-if="log.type === 'updateCustomEmoji'">
				<div>{{ i18n.ts.emoji }}: {{ log.info.emojiId }}</div>
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateAd'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateGlobalAnnouncement'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateUserAnnouncement'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateAvatarDecoration'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateRemoteInstanceNote'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateSystemWebhook'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateAbuseReportNotificationRecipient'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateAbuseReportNote'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
				</div>
			</template>
			<template v-else-if="log.type === 'updateProxyAccountDescription'">
				<div :class="$style.diff">
					<CodeDiff :theme="store.s.darkMode ? 'dark' : 'light'" :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
				</div>
			</template>

			<details>
				<summary>{{ i18n.ts.rawData }}</summary>
				<pre>{{ JSON5.stringify(log, null, '\t') }}</pre>
			</details>
		</div>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts" setup>
import { ref, nextTick, inject, watch, onActivated, onDeactivated } from 'vue';
import * as Misskey from 'misskey-js';
import { CodeDiff } from 'v-code-diff';
import JSON5 from 'json5';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { DI } from '@/di.js';

const props = defineProps<{
	log: Misskey.entities.ModerationLog;
}>();

const detailsOpen = ref(false);
const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
let detailsFocusTarget: HTMLElement | null = null;

function showDetails(event: PointerEvent) {
	if (!pageActive.value || !componentActive.value) return;
	detailsFocusTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	detailsOpen.value = true;
}

function onDetailsClosed() {
	detailsOpen.value = false;
	const target = detailsFocusTarget;
	detailsFocusTarget = null;
	if (!target || !pageActive.value || !componentActive.value) return;
	nextTick(() => {
		if (pageActive.value && componentActive.value && target.isConnected) target.focus({ preventScroll: true });
	});
}

function dismissDetails() {
	detailsFocusTarget = null;
	detailsOpen.value = false;
}

watch(pageActive, value => {
	if (!value) dismissDetails();
}, { flush: 'sync' });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => {
	componentActive.value = false;
	dismissDetails();
});
</script>

<style lang="scss" module>
.typeIcon {
	flex-shrink: 0;
}

.target {
	overflow-wrap: anywhere;
}

.details {
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-width: 0;

	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
}

.diff {
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border-radius: 6px;
	overflow: clip;
}

.logYellow {
	color: var(--MI_THEME-warn);
}

.logRed {
	color: var(--MI_THEME-error);
}

.logGreen {
	color: var(--MI_THEME-success);
}
</style>
