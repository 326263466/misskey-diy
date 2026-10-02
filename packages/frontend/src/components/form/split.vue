<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<slot></slot>
</div>
</template>

<script lang="ts" setup>
import { provide } from 'vue';

const props = withDefaults(defineProps<{
	minWidth?: number;
}>(), {
	minWidth: 210,
});

provide('splited', true);

const minWidth = props.minWidth + 'px';
</script>

<style lang="scss" module>
.root {
	// Each grid column is a separate content boundary.
	--MI-formGroupInset: 0px;
	--MI-formGroupRadius: initial;
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(v-bind('minWidth'), 100%), 1fr));
	grid-gap: 12px;
}
</style>
