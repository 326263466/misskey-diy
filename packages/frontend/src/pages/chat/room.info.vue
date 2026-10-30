<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panelPadding" :class="$style.root">
	<section :aria-label="i18n.ts.basicInfo" :class="$style.section">
		<h3 :class="$style.sectionTitle">{{ i18n.ts.basicInfo }}</h3>
		<div :class="$style.identity">
			<img v-if="avatarUrl_" :src="avatarUrl_" :alt="i18n.ts.avatar" :class="$style.avatar"/>
			<MkAvatar v-else :user="room.owner" :link="false" :preview="false" :class="$style.avatar"/>
			<div :class="$style.identityFields">
				<MkInput v-model="name_" :counterMaxLength="Misskey.CONTENT_LIMITS.chatRoomName" :disabled="!isOwner || saving">
					<template #label>{{ i18n.ts.name }}</template>
				</MkInput>
				<div v-if="isOwner" :class="$style.avatarActions">
					<MkButton small :disabled="saving || selectingAvatar" @click="selectAvatar">{{ i18n.ts._profile.changeAvatar }}</MkButton>
					<MkButton v-if="avatarId_" small :disabled="saving || selectingAvatar" @click="resetAvatar">{{ i18n.ts.resetToDefaultValue }}</MkButton>
				</div>
			</div>
		</div>
		<MkTextarea v-model="description_" :rows="2" :counterMaxLength="Misskey.CONTENT_LIMITS.chatRoomDescription" :disabled="!isOwner || saving">
			<template #label>{{ i18n.ts.description }}</template>
		</MkTextarea>
	</section>

	<section :aria-label="i18n.ts._chat.joinValidation" :class="$style.section">
		<h3 :class="$style.sectionTitle">{{ i18n.ts._chat.joinValidation }}</h3>
		<MkSelect v-model="joinPolicy_" :items="joinPolicyItems" :disabled="!isOwner || saving">
			<template #label>{{ i18n.ts._chat.joinPolicy }}</template>
		</MkSelect>
		<MkTextarea v-if="joinPolicy_ === 'approval'" v-model="joinQuestion_" :rows="2" :counterMaxLength="200" :disabled="!isOwner || saving">
			<template #label>{{ i18n.ts._chat.joinQuestion }}</template>
			<template #caption>{{ i18n.ts._chat.joinQuestionDescription }}</template>
		</MkTextarea>
	</section>

	<div v-if="isOwner" :class="$style.actions">
		<MkButton primary :disabled="saving || selectingAvatar || deleting || !validContent" @click="save">{{ i18n.ts.save }}</MkButton>
	</div>

	<section v-if="isOwner || $i.isAdmin || $i.isModerator" :aria-label="i18n.ts._chat.dangerZone" :class="[$style.section, $style.dangerSection]">
		<h3 :class="$style.sectionTitle">{{ i18n.ts._chat.dangerZone }}</h3>
		<p :class="$style.sectionDescription">{{ i18n.ts._chat.deleteRoomDescription }}</p>
		<MkButton danger :disabled="saving || selectingAvatar || deleting" @click="del">{{ i18n.ts._chat.deleteRoom }}</MkButton>
	</section>
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
import MkSelect from '@/components/MkSelect.vue';
import { useRouter } from '@/router.js';
import { chooseDriveFile } from '@/utility/drive.js';
import MkAvatar from '@/components/global/MkAvatar.vue';
import { globalEvents } from '@/events.js';

const router = useRouter();
const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});

const name_ = ref(props.room.name);
const description_ = ref(props.room.description);
const joinQuestion_ = ref(props.room.joinQuestion ?? '');
const validContent = computed(() => !isOwner.value || (name_.value.trim() !== '' &&
	(name_.value === props.room.name || Array.from(name_.value).length <= Misskey.CONTENT_LIMITS.chatRoomName) &&
	(description_.value === props.room.description || Array.from(description_.value ?? '').length <= Misskey.CONTENT_LIMITS.chatRoomDescription) &&
	(joinPolicy_.value !== 'approval' || Array.from(joinQuestion_.value.trim()).length <= 200)));
const avatarId_ = ref(props.room.avatarId ?? null);
const avatarUrl_ = ref(props.room.avatarUrl ?? null);
const selectingAvatar = ref(false);
let disposed = false;
onBeforeUnmount(() => { disposed = true; });
const joinPolicy_ = ref(props.room.joinPolicy);

watch(() => props.room, (updated, previous) => {
	// 同步其他管理员的修改；正在编辑的字段保留本地输入。
	if (name_.value === previous.name) name_.value = updated.name;
	if (description_.value === previous.description) description_.value = updated.description;
	if (joinPolicy_.value === previous.joinPolicy) joinPolicy_.value = updated.joinPolicy;
	if (joinQuestion_.value === (previous.joinQuestion ?? '')) joinQuestion_.value = updated.joinQuestion ?? '';
	if (avatarId_.value === (previous.avatarId ?? null)) { avatarId_.value = updated.avatarId ?? null; avatarUrl_.value = updated.avatarUrl ?? null; }
});

const joinPolicyItems = computed(() => [
	{ value: 'public' as const, label: i18n.ts._chat.joinPolicyPublic },
	{ value: 'approval' as const, label: i18n.ts._chat.joinPolicyApproval },
	{ value: 'invitation' as const, label: i18n.ts._chat.joinPolicyInvitation },
	{ value: 'closed' as const, label: i18n.ts._chat.joinPolicyClosed },
]);
const saving = ref(false);
const deleting = ref(false);
const emit = defineEmits<{
	(ev: 'updated', room: Misskey.entities.ChatRoom): void;
	(ev: 'close'): void;
}>();

async function selectAvatar() {
	if (!isOwner.value || saving.value || selectingAvatar.value) return;
	selectingAvatar.value = true;
	try {
		const [file] = await chooseDriveFile({ multiple: false, resolveOnCancel: true });
		if (disposed || !file) return;
		if (!file.type.startsWith('image/')) {
			os.toast(i18n.ts._chat.avatarImageOnly, 'error');
			return;
		}
		avatarId_.value = file.id;
		avatarUrl_.value = file.url;
	} catch {
		// 文件选择失败时保留已有头像。
	} finally {
		selectingAvatar.value = false;
	}
}

function resetAvatar() {
	if (!isOwner.value || saving.value || selectingAvatar.value) return;
	avatarId_.value = null;
	avatarUrl_.value = null;
}

async function save() {
	if (!isOwner.value || saving.value || selectingAvatar.value || deleting.value || !validContent.value) return;
	saving.value = true;
	try {
		const updated = await misskeyApiWithErrorToast('chat/rooms/update', {
			roomId: props.room.id,
			name: name_.value,
			description: description_.value,
			joinPolicy: joinPolicy_.value,
			joinQuestion: joinPolicy_.value === 'approval' ? joinQuestion_.value.trim() : undefined,
			avatarId: avatarId_.value,
		});
		if (disposed) return;
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
	if (deleting.value || saving.value || selectingAvatar.value || !(isOwner.value || $i.isAdmin || $i.isModerator)) return;
	deleting.value = true;
	try {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.tsx.deleteAreYouSure({ x: props.room.name }),
		});
		if (canceled || disposed) return;
		await misskeyApiWithErrorToast('chat/rooms/delete', { roomId: props.room.id });
		if (disposed) return;
		emit('close');
		router.push('/chat');
	} catch { /* 保留群信息以便重试。 */ } finally { deleting.value = false; }
}

</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 20px;
}

.section {
	display: flex;
	flex-direction: column;
	gap: 14px;
	min-width: 0;

	& ~ .section {
		padding-top: 20px;
		border-top: var(--MI-divider);
	}
}

.sectionTitle {
	margin: 0;
	font-size: 1em;
	font-weight: 600;
}

.sectionDescription {
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
	line-height: 1.5;
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

.actions {
	display: flex;
	justify-content: flex-end;
}

.dangerSection .sectionTitle {
	color: var(--MI_THEME-error);
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
}
</style>
