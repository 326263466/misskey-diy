<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.illustration" aria-hidden="true">
		<span :class="$style.back"></span>
		<span :class="$style.front"><i></i><i></i><i></i></span>
	</div>
	<span>{{ i18n.ts._article.noComments }}</span>
</div>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
</script>

<style lang="scss" module>
.root { display: grid; justify-items: center; gap: var(--MI-marginHalf); padding: var(--MI-cardPadding); color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; text-align: center; }
.illustration { position: relative; width: 88px; height: 66px; }
.back, .front { position: absolute; box-sizing: border-box; border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 10%, transparent); border-radius: var(--MI-radius); }
.back { top: 6px; left: 7px; width: 50px; height: 34px; background: var(--MI_THEME-panelHighlight); transform: rotate(-9deg); }
.front { display: flex; align-items: center; justify-content: center; gap: 5px; top: 20px; left: 26px; width: 54px; height: 36px; background: color-mix(in srgb, var(--MI_THEME-accent) 9%, var(--MI_THEME-panel)); transform: rotate(6deg); }
.front::after { content: ''; position: absolute; bottom: -5px; left: 12px; width: 9px; height: 9px; background: inherit; border-right: inherit; border-bottom: inherit; transform: rotate(45deg); }
.front > i { width: 4px; height: 4px; border-radius: 50%; background: color-mix(in srgb, var(--MI_THEME-accent) 40%, var(--MI_THEME-fgTransparentWeak)); }
</style>
