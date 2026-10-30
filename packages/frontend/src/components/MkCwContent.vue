<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.enabled]: enabled, [$style.blurred]: enabled && !modelValue }]">
	<div :class="$style.body" :inert="enabled && !modelValue" :aria-hidden="enabled && !modelValue ? 'true' : undefined">
		<slot></slot>
	</div>
	<button
		v-if="enabled && !modelValue"
		type="button"
		class="_button"
		:class="$style.reveal"
		:aria-label="i18n.ts._cw.showContent"
		@click.stop="modelValue = true"
	></button>
</div>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';

const modelValue = defineModel<boolean>({ required: true });

defineProps<{
	enabled: boolean;
}>();
</script>

<style lang="scss" module>
.root {
	min-width: 0;

	&:not(.enabled) .body {
		display: contents;
	}

	&.enabled {
		position: relative;
		overflow: clip;
		border-radius: calc(var(--MI-radius) * 0.65);
	}

	&.blurred .body {
		// 不绘制正文，避免从模糊后的文字轮廓推断内容长度。
		visibility: hidden;
		user-select: none;
	}

	// 隐藏态使用固定高度和全宽背景，不暴露正文行数或每行长度。
	&.blurred {
		height: 3.25em;
		background: color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent);
	}
}

.body {
	min-width: 0;
	transition: filter 220ms ease, opacity 220ms ease;
}

.reveal {
	position: absolute;
	inset: 0;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -3px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.body {
		transition: none;
	}
}
</style>
