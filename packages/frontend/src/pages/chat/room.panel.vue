<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="panel === 'search' ? 460 : panel === 'info' ? 520 : 480" :height="panel === 'info' ? 640 : 480" :autoHeight="panel !== 'search'" :headerIcon="panel === 'search' ? 'ti ti-search' : panel === 'members' ? 'ti ti-user-check' : 'ti ti-edit'" :closeOnBackdrop="panel !== 'info' || !canEditRoom" @closed="onClosed">
	<template #header>{{ panel === 'search' ? i18n.ts.search : panel === 'members' ? i18n.ts._chat.joinRequests : i18n.ts._chat.modify }}</template>
	<XSearch v-if="panel === 'search'" :userId="userId" :roomId="roomId" @select="select"/>
	<XMembers v-else-if="panel === 'members' && room" :room="room" @retry="emit('retry')"/>
	<XInfo v-else-if="room" :room="room" @updated="emit('updated', $event)" @close="dialogEl?.close()"/>
</MkModalWindow>
</template>

<script lang="ts" setup>
import type * as Misskey from 'misskey-js';
import { computed, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import XSearch from './room.search.vue';
import XInfo from './room.info.vue';
import XMembers from './room.members.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';

const props = defineProps<{
	panel: 'search' | 'info' | 'members';
	userId?: string;
	roomId?: string;
	room?: Misskey.entities.ChatRoom | null;
}>();

const emit = defineEmits<{
	(event: 'select', messageId: string): void;
	(event: 'updated', room: Misskey.entities.ChatRoom): void;
	(event: 'closed'): void;
	(event: 'retry'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const canEditRoom = computed(() => props.room != null && (props.room.ownerId === $i?.id || props.room.myRole === 'administrator'));
let selectedMessageId: string | null = null;

function select(messageId: string) {
	if (selectedMessageId != null) return;
	selectedMessageId = messageId;
	dialogEl.value?.close();
}

function onClosed() {
	if (selectedMessageId != null) emit('select', selectedMessageId);
	emit('closed');
}
</script>
