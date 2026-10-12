<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.rootFirst]: first }]">
	<div v-if="$slots.label" :class="[$style.label, { [$style.labelFirst]: first }]"><slot name="label"></slot></div>
	<div v-if="$slots.description" :class="$style.description"><slot name="description"></slot></div>
	<div :class="$style.main">
		<slot></slot>
	</div>
</div>
</template>

<script lang="ts" setup>
defineProps<{
	first?: boolean;
}>();
</script>

<style lang="scss" module>
.root {
	display: flow-root;
	border-top: var(--MI-divider);
}

.rootFirst {
	border-top: none;
}

.label {
	font-weight: bold;
	padding: 1.5em 0 0;
	margin: 0 0 8px;
}

.labelFirst {
	padding-top: 0;
}

.main {
	display: flow-root;
	margin-top: 1.5em;
}

.description {
	font-size: 0.85em;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
	margin: 0 0 8px;
}
</style>
