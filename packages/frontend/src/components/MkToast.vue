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
		@mouseenter="pauseCountdown"
		@mouseleave="resumeCountdown"
	>
		<span :class="$style.icon" aria-hidden="true">
			<MkSystemIcon :type="systemIconType" :class="$style.iconInner"/>
		</span>
		<div :id="messageId" class="_selectable" :class="$style.message">{{ message }}</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkSystemIcon from '@/components/global/MkSystemIcon.vue';

const props = withDefaults(defineProps<{
	message: string;
	status?: 'info' | 'success' | 'warning' | 'error';
}>(), {
	status: 'info',
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const systemIconType = computed(() => {
	switch (props.status) {
		case 'success': return 'success' as const;
		case 'warning': return 'warn' as const;
		case 'error': return 'error' as const;
		default: return 'info' as const;
	}
});

const modal = useTemplateRef('modal');
const container = useTemplateRef('container');
const messageId = useId();
const returnFocusTo = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
let timeout: number | undefined;
let closing = false;
let remaining = 2000;
let countdownStartedAt = 0;

function pauseCountdown() {
	if (timeout == null || closing) return;
	remaining = Math.max(0, remaining - (performance.now() - countdownStartedAt));
	window.clearTimeout(timeout);
	timeout = undefined;
}

function resumeCountdown() {
	if (closing || timeout != null) return;
	countdownStartedAt = performance.now();
	timeout = window.setTimeout(dismiss, remaining);
}

function dismiss() {
	if (closing) return;
	closing = true;
	window.clearTimeout(timeout);
	timeout = undefined;
	modal.value?.close();
}

onMounted(() => {
	container.value?.focus({ preventScroll: true });
	if (!container.value?.matches(':hover')) resumeCountdown();
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
	display: block;
	flex-shrink: 0;
	width: 40px;
}

.iconInner {
	display: block;
	width: 100%;
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
