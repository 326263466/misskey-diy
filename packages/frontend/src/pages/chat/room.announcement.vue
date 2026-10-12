<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialog" :width="440" autoHeight :closeOnBackdrop="!canEdit" @close="close" @closed="emit('closed')">
	<template #header>{{ i18n.ts._chat.announcement }}</template>
	<div class="_spacer _spacerCard _gaps">
		<template v-if="canEdit">
			<MkTextarea v-model="announcement" :disabled="saving" :counterMaxLength="2048" autofocus>
				<template #label>{{ i18n.ts._chat.announcement }}</template>
			</MkTextarea>
			<MkButton primary :disabled="saving || announcementLength > 2048" @click="save">{{ i18n.ts.save }}</MkButton>
		</template>
		<Mfm v-else-if="room.announcement" :text="room.announcement" :plain="true" :class="$style.text"/>
		<span v-else>{{ i18n.ts._chat.noAnnouncement }}</span>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';

const props = defineProps<{ room: Misskey.entities.ChatRoom }>();
const emit = defineEmits<{ (event: 'updated', room: Misskey.entities.ChatRoom): void; (event: 'closed'): void }>();
const dialog = useTemplateRef('dialog');
const canEdit = computed(() => props.room.ownerId === ensureSignin().id || props.room.myRole === 'administrator');
const announcement = ref(props.room.announcement ?? '');
const announcementLength = computed(() => Array.from(announcement.value).length);
const saving = ref(false);
let closingAfterSave = false;

function close() { if (!saving.value) dialog.value?.close(); }

async function save() {
	if (!canEdit.value || saving.value || announcementLength.value > 2048) return;
	saving.value = true;
	try {
		const room = await misskeyApiWithErrorToast('chat/rooms/update', { roomId: props.room.id, announcement: announcement.value.trim() });
		emit('updated', room);
		closingAfterSave = true;
		dialog.value?.close();
	} catch { /* 保留输入，便于重试。 */ } finally {
		if (!closingAfterSave) saving.value = false;
	}
}
</script>

<style lang="scss" module>
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
