<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="400"
	:height="550"
	:withOkButton="false"
	@click="dialog?.close()"
	@close="dialog?.close()"
	@closed="emit('closed')"
	@esc="dialog?.close()"
>
	<template #header>{{ i18n.ts._qr.showUser }}</template>
	<MkQrShow class="_spacer _spacerCard" :user="user"/>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkQrShow from '@/pages/qr.show.vue';
import { i18n } from '@/i18n.js';

defineProps<{
	user: Misskey.entities.UserDetailed;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');
</script>
