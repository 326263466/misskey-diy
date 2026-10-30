<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 功能页内容区顶部的常驻工具栏：左侧放搜索或排序，右侧放新建入口，切换左侧菜单时保持位置不变。 -->
<template>
<div :class="$style.root">
	<div v-if="$slots.default" :class="$style.main">
		<slot></slot>
	</div>
	<div v-if="$slots.actions" :class="$style.actions">
		<slot name="actions"></slot>
	</div>
</div>
</template>

<script lang="ts" setup>
defineSlots<{
	default?: () => void;
	actions?: () => void;
}>();
</script>

<style lang="scss" module>
.root {
	// 搜索框、标签和按钮统一用正文字号，随用户的字号设置缩放。
	--MI-toolbarFontSize: 1em;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
	min-width: 0;
	// 只有按钮的视图与带搜索框的视图保持同一高度，切换时内容不跳动。
	min-height: calc(var(--MI-searchHeight, 40px) + 16px);
	box-sizing: border-box;
	padding: 8px var(--MI-margin);
	border-radius: var(--MI-cardRadius);
	background: var(--MI_THEME-panel);
}

.main {
	display: flex;
	flex: 1 1 220px;
	align-items: center;
	min-width: 0;
}

.actions {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}
</style>
