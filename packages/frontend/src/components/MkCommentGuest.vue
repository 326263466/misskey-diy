<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.avatar" aria-hidden="true"></div>
	<div :class="$style.editorBody">
		<MkPostFormInput v-model="text" :maxLength="CONTENT_LIMITS.commentText" :placeholder="i18n.ts._article.commentPlaceholder">
			<template #actions><button type="button" class="_button" :class="$style.submit" disabled>{{ i18n.ts._article.publishComment }}</button></template>
		</MkPostFormInput>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import MkPostFormInput from '@/components/MkPostFormInput.vue';
import { i18n } from '@/i18n.js';

const text = ref('');
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	width: 100%;
	box-sizing: border-box;
}

.avatar {
	position: relative;
	flex: none;
	width: 40px;
	height: 40px;
	overflow: hidden;
	border-radius: 50%;
	background: var(--MI_THEME-panelHighlight);

	&::before, &::after {
		content: '';
		position: absolute;
		background: color-mix(in srgb, var(--MI_THEME-fgTransparentWeak) 35%, var(--MI_THEME-panelHighlight));
	}

	&::before { top: 9px; left: 14px; width: 12px; height: 16px; border-radius: 50%; }
	&::after { bottom: -7px; left: 7px; width: 26px; height: 22px; border-radius: 50% 50% 0 0; }
}

.editorBody { flex: 1 1 auto; width: 100%; min-width: 0; }
.submit { min-width: 100px; box-sizing: border-box; padding: 0 12px; border-radius: 6px; background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); line-height: 32px; opacity: .7; }
</style>
