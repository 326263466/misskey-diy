<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="720" :height="560" :closeOnBackdrop="!saving" @close="close" @closed="emit('closed')">
	<template #header>{{ i18n.ts._chat.messageSettings }}</template>
	<div class="_spacer _spacerCard _gaps">
		<MkInput v-model="query" type="search" :placeholder="i18n.ts.search"><template #prefix><i class="ti ti-search" aria-hidden="true"></i></template></MkInput>
		<div :class="$style.bulk">
			<label :class="$style.check"><input type="checkbox" :checked="visibleRooms.length > 0 && visibleRooms.every(room => selected.includes(room.id))" :disabled="saving || !visibleRooms.length" @change="toggleAll">{{ i18n.ts._chat.selectAll }}</label>
			<template v-if="selected.length">
				<MkSelect v-model="bulkMode" :items="options" :disabled="saving" :class="$style.select"><template #label>{{ i18n.ts._chat.messageSettings }}</template></MkSelect>
				<MkButton :disabled="saving" @click="applySelected">{{ i18n.ts.apply }} ({{ selected.length }})</MkButton>
			</template>
		</div>
		<div v-for="room in visibleRooms" :key="room.id" :class="$style.room">
			<label :class="$style.check"><input type="checkbox" :checked="selected.includes(room.id)" :disabled="saving" :aria-label="room.name" @change="toggleRoom(room.id)"></label>
			<img v-if="room.avatarUrl" :src="room.avatarUrl" alt="" :class="$style.avatar"/>
			<MkAvatar v-else :user="room.owner" :link="false" :preview="false" :class="$style.avatar"/>
			<span :class="$style.name"><Mfm :text="room.name" :plain="true" :nowrap="true"/></span>
			<MkSelect :modelValue="getChatNotificationMode(`room:${room.id}`, room)" :items="options" :disabled="saving" :class="$style.select" @update:modelValue="setRoomMode(room.id, $event)"><template #label>{{ i18n.ts._chat.messageSettings }}</template></MkSelect>
		</div>
		<MkResult v-if="visibleRooms.length === 0" type="empty" :text="i18n.ts._chat.noRooms"/>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import { chatNotificationOptions, getChatNotificationMode, updateChatConversation } from '@/utility/chat-conversation-settings.js';
import type { ChatNotificationMode } from '@/utility/chat-conversation-settings.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ rooms: Misskey.entities.ChatRoom[] }>();
const emit = defineEmits<{ (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const query = ref('');
const selected = ref<string[]>([]);
const saving = ref(false);
const bulkMode = ref<ChatNotificationMode>('silent');
const options = chatNotificationOptions();
const roomNameCollator = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base', numeric: true });
const sortedRooms = computed(() => props.rooms.toSorted((a, b) => roomNameCollator.compare(a.name, b.name)));
const visibleRooms = computed(() => {
	const keyword = query.value.trim().toLocaleLowerCase();
	return keyword ? sortedRooms.value.filter(room => room.name.toLocaleLowerCase().includes(keyword)) : sortedRooms.value;
});

function close() { if (!saving.value) dialogEl.value?.close(); }

function toggleRoom(id: string) {
	selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id];
}

function toggleAll() {
	const ids = visibleRooms.value.map(room => room.id);
	selected.value = ids.every(id => selected.value.includes(id)) ? selected.value.filter(id => !ids.includes(id)) : [...new Set([...selected.value, ...ids])];
}

async function setRoomMode(roomId: string, mode: unknown) {
	if (saving.value || !options.some(option => option.value === mode)) return;
	saving.value = true;
	try { await updateChatConversation({ roomId }, { notificationMode: mode as ChatNotificationMode }); } catch { /* 保存失败时保留原设置。 */ } finally { saving.value = false; }
}

async function applySelected() {
	if (saving.value) return;
	saving.value = true;
	try {
		for (const roomId of [...selected.value]) {
			await updateChatConversation({ roomId }, { notificationMode: bulkMode.value });
			selected.value = selected.value.filter(id => id !== roomId);
		}
	} catch { /* 已成功的保留，失败及未处理项保持选中以便重试。 */ } finally { saving.value = false; }
}
</script>

<style lang="scss" module>
.bulk { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.check { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
.check input { width: 18px; height: 18px; margin: 0; accent-color: var(--MI_THEME-accent); }
.room { display: flex; align-items: center; gap: 12px; min-width: 0; }
.avatar { width: 32px; height: 32px; object-fit: cover; border-radius: 50%; flex-shrink: 0; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.select { width: 230px; min-width: 0; }
@media (max-width: 520px) {
	.room { flex-wrap: wrap; }
	.room .select { width: 100%; margin-left: 30px; }
}
</style>
