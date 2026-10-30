<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="$style.root" role="dialog" :aria-labelledby="titleId" :aria-describedby="textId">
	<img :class="$style.character" src="/client-assets/tutorial/ai-tip.webp" alt="" width="192" height="252">
	<div :class="$style.bubble">
		<div :class="$style.header">
			<h2 :id="titleId" :class="$style.title">{{ i18n.ts.didYouLikeMisskey }}</h2>
		</div>
		<p :id="textId" :class="$style.text">
			<I18n :src="i18n.ts.pleaseDonate" tag="span">
				<template #host>{{ instance.name ?? host }}</template>
			</I18n>
		</p>
		<div :class="$style.actions">
			<MkButton small rounded :class="[$style.action, $style.secondaryAction]" @click="neverShow">{{ i18n.ts.neverShow }}</MkButton>
			<MkButton small rounded :class="[$style.action, $style.secondaryAction]" @click="close">{{ i18n.ts.remindMeLater }}</MkButton>
			<MkButton small rounded primary type="routerLink" to="/feedback" :class="$style.action" @click="close">{{ i18n.ts.feedback }}</MkButton>
		</div>
	</div>
</section>
</template>

<script lang="ts" setup>
import { useId } from 'vue';
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
const titleId = useId();
const textId = useId();

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
	bottom: calc(var(--MI-margin) + env(safe-area-inset-bottom, 0px));
	left: 0;
	right: 0;
	--MI-donation-character: 128px;
	box-sizing: border-box;
	width: min(480px, calc(100% - var(--MI-margin) * 2));
	max-width: 480px;
	margin: auto;
	animation: slideIn .35s cubic-bezier(.16, 1, .3, 1) both;
	// 与人物引导气泡（MkTip）同色，深底白字。
	--MI-donation-surface: var(--MI-ctaBg);
	--MI-donation-text: var(--MI-ctaFg);
}

// 人物固定宽度、底边与弹窗对齐，头部高出弹窗；弹窗左上角落在人物身体后面，不露出圆角。
.character {
	position: absolute;
	z-index: 1;
	bottom: 0;
	left: 0;
	display: block;
	width: var(--MI-donation-character);
	height: auto;
	pointer-events: none;
	user-select: none;
}

.bubble {
	min-width: 0;
	margin-inline-start: calc(var(--MI-donation-character) * 0.45);
	padding: 14px 14px 12px calc(var(--MI-donation-character) * 0.55 + 8px);
	border-radius: var(--MI-ctaRadius);
	background: var(--MI-donation-surface);
	color: var(--MI-donation-text);
	// 近处一层收紧边缘，远处一层托起浮层，与页面拉开层级。
	box-shadow:
		0 2px 6px color-mix(in srgb, var(--MI-ctaBg) 20%, transparent),
		0 12px 32px color-mix(in srgb, var(--MI-ctaBg) 28%, transparent);
}

.header {
	display: flex;
	align-items: start;
}

@keyframes slideIn {
	from { opacity: 0; transform: translateY(12px); }
}

.title {
	min-width: 0;
	margin: 0;
	font-size: 1em;
	font-weight: bold;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.text {
	margin: 5px 0 0;
	font-size: .9em;
	line-height: 1.6;
	color: color-mix(in srgb, var(--MI-donation-text) 82%, var(--MI-donation-surface));
	overflow-wrap: anywhere;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 6px;
	margin-top: 12px;
}

.action.action {
	min-width: 0;
}

// 深底上次要按钮用透明底和浅色描边，与引导气泡的关闭按钮一致。
.secondaryAction.secondaryAction {
	background: transparent;
	color: var(--MI-donation-text) !important;
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--MI-donation-text) 30%, transparent);

	&:not(:disabled):hover {
		background: color-mix(in srgb, var(--MI-donation-text) 12%, transparent);
	}
}

@media (max-width: 700px) {
	.root {
		bottom: calc(var(--MI-minBottomSpacingMobile) + var(--MI-margin));
	}
}

// 窄屏时收紧按钮，三个按钮排在一行，弹窗不长高，人物头部仍高出弹窗。
@media (max-width: 480px) {
	.bubble {
		padding-inline-end: 12px;
	}

	.action.action {
		padding-inline: 8px;
	}
}

// 更窄时按钮只能换行，弹窗会高过人物；左上角改为直角，不露出圆角。
@media (max-width: 360px) {
	.bubble {
		border-start-start-radius: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.root { animation: none; }
}
</style>
