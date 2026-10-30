<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span :class="[$style.root, { [$style.custom]: imageUrl && !failed }]" data-red-packet-cover>
	<img v-if="imageUrl && !failed" :src="imageUrl" alt="" :class="$style.image" @error="failed = true">
	<span :class="$style.pattern" aria-hidden="true"></span>
	<span :class="$style.seal" aria-hidden="true"><i class="mi-red-packet"></i></span>
	<span :class="$style.content"><strong>{{ message || i18n.ts._redPacket.defaultMessage }}</strong><slot></slot></span>
</span>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{ imageUrl?: string | null; message?: string }>();
const failed = ref(false);
watch(() => props.imageUrl, () => { failed.value = false; });
</script>

<style lang="scss" module>
.root {
	position: relative;
	isolation: isolate;
	contain: paint;
	overflow: hidden;
	display: flex;
	align-items: center;
	gap: 18px;
	min-height: 112px;
	padding: 20px;
	box-sizing: border-box;
	width: 100%;
	border-radius: var(--MI-radius);
	color: var(--MI-redPacketGold);
	background: linear-gradient(125deg, var(--MI-redPacketStart), var(--MI-redPacketEnd));
	backface-visibility: hidden;
}

.pattern {
	position: absolute;
	inset: 0;
	z-index: -1;
	background: repeating-radial-gradient(circle at 105% -20%, transparent 0 24px, color-mix(in srgb, var(--MI-redPacketGold) 16%, transparent) 25px 26px, transparent 27px 48px);
}

.root::before {
	content: '';
	position: absolute;
	inset: 52% -10% -70%;
	z-index: -1;
	border: 1px solid color-mix(in srgb, var(--MI-redPacketGold) 35%, transparent);
	border-radius: 50%;
	background: color-mix(in srgb, var(--MI-redPacketGold) 6%, transparent);
}

.seal {
	position: relative;
	display: grid;
	place-items: center;
	flex: 0 0 54px;
	height: 54px;
	border: 1px solid currentColor;
	border-radius: 50%;
	font-size: 26px;
	transition: background-color 180ms ease, border-color 180ms ease;

	&::before,
	&::after {
		content: '';
		position: absolute;
		inset: -1px;
		border: 1px solid color-mix(in srgb, var(--MI-redPacketGold) 58%, transparent);
		border-radius: inherit;
		background: color-mix(in srgb, var(--MI-redPacketGold) 5%, transparent);
		opacity: 0;
		pointer-events: none;
		transition: opacity 180ms ease;
		will-change: transform, opacity;
	}
}

.root:hover .seal {
	background: color-mix(in srgb, var(--MI-redPacketStart) 84%, var(--MI-redPacketGold) 16%);
	border-color: color-mix(in srgb, var(--MI-redPacketGold) 84%, white);
}

.root:hover .seal::before,
.root:hover .seal::after {
	animation: sealRipple 1600ms cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.root:hover .seal::after {
	animation-delay: 800ms;
}

.content {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
	text-align: start;
}

.content strong {
	display: block;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	font-size: 1.05em;
}

.image {
	position: absolute;
	inset: 0;
	z-index: -3;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.custom {
	background: transparent;
}

.custom .pattern {
	z-index: -2;
	background: linear-gradient(90deg, color-mix(in srgb, var(--MI-redPacketEnd) 90%, transparent), color-mix(in srgb, var(--MI-redPacketEnd) 65%, transparent));
}

@keyframes sealRipple {
	0% {
		opacity: 0;
		transform: scale(1);
	}

	12% {
		opacity: .46;
	}

	70% {
		opacity: .12;
	}

	100% {
		opacity: 0;
		transform: scale(1.45);
	}
}

@media (prefers-reduced-motion: reduce) {
	.root:hover .seal::before,
	.root:hover .seal::after {
		animation: none;
	}
}
</style>
