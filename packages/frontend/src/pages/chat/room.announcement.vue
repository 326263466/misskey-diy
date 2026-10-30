<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="pageMode ? 'div' : MkModalWindow" ref="dialog" v-bind="pageMode ? {} : { width: 440, autoHeight: true, closeOnBackdrop: !canEdit }" @close="close" @closed="emit('closed')">
	<template v-if="!pageMode" #header>{{ i18n.ts._chat.announcement }}</template>
	<div class="_spacer _spacerCard _gaps">
		<template v-if="canEdit">
			<MkTextarea v-model="announcement" :disabled="saving" :counterMaxLength="CONTENT_LIMITS.chatRoomAnnouncement" autofocus>
				<template #label>{{ i18n.ts._chat.announcement }}</template>
			</MkTextarea>
			<MkButton primary :disabled="saving || announcementLength > CONTENT_LIMITS.chatRoomAnnouncement" @click="save">{{ i18n.ts.save }}</MkButton>
		</template>
		<Mfm v-else-if="room.announcement" :text="room.announcement" :plain="true" :class="$style.text"/>
		<span v-else>{{ i18n.ts._chat.noAnnouncement }}</span>
	</div>
</component>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';

const props = defineProps<{ room: Misskey.entities.ChatRoom; pageMode?: boolean }>();
const emit = defineEmits<{ (event: 'updated', room: Misskey.entities.ChatRoom): void; (event: 'closed'): void }>();
const dialog = useTemplateRef<HTMLElement | InstanceType<typeof MkModalWindow>>('dialog');
const canEdit = computed(() => props.room.ownerId === ensureSignin().id || props.room.myRole === 'administrator');
const announcement = ref(props.room.announcement ?? '');
const announcementLength = computed(() => Array.from(announcement.value).length);
const saving = ref(false);
let closingAfterSave = false;
let disposed = false;

watch(() => props.room.announcement, (updated, previous) => {
	if (props.pageMode && !saving.value && announcement.value === (previous ?? '')) announcement.value = updated ?? '';
});
onBeforeUnmount(() => { disposed = true; });

function closeDialog() {
	const target = dialog.value;
	if (target && 'close' in target) target.close();
}

function close() { if (!props.pageMode && !saving.value) closeDialog(); }

async function save() {
	if (!canEdit.value || saving.value || announcementLength.value > CONTENT_LIMITS.chatRoomAnnouncement) return;
	const roomId = props.room.id;
	saving.value = true;
	try {
		const room = await misskeyApiWithErrorToast('chat/rooms/update', { roomId, announcement: announcement.value.trim() });
		if (disposed || props.room.id !== roomId) return;
		emit('updated', room);
		if (props.pageMode) {
			announcement.value = room.announcement;
			os.toast(i18n.ts.saved, 'success');
		} else {
			closingAfterSave = true;
			closeDialog();
		}
	} catch { /* 保留输入，便于重试。 */ } finally {
		if (!closingAfterSave) saving.value = false;
	}
}
</script>

<style lang="scss" module>
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
