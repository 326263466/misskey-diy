<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.empty">
	<span :class="$style.prompt">{{ i18n.ts._chat.selectConversation }}</span>
</div>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

definePage(() => ({
	title: i18n.ts.chat,
	icon: 'ti ti-message-circle',
}));
</script>

<style lang="scss" module>
.empty {
	display: grid;
	height: 100%;
	place-items: center;
	background-color: var(--MI_THEME-buttonBg);
	background-image: radial-gradient(circle, color-mix(in srgb, var(--MI_THEME-fg) 12%, transparent) 1px, transparent 1px);
	background-size: 24px 24px;
}

.prompt {
	padding: 6px 14px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 70%, transparent);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 14px;
	line-height: 1.5;
}
</style>
