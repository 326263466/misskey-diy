<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/chat/room/${room.id}`" class="_panel _card _gaps_s" :class="$style.root">
	<div :class="$style.header">
		<div style="font-weight: bold;"><Mfm :text="room.name" :plain="true" :author="room.owner"/></div>
		<img v-if="room.avatarUrl" :src="room.avatarUrl" alt="" :class="$style.headerAvatar"/>
		<MkAvatar v-else :user="room.owner" :link="false" :class="$style.headerAvatar"/>
	</div>
	<hr>
	<div><Mfm :text="room.description" :plain="true" :author="room.owner"/></div>
</MkA>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, ref } from 'vue';
import { useGlobalEvent } from '@/events.js';

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();
const updatedRoom = ref<Misskey.entities.ChatRoom | null>(null);
const room = computed(() => updatedRoom.value?.id === props.room.id ? updatedRoom.value : props.room);
useGlobalEvent('chatRoomUpdated', updated => {
	if (updated.id === props.room.id) updatedRoom.value = updated;
});

</script>

<style lang="scss" module>
.root {
	padding: var(--MI-cardPadding);
}

.header {
	display: flex;
	align-items: center;
}

.headerAvatar {
	object-fit: cover;
	border-radius: 50%;
	width: 30px;
	height: 30px;
	margin-left: auto;
}
</style>
