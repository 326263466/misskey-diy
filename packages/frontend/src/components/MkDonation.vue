<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panel _shadow" :class="$style.root">
	<div :class="$style.header">
		<div :class="$style.icon">
			<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-message-heart" width="24" height="24" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
				<path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
				<path d="M8 9h8"></path>
				<path d="M8 13h3.5"></path>
				<path d="M10.48 19.512l-2.48 1.488v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v4"></path>
				<path d="M18 22l3.35 -3.284a2.143 2.143 0 0 0 .005 -3.071a2.242 2.242 0 0 0 -3.129 -.006l-.224 .22l-.223 -.22a2.242 2.242 0 0 0 -3.128 -.006a2.143 2.143 0 0 0 -.006 3.071l3.355 3.296z"></path>
			</svg>
		</div>
		<div :class="$style.title">{{ i18n.ts.didYouLikeMisskey }}</div>
	</div>
	<div :class="$style.text">
		<I18n :src="i18n.ts.pleaseDonate" tag="span">
			<template #host>
				{{ instance.name ?? host }}
			</template>
		</I18n>
		<div>
			<MkA :class="$style.feedbackLink" to="/feedback" @click="close">{{ i18n.ts.feedback }}<i class="ti ti-arrow-right"></i></MkA>
		</div>
	</div>
	<div class="_buttons" :class="$style.buttons">
		<MkButton small rounded primary @click="close">{{ i18n.ts.remindMeLater }}</MkButton>
		<MkButton small rounded @click="neverShow">{{ i18n.ts.neverShow }}</MkButton>
	</div>
	<button class="_button" :class="$style.close" @click="close"><i class="ti ti-x"></i></button>
</div>
</template>

<script lang="ts" setup>
import { host } from '@@/js/config.js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { miLocalStorage } from '@/local-storage.js';
import { instance } from '@/instance.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const zIndex = os.claimZIndex('low');

function close() {
	miLocalStorage.setItem('latestDonationInfoShownAt', Date.now().toString());
	emit('closed');
}

function neverShow() {
	miLocalStorage.setItem('neverShowDonationInfo', 'true');
	close();
}
</script>

<style lang="scss" module>
.root {
	position: fixed;
	z-index: v-bind(zIndex);
	bottom: var(--MI-margin);
	left: 0;
	right: 0;
	margin: auto;
	box-sizing: border-box;
	width: calc(100% - (var(--MI-margin) * 2));
	max-width: 480px;
	padding: 18px 44px 18px 20px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 22%, transparent);
	border-radius: 16px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, transparent);
	-webkit-backdrop-filter: blur(16px) saturate(1.5);
	backdrop-filter: blur(16px) saturate(1.5);
	box-shadow: 0 12px 40px rgb(0 0 0 / .14), 0 2px 8px rgb(0 0 0 / .06);
	animation: cardIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes cardIn {
	from {
		opacity: 0;
		transform: translateY(24px) scale(0.96);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
}

.icon {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 44px;
	height: 44px;
	border-radius: 14px;
	color: var(--MI_THEME-fgOnAccent);
	background: linear-gradient(135deg, color-mix(in srgb, var(--MI_THEME-accent), white 24%), var(--MI_THEME-accent) 60%, color-mix(in srgb, var(--MI_THEME-accent), black 12%));
	box-shadow: 0 4px 14px color-mix(in srgb, var(--MI_THEME-accent) 38%, transparent);
	overflow: hidden;
}

// 高光沿徽章对角线扫过，间歇循环
.icon::after {
	content: "";
	position: absolute;
	inset: -40%;
	background: linear-gradient(115deg, transparent 42%, rgb(255 255 255 / .45) 50%, transparent 58%);
	transform: translateX(-120%);
	animation: sheen 4.2s ease-in-out 1.2s infinite;
}

@keyframes sheen {
	0% {
		transform: translateX(-120%);
	}
	32%,
	100% {
		transform: translateX(120%);
	}
}

.title {
	font-weight: 700;
	font-size: 1.05em;
	letter-spacing: 0.01em;
	background: linear-gradient(90deg, var(--MI_THEME-fg) 30%, color-mix(in srgb, var(--MI_THEME-accent) 65%, var(--MI_THEME-fg)));
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}

@supports not (-webkit-background-clip: text) {
	.title {
		background: none;
		color: var(--MI_THEME-fg);
	}
}

.text {
	margin-top: 8px;
	font-size: 0.95em;
	color: color-mix(in srgb, var(--MI_THEME-fg) 82%, transparent);
}

.feedbackLink {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	margin-top: 8px;
	padding: 2px 10px;
	border-radius: 999px;
	font-weight: 600;
	font-size: 0.95em;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--MI_THEME-accent) 25%, transparent);
	transition: background-color 0.2s, box-shadow 0.2s, transform 0.15s;
}

.feedbackLink:hover {
	background: color-mix(in srgb, var(--MI_THEME-accent) 20%, transparent);
	transform: translateY(-1px);
	box-shadow:
		inset 0 0 0 1px color-mix(in srgb, var(--MI_THEME-accent) 35%, transparent),
		0 3px 10px color-mix(in srgb, var(--MI_THEME-accent) 22%, transparent);
}

.feedbackLink i {
	font-size: 0.9em;
	transition: transform 0.15s;
}

.feedbackLink:hover i {
	transform: translateX(2px);
}

.buttons {
	margin-top: 12px;
}

.close {
	position: absolute;
	top: 10px;
	right: 10px;
	padding: 7px;
	border-radius: 999px;
	color: color-mix(in srgb, var(--MI_THEME-fg) 55%, transparent);
	transition: background-color 0.2s, color 0.2s;
}

.close:hover {
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	color: var(--MI_THEME-fg);
}

@media (prefers-reduced-motion: reduce) {
	.root {
		animation: none;
	}

	.icon::after {
		display: none;
	}
}

@media (max-width: 450px) {
	.root {
		padding: 14px 40px 14px 14px;
	}

	.icon {
		width: 38px;
		height: 38px;
		border-radius: 11px;
	}
}
</style>
