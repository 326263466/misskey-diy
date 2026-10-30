<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" role="status" aria-live="polite" aria-atomic="true">
	<Transition
		:css="prefer.s.animation"
		:enterActiveClass="$style.transition"
		:leaveActiveClass="$style.transition"
		:enterFromClass="$style.hidden"
		:leaveToClass="$style.hidden"
	>
		<div v-if="status" :class="$style.indicator" class="_panel _card _shadow">
			<div :class="$style.message">
				<i class="ti" :class="status === 'connected' ? ['ti-check', $style.connected] : 'ti-wifi-off'" aria-hidden="true"></i>
				<span v-if="status === 'connected'">{{ i18n.ts._streamIndicator.connected }}</span>
				<span v-else>{{ i18n.ts._streamIndicator.reconnecting }}<span :class="[$style.dots, { [$style.animated]: prefer.s.animation }]" aria-hidden="true"><span v-for="dot in 3" :key="dot">.</span></span></span>
			</div>
			<button type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" @click="dismiss">
				<i class="ti ti-x" aria-hidden="true"></i>
			</button>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { store } from '@/store.js';

const zIndex = os.claimZIndex('high');
const status = ref<'reconnecting' | 'connected' | null>(null);

let disconnected = false;
let disconnectNotified = false;
let showTimer: number | undefined;
let hideTimer: number | undefined;

function clearTimers() {
	window.clearTimeout(showTimer);
	window.clearTimeout(hideTimer);
	showTimer = undefined;
	hideTimer = undefined;
}

function showDisconnected() {
	showTimer = undefined;
	disconnectNotified = true;
	status.value = 'reconnecting';
}

function onDisconnected() {
	if (disconnected) return;
	disconnected = true;
	clearTimers();

	if (status.value) {
		showDisconnected();
	} else {
		showTimer = window.setTimeout(showDisconnected, 1000);
	}
}

function onConnected() {
	if (!disconnected) return;
	disconnected = false;
	clearTimers();
	if (!disconnectNotified) return;

	disconnectNotified = false;
	status.value = 'connected';
	hideTimer = window.setTimeout(dismiss, 4000);
}

function dismiss() {
	window.clearTimeout(hideTimer);
	hideTimer = undefined;
	status.value = null;
}

watch(() => store.s.realtimeMode, (enabled, _, onCleanup) => {
	if (!enabled) return;
	const stream = useStream();
	stream.on('_disconnected_', onDisconnected);
	stream.on('_connected_', onConnected);

	// 组件异步加载时，连接可能已经在重试。
	if (stream.state === 'reconnecting') onDisconnected();

	onCleanup(() => {
		stream.off('_disconnected_', onDisconnected);
		stream.off('_connected_', onConnected);
		clearTimers();
		disconnected = false;
		disconnectNotified = false;
		status.value = null;
	});
}, { immediate: true });
</script>

<style lang="scss" module>
.root {
	position: fixed;
	z-index: v-bind(zIndex);
	inset-inline: var(--MI-margin);
	bottom: calc(max(var(--MI-minBottomSpacing, 0px), env(safe-area-inset-bottom, 0px)) + var(--MI-margin));
	display: flex;
	justify-content: center;
	pointer-events: none;
}

.indicator {
	display: flex;
	align-items: center;
	gap: 12px;
	max-width: min(480px, 100%);
	min-height: 48px;
	box-sizing: border-box;
	padding: 8px 10px 8px 16px;
	/* 卡片外观交给 _panel / _card，这里只保留通知布局。 */
	color: var(--MI_THEME-bg);
	font-size: 0.9em;
	line-height: 1.5;
	pointer-events: auto;
}

.message {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	overflow-wrap: anywhere;

	> i {
		flex-shrink: 0;
		font-size: 1.2em;
	}
}

.connected {
	color: var(--MI_THEME-success);
}

.dots {
	display: inline-flex;
	width: 1em;
	justify-content: space-evenly;

	&.animated > span {
		animation: reconnecting-dot 1.2s ease-in-out infinite;
		&:nth-child(2) { animation-delay: .15s; }
		&:nth-child(3) { animation-delay: .3s; }
	}
}

@keyframes reconnecting-dot {
	0%, 60%, 100% { transform: translateY(0); }
	30% { transform: translateY(-.22em); }
}

.close {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 32px;
	height: 32px;
	border-radius: var(--MI-radius);

	&:hover,
	&:focus-visible {
		background: color-mix(in srgb, currentColor 12%, transparent);
	}
}

.transition {
	transition: opacity 0.15s, transform 0.15s;
}

.hidden {
	opacity: 0;
	transform: translateY(4px);
}

@media (pointer: coarse) {
	.close {
		width: 44px;
		height: 44px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.dots.animated > span {
		animation: none;
	}

	.transition {
		transition: none;
	}

	.hidden {
		transform: none;
	}
}
</style>
