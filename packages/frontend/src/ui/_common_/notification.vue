<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="$style.root"
	@mouseenter="setHovered(true)"
	@mouseleave="setHovered(false)"
	@focusin="onFocusIn"
	@focusout="onFocusOut"
>
	<XNotification :notification="notification" class="notification _acrylic" :class="$style.content" :contentVisibilityAuto="false" :full="false"/>
	<button type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" @click.stop="dismiss">
		<i class="ti ti-x" aria-hidden="true"></i>
	</button>
</div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import XNotification from '@/components/MkNotification.vue';
import { i18n } from '@/i18n.js';

defineProps<{
	notification: Misskey.entities.Notification;
}>();

const emit = defineEmits<{
	(ev: 'close'): void;
	(ev: 'pause'): void;
	(ev: 'resume'): void;
}>();

let remaining = 5000;
let startedAt = 0;
let timer: number | null = null;
let hovered = false;
let focused = false;
let paused = false;
let closed = false;

function clearTimer(): void {
	if (timer == null) return;
	window.clearTimeout(timer);
	timer = null;
}

function dismiss(): void {
	if (closed) return;
	closed = true;
	clearTimer();
	emit('close');
}

function startTimer(): void {
	if (closed || paused || timer != null) return;
	startedAt = performance.now();
	timer = window.setTimeout(dismiss, remaining);
}

function updatePauseState(): void {
	const nextPaused = hovered || focused;
	if (nextPaused === paused) return;
	paused = nextPaused;
	if (paused) {
		if (timer != null) remaining = Math.max(0, remaining - (performance.now() - startedAt));
		clearTimer();
		emit('pause');
	} else {
		emit('resume');
		startTimer();
	}
}

function onFocusOut(event: FocusEvent): void {
	focused = event.relatedTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
	updatePauseState();
}

function setHovered(value: boolean): void {
	hovered = value;
	updatePauseState();
}

function onFocusIn(): void {
	focused = true;
	updatePauseState();
}

onMounted(startTimer);
onBeforeUnmount(clearTimer);
</script>

<style lang="scss" module>
.root {
	position: relative;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	border-radius: 8px;
	overflow: clip;
	contain: content;
	pointer-events: auto;

	> .content {
		padding-right: 40px;
	}
}

.close {
	position: absolute;
	top: 4px;
	right: 4px;
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	color: var(--MI_THEME-fg);
	font-size: 0.8em;
	line-height: 1;
	pointer-events: auto;

	&:hover,
	&:focus-visible {
		background: var(--MI_THEME-buttonHoverBg);
	}
}
</style>
