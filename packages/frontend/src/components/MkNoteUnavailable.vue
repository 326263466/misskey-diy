<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="[$style.root, '_panel']">
	<div :class="$style.message">
		<span :class="$style.icon"><i class="ti ti-barrier-block" aria-hidden="true"></i></span>
		<h1 :class="$style.title">{{ i18n.ts.noteUnavailable }}</h1>
	</div>
	<MkA :class="$style.action" to="/timeline"><i class="ti ti-arrow-left" aria-hidden="true"></i>{{ i18n.ts.timeline }}</MkA>
</section>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 18px;
	min-height: 240px;
	box-sizing: border-box;
	padding: calc(var(--MI-cardPadding) + 20px) var(--MI-cardPadding);
	overflow: clip;
	border-radius: var(--MI-cardRadius);
	--stripe-color: color-mix(in srgb, var(--MI_THEME-warn) 9%, transparent);
	background-image: repeating-linear-gradient(
		135deg,
		transparent,
		transparent 12px,
		var(--stripe-color) 12px,
		var(--stripe-color) 18px
	);
	text-align: center;

	&::before,
	&::after {
		position: absolute;
		inset-inline: 0;
		height: 10px;
		content: '';
		background: repeating-linear-gradient(
			135deg,
			var(--MI_THEME-warn) 0 12px,
			color-mix(in srgb, var(--MI_THEME-fg) 70%, var(--MI_THEME-bg)) 12px 24px
		);
	}

	&::before { top: 0; }
	&::after { bottom: 0; }
}

.message {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
}

.icon {
	display: grid;
	place-items: center;
	width: 48px;
	height: 48px;
	border: 2px solid var(--MI_THEME-warn);
	border-radius: 50%;
	background: color-mix(in srgb, var(--MI_THEME-warn) 14%, transparent);
	box-shadow: 0 0 0 6px color-mix(in srgb, var(--MI_THEME-warn) 8%, transparent);
	color: var(--MI_THEME-fg);
	font-size: 24px;
}

.title {
	margin: 0;
	color: var(--MI_THEME-fg);
	font-size: 1.05em;
	font-weight: 700;
}

.action {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	min-height: 32px;
	padding-inline: 8px;
	color: var(--MI_THEME-fg);
	font-size: 0.9em;
	text-decoration: underline;
	text-underline-offset: 3px;

	&:hover { text-decoration-thickness: 2px; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; border-radius: 2px; }
}
</style>
