<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="340"
	:height="430"
	autoHeight
	:withOkButton="false"
	@close="dialog?.close()"
	@closed="emit('closed')"
	@esc="dialog?.close()"
>
	<template #header>{{ i18n.ts.qr }}</template>
	<MkQrShow compact :user="user"/>
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
