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
		<i class="ti" :class="[$style.icon, success ? 'ti-check' : 'ti-info-circle']" aria-hidden="true"></i>
		<div :id="messageId" class="_selectable" :class="$style.message">{{ message }}</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';

defineProps<{
	message: string;
	success?: boolean;
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
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	margin: auto;
	padding: var(--MI-cardPadding);
	width: max-content;
	max-width: min(320px, 100%);
	min-width: min(120px, 100%);
	min-height: 120px;
	max-height: 100%;
	box-sizing: border-box;
	text-align: center;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.icon {
	flex-shrink: 0;
	font-size: 32px;
	line-height: 1;
	color: var(--MI_THEME-accent);
}

.message {
	flex: 0 1 auto;
	min-width: 0;
	min-height: 0;
	max-width: 100%;
	overflow-y: auto;
	font-weight: 500;
	line-height: 1.5;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
</style>
