<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button type="button" class="_button" :class="$style.root" :aria-expanded="modelValue" @click.stop="modelValue = !modelValue" @keydown.enter.stop @keydown.space.stop>
	<span :class="$style.summary"><slot>{{ modelValue ? i18n.ts._cw.contentShown : i18n.ts._cw.contentHidden }}</slot></span>
</button>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';

const modelValue = defineModel<boolean>({ required: true });
</script>

<style lang="scss" module>
.root {
	display: block;
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
	margin: 0;
	padding: 0;
	color: inherit;
	font: inherit;
	line-height: inherit;
	text-align: start;
	cursor: pointer;
}

.summary {
	display: block;
	min-width: 0;
	overflow-wrap: anywhere;
}

.root:focus-visible {
	outline: 2px solid var(--MI_THEME-focus);
	outline-offset: 2px;
	border-radius: calc(var(--MI-radius) * 0.4);
}
</style>
