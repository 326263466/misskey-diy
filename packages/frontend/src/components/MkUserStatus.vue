<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="display?.status === 'custom'" :class="$style.root">{{ display.text }}</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type * as Misskey from 'misskey-js';
import { $i } from '@/i.js';
import { getUserStatusDisplay } from '@/utility/user-status.js';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

const display = computed(() => getUserStatusDisplay(
	$i && props.user.id === $i.id && props.user.host === $i.host ? $i : props.user,
));
</script>

<style lang="scss" module>
.root {
	display: inline-flex;
	align-items: center;
	max-width: 100%;
	padding: 5px 9px;
	box-sizing: border-box;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
	font-size: 0.85em;
	font-weight: normal;
	line-height: 1.5;
	overflow-wrap: anywhere;
}
</style>
