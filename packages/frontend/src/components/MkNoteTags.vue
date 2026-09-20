<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<nav v-if="tags.length > 0" :class="$style.root" :aria-label="i18n.ts.hashtags">
	<MkA v-for="tag in tags" :key="tag" :to="`/tags/${encodeURIComponent(tag)}`" :class="$style.tag" @click.stop>#{{ tag }}</MkA>
</nav>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
defineProps<{ tags: string[] }>();
</script>

<style lang="scss" module>
.root { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
	box-sizing: border-box;
	max-width: 100%;
	padding: 2px 9px;
	border-radius: 999px;
	font-size: calc(1em - 1px);
	line-height: 20px;
	color: var(--MI_THEME-link);
	background: var(--MI_THEME-buttonBg);
	text-decoration: none;
	overflow-wrap: anywhere;
	&:hover { background: var(--MI_THEME-buttonHoverBg); }
}
</style>
