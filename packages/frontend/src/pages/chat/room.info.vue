<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps _panel _panelPadding">
	<MkInput v-model="name_" :disabled="!isOwner">
		<template #label>{{ i18n.ts.name }}</template>
	</MkInput>

	<MkTextarea v-model="description_" :disabled="!isOwner">
		<template #label>{{ i18n.ts.description }}</template>
	</MkTextarea>

	<MkButton v-if="isOwner" primary :disabled="saving" @click="save">{{ i18n.ts.save }}</MkButton>

	<hr>

	<MkButton v-if="isOwner || ($i.isAdmin || $i.isModerator)" danger @click="del">{{ i18n.ts._chat.deleteRoom }}</MkButton>

	<MkSwitch v-if="!isOwner" :modelValue="isMuted" :disabled="muting" @update:modelValue="mute">
		<template #label>{{ i18n.ts._chat.muteThisRoom }}</template>
	</MkSwitch>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import { useRouter } from '@/router.js';

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
const saving = ref(false);
const emit = defineEmits<{
	(ev: 'updated', room: Misskey.entities.ChatRoom): void;
}>();

async function save() {
	if (saving.value) return;
	saving.value = true;
	try {
		const updated = await os.apiWithDialog('chat/rooms/update', {
			roomId: props.room.id,
			name: name_.value,
			description: description_.value,
		});
		emit('updated', updated);
		os.success(i18n.ts.saved);
	} catch {
		// 错误由请求弹窗显示，保留输入以便重试。
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

	await os.apiWithDialog('chat/rooms/delete', {
		roomId: props.room.id,
	});
	router.push('/chat');
}

const isMuted = ref(props.room.isMuted ?? false);

const muting = ref(false);

async function mute(value: boolean) {
	if (muting.value) return;
	muting.value = true;
	try {
		await os.apiWithDialog('chat/rooms/mute', { roomId: props.room.id, mute: value });
		isMuted.value = value;
		emit('updated', { ...props.room, isMuted: value });
		os.success();
	} catch {
		// 请求失败时保持原状态。
	} finally {
		muting.value = false;
	}
}
</script>

<style lang="scss" module>
.membership {
	display: flex;
}

.membershipBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;

	&:hover {
		text-decoration: none;
	}
}
</style>
