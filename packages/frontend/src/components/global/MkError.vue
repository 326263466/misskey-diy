<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkResult type="error" :page="props.page">
	<div :class="$style.actions">
		<MkButton rounded @click="() => emit('retry')">{{ i18n.ts.retry }}</MkButton>
		<slot></slot>
	</div>
</MkResult>
</template>

<script lang="ts" setup>
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	page?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'retry'): void;
}>();
</script>

<style lang="scss" module>
.actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: var(--MI-margin);
}
</style>
