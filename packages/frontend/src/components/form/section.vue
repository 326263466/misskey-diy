<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div v-if="$slots.label" :class="$style.label"><slot name="label"></slot></div>
	<div :class="$style.main">
		<div v-if="$slots.description" :class="$style.description"><slot name="description"></slot></div>
		<slot></slot>
	</div>
</div>
</template>

<style lang="scss" module>
.root {
	display: flow-root;
	background: var(--MI_THEME-panel);
	border-top: 1px solid var(--MI_THEME-divider);
}

.label {
	padding-top: var(--MI-margin);
	color: var(--MI_THEME-fg);
}

.main {
	display: flow-root;
	padding-block: var(--MI-margin);
}

.description {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	margin-bottom: var(--MI-margin);
}
</style>
