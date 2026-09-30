<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" zPriority="high" :returnFocusTo="returnFocusTo" @click="dismiss" @esc="dismiss" @closed="emit('closed')">
	<div
		ref="container"
		:class="$style.root"
		role="dialog"
		aria-modal="true"
		:aria-labelledby="messageId"
		tabindex="-1"
	>
		<i class="ti ti-info-circle" :class="$style.icon" aria-hidden="true"></i>
		<div :id="messageId" class="_selectable" :class="$style.message">{{ message }}</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';

defineProps<{
	message: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const container = useTemplateRef('container');
const messageId = useId();
const returnFocusTo = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
let timeout: number | undefined;
let closing = false;

function dismiss() {
	if (closing) return;
	closing = true;
	window.clearTimeout(timeout);
	modal.value?.close();
}

onMounted(() => {
	container.value?.focus({ preventScroll: true });
	timeout = window.setTimeout(dismiss, 3000);
});

onBeforeUnmount(() => {
	window.clearTimeout(timeout);
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: flex;
	align-items: center;
	align-self: flex-start;
	gap: 12px;
	// Keep the original 66px top offset, including MkModal's padding.
	margin: 34px auto 0;
	padding: 16px;
	width: max-content;
	max-width: min(420px, 100%);
	min-width: min(300px, 100%);
	box-sizing: border-box;
	text-align: left;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-panel);
	border-radius: 8px;
	overflow: clip;

	@media (max-width: 500px) {
		margin-top: 50px;
	}
}

.icon {
	flex-shrink: 0;
	font-size: 20px;
	line-height: 1;
	color: var(--MI_THEME-accent);
}

.message {
	flex: 1;
	min-width: 0;
	font-weight: 500;
	line-height: 1.5;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
</style>
