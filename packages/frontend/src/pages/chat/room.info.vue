<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panelPadding" :class="$style.root">
	<div :class="$style.identity">
		<img v-if="avatarUrl_" :src="avatarUrl_" :alt="i18n.ts.avatar" :class="$style.avatar"/>
		<MkAvatar v-else :user="room.owner" :link="false" :preview="false" :class="$style.avatar"/>
		<div :class="$style.identityFields">
			<MkInput v-model="name_" :counterMaxLength="Misskey.CONTENT_LIMITS.chatRoomName" :disabled="!isOwner">
				<template #label>{{ i18n.ts.name }}</template>
			</MkInput>
			<div v-if="isOwner" :class="$style.avatarActions">
				<MkButton small :disabled="saving || selectingAvatar" @click="selectAvatar">{{ i18n.ts._profile.changeAvatar }}</MkButton>
				<MkButton v-if="avatarId_" small :disabled="saving || selectingAvatar" @click="resetAvatar">{{ i18n.ts.resetToDefaultValue }}</MkButton>
			</div>
		</div>
	</div>

	<MkTextarea v-model="description_" :rows="2" :counterMaxLength="Misskey.CONTENT_LIMITS.chatRoomDescription" :disabled="!isOwner">
		<template #label>{{ i18n.ts.description }}</template>
	</MkTextarea>

	<div :class="$style.settings">
		<MkSelect v-model="joinPolicy_" :items="joinPolicyItems" :disabled="!isOwner || saving">
			<template #label>{{ i18n.ts._chat.joinPolicy }}</template>
		</MkSelect>
		<div v-if="canManage" :class="$style.silenceField">
			<MkSwitch v-model="isSilenced_" :disabled="saving">{{ i18n.ts._chat.silenceRoom }}</MkSwitch>
		</div>
		<MkInput v-if="canManage && isSilenced_" v-model="silenceUntil_" type="datetime-local" :class="$style.silenceUntil" :disabled="saving">
			<template #label>{{ i18n.ts._chat.silenceUntil }}</template>
			<template #caption>{{ i18n.ts._chat.silenceUntilDescription }}</template>
		</MkInput>
	</div>

	<div v-if="room.isMember !== false" :class="$style.personalSettings">
		<MkSwitch :modelValue="isMuted" :disabled="muting" @update:modelValue="mute">
			<template #label>{{ i18n.ts._chat.muteThisRoom }}</template>
		</MkSwitch>
	</div>

	<div v-if="canManage || $i.isAdmin || $i.isModerator" :class="$style.actions">
		<MkButton v-if="isOwner || ($i.isAdmin || $i.isModerator)" danger @click="del">{{ i18n.ts._chat.deleteRoom }}</MkButton>
		<MkButton v-if="canManage" primary :class="$style.saveButton" :disabled="saving || selectingAvatar || !validContent" @click="save">{{ i18n.ts.save }}</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';
import { ensureSignin } from '@/i.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import { useRouter } from '@/router.js';
import { chooseDriveFile } from '@/utility/drive.js';
import MkAvatar from '@/components/global/MkAvatar.vue';
import { globalEvents } from '@/events.js';
import { setChatRoomMuted } from '@/utility/chat-conversations.js';

const router = useRouter();
const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});
const canManage = computed(() => isOwner.value || props.room.myRole === 'administrator');

const name_ = ref(props.room.name);
const description_ = ref(props.room.description);
const validContent = computed(() => !isOwner.value || (name_.value.trim() !== '' &&
	(name_.value === props.room.name || Array.from(name_.value).length <= Misskey.CONTENT_LIMITS.chatRoomName) &&
	(description_.value === props.room.description || Array.from(description_.value ?? '').length <= Misskey.CONTENT_LIMITS.chatRoomDescription)));
const avatarId_ = ref(props.room.avatarId ?? null);
const avatarUrl_ = ref(props.room.avatarUrl ?? null);
const selectingAvatar = ref(false);
let disposed = false;
let muteTimer: number | undefined;
onBeforeUnmount(() => { disposed = true; window.clearTimeout(muteTimer); });
const joinPolicy_ = ref(props.room.joinPolicy);
const isSilenced_ = ref(props.room.isSilenced ?? false);
const silenceUntil_ = ref(props.room.silenceUntil ? toLocalDateTime(props.room.silenceUntil) : '');

function toLocalDateTime(value: string) {
	const date = new Date(value);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

watch(() => props.room, (updated, previous) => {
	// 同步其他管理员的修改；正在编辑的字段保留本地输入。
	if (name_.value === previous.name) name_.value = updated.name;
	if (description_.value === previous.description) description_.value = updated.description;
	if (joinPolicy_.value === previous.joinPolicy) joinPolicy_.value = updated.joinPolicy;
	if (avatarId_.value === (previous.avatarId ?? null)) { avatarId_.value = updated.avatarId ?? null; avatarUrl_.value = updated.avatarUrl ?? null; }
	if (isSilenced_.value === (previous.isSilenced ?? false)) isSilenced_.value = updated.isSilenced ?? false;
	if (silenceUntil_.value === (previous.silenceUntil ? toLocalDateTime(previous.silenceUntil) : '')) silenceUntil_.value = updated.silenceUntil ? toLocalDateTime(updated.silenceUntil) : '';
});

const joinPolicyItems = computed(() => [
	{ value: 'public' as const, label: i18n.ts._chat.joinPolicyPublic },
	{ value: 'approval' as const, label: i18n.ts._chat.joinPolicyApproval },
	{ value: 'invitation' as const, label: i18n.ts._chat.joinPolicyInvitation },
	{ value: 'closed' as const, label: i18n.ts._chat.joinPolicyClosed },
]);
const saving = ref(false);
const emit = defineEmits<{
	(ev: 'updated', room: Misskey.entities.ChatRoom): void;
	(ev: 'close'): void;
}>();

async function selectAvatar() {
	if (!isOwner.value || saving.value || selectingAvatar.value) return;
	selectingAvatar.value = true;
	try {
		const [file] = await chooseDriveFile({ multiple: false });
		if (disposed || !file) return;
		if (!file.type.startsWith('image/')) {
			os.toast(i18n.ts._chat.avatarImageOnly, 'error');
			return;
		}
		avatarId_.value = file.id;
		avatarUrl_.value = file.url;
	} catch {
		// 取消文件选择时保留已有头像。
	} finally {
		selectingAvatar.value = false;
	}
}

function resetAvatar() {
	avatarId_.value = null;
	avatarUrl_.value = null;
}

async function save() {
	if (!canManage.value || saving.value || selectingAvatar.value || !validContent.value) return;
	const silenceEnd = isSilenced_.value && silenceUntil_.value ? new Date(silenceUntil_.value) : null;
	if (silenceEnd && (!Number.isFinite(silenceEnd.getTime()) || silenceEnd.getTime() <= Date.now())) {
		os.toast(i18n.ts._chat.silenceTimeInvalid, 'error');
		return;
	}
	saving.value = true;
	try {
		const updated = await misskeyApiWithErrorToast('chat/rooms/update', {
			roomId: props.room.id,
			...(isOwner.value ? { name: name_.value, description: description_.value, joinPolicy: joinPolicy_.value, avatarId: avatarId_.value } : {}),
			isSilenced: isSilenced_.value,
			silenceUntil: silenceEnd?.toISOString() ?? null,
		});
		avatarId_.value = updated.avatarId ?? null;
		avatarUrl_.value = updated.avatarUrl ?? null;
		emit('updated', updated);
		globalEvents.emit('chatRoomUpdated', updated);
		emit('close');
	} catch {
		// 错误由toast显示，保留输入以便重试。
	} finally {
		saving.value = false;
	}
}

async function del() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: name_.value }),
	});
	if (canceled) return;

	try {
		await misskeyApiWithErrorToast('chat/rooms/delete', { roomId: props.room.id });
		emit('close');
		router.push('/chat');
	} catch { /* 保留群信息以便重试。 */ }
}

const isMuted = ref(props.room.isMuted ?? false);

function refreshMute() {
	window.clearTimeout(muteTimer);
	const remaining = props.room.mutedUntil ? Date.parse(props.room.mutedUntil) - Date.now() : null;
	isMuted.value = props.room.isMuted === true && (remaining == null || remaining > 0);
	if (isMuted.value && remaining != null) muteTimer = window.setTimeout(refreshMute, Math.min(remaining + 10, 2147483647));
}

watch(() => [props.room.isMuted, props.room.mutedUntil], refreshMute, { immediate: true });

const muting = ref(false);

async function mute(value: boolean) {
	if (muting.value || props.room.isMember === false) return;
	muting.value = true;
	try {
		const updated = await setChatRoomMuted(props.room, value);
		if (updated) { isMuted.value = updated.isMuted ?? false; emit('updated', updated); }
	} catch {
		// 请求失败时保持原状态。
	} finally {
		muting.value = false;
	}
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.identity {
	display: grid;
	grid-template-columns: 64px minmax(0, 1fr);
	align-items: center;
	gap: 14px;
}

.avatar {
	width: 64px;
	height: 64px;
	border-radius: var(--MI-radius);
	object-fit: cover;
}

.identityFields {
	min-width: 0;
}

.avatarActions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 8px;
}

.settings {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 14px;
	align-items: end;
}

.silenceField {
	display: flex;
	align-items: center;
	min-height: 36px;
}

.silenceUntil {
	grid-column: 1 / -1;
}

.personalSettings {
	padding-top: 14px;
	border-top: var(--MI-divider);
}

.actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	padding-top: 14px;
	border-top: var(--MI-divider);
}

.saveButton {
	margin-left: auto;
}

@container (max-width: 440px) {
	.identity {
		grid-template-columns: 56px minmax(0, 1fr);
		gap: 12px;
	}

	.avatar {
		width: 56px;
		height: 56px;
	}

	.settings {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
