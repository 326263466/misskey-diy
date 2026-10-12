<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="440" :height="560" autoHeight :closeOnBackdrop="false" @close="close" @closed="emit('closed')">
	<template #header>{{ i18n.ts._chat.createRoom }}</template>
	<form class="_spacer _spacerCard _gaps" @submit.prevent="create">
		<div :class="$style.avatarField">
			<img v-if="avatarUrl" :src="avatarUrl" :alt="i18n.ts.avatar" :class="$style.avatar"/>
			<MkAvatar v-else :user="$i" :link="false" :preview="false" :class="$style.avatar"/>
			<div :class="$style.avatarActions">
				<MkButton small :disabled="saving || selectingAvatar || createdRoom != null" @click="selectAvatar">{{ i18n.ts._profile.changeAvatar }}</MkButton>
				<MkButton v-if="avatarId" small :disabled="saving || selectingAvatar || createdRoom != null" @click="resetAvatar">{{ i18n.ts.resetToDefaultValue }}</MkButton>
			</div>
		</div>
		<MkInput v-model="name" :placeholder="defaultName" :counterMaxLength="CONTENT_LIMITS.chatRoomName" :autofocus="true" :disabled="saving || createdRoom != null">
			<template #label>{{ i18n.ts.name }}</template>
		</MkInput>
		<MkTextarea v-model="description" :rows="2" :counterMaxLength="CONTENT_LIMITS.chatRoomDescription" :disabled="saving || createdRoom != null">
			<template #label>{{ i18n.ts.description }}</template>
			<template #caption>{{ i18n.ts.optional }}</template>
		</MkTextarea>
		<MkSelect v-model="joinPolicy" :items="joinPolicyItems" :disabled="saving || createdRoom != null">
			<template #label>{{ i18n.ts._chat.joinPolicy }}</template>
		</MkSelect>
		<div :class="$style.actions">
			<MkButton :disabled="saving" @click="close">{{ i18n.ts.cancel }}</MkButton>
			<MkButton type="submit" primary :disabled="!canCreate">{{ createdRoom ? i18n.ts.retry : i18n.ts.create }}</MkButton>
		</div>
	</form>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { chooseDriveFile } from '@/utility/drive.js';
import MkAvatar from '@/components/global/MkAvatar.vue';

const emit = defineEmits<{
	(ev: 'created', room: Misskey.entities.ChatRoom): void;
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const $i = ensureSignin();
const createdRoom = ref<Misskey.entities.ChatRoom | null>(null);
const avatarId = ref<string | null>(null);
const avatarUrl = ref<string | null>(null);
const selectingAvatar = ref(false);
let disposed = false;
onBeforeUnmount(() => { disposed = true; });
const defaultName = computed(() => Array.from(i18n.tsx._chat.defaultRoomName({ name: $i.name || $i.username })).slice(0, CONTENT_LIMITS.chatRoomName).join(''));
const name = ref('');
const description = ref('');
const joinPolicy = ref<Misskey.entities.ChatRoom['joinPolicy']>('public');
const saving = ref(false);
const canCreate = computed(() => Array.from(name.value).length <= CONTENT_LIMITS.chatRoomName && Array.from(description.value).length <= CONTENT_LIMITS.chatRoomDescription && !saving.value && !selectingAvatar.value);
const joinPolicyItems = computed(() => [
	{ value: 'public' as const, label: i18n.ts._chat.joinPolicyPublic },
	{ value: 'approval' as const, label: i18n.ts._chat.joinPolicyApproval },
	{ value: 'invitation' as const, label: i18n.ts._chat.joinPolicyInvitation },
	{ value: 'closed' as const, label: i18n.ts._chat.joinPolicyClosed },
]);

function close() {
	if (saving.value) return;
	if (createdRoom.value) emit('created', createdRoom.value);
	dialogEl.value?.close();
}

async function selectAvatar() {
	if (saving.value || selectingAvatar.value) return;
	selectingAvatar.value = true;
	try {
		const [file] = await chooseDriveFile({ multiple: false });
		if (disposed || !file) return;
		if (!file.type.startsWith('image/')) {
			os.toast(i18n.ts._chat.avatarImageOnly, 'error');
			return;
		}
		avatarId.value = file.id;
		avatarUrl.value = file.url;
	} catch {
		// 取消文件选择时保留已有头像。
	} finally {
		selectingAvatar.value = false;
	}
}

function resetAvatar() {
	avatarId.value = null;
	avatarUrl.value = null;
}

async function create() {
	if (!canCreate.value) return;
	saving.value = true;
	try {
		const room = createdRoom.value ?? await misskeyApiWithErrorToast('chat/rooms/create', {
			name: name.value.trim() || defaultName.value,
			description: description.value,
			joinPolicy: joinPolicy.value,
			avatarId: avatarId.value,
		});
		createdRoom.value = room;
		emit('created', room);
		dialogEl.value?.close();
	} catch {
		// toast显示错误，保留建群表单供重试。
	} finally {
		// 成功后保持锁定，避免关闭过渡期间表单恢复可编辑状态。
		if (createdRoom.value == null) saving.value = false;
	}
}
</script>

<style lang="scss" module>
	.avatarField {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.avatar {
		flex-shrink: 0;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		object-fit: cover;
	}

	.avatarActions {
		display: flex;
		flex-wrap: nowrap;
		gap: 8px;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
