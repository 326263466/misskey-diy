<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div class="_panel _juejinCard" :class="$style.rankingCard">
		<MkA class="_button" :class="$style.item" :activeClass="$style.itemActive" to="/community-ranking">
			<i class="ti-fw ti ti-trophy" :class="$style.itemIcon"></i>
			<span :class="$style.itemText">{{ i18n.ts.communityRanking }}</span>
		</MkA>
	</div>
	<nav class="_panel _juejinCard" :class="$style.nav" :aria-label="i18n.ts.menu">
		<component
			:is="navbarItemDef[item].to ? 'MkA' : 'button'"
			v-for="item in menu"
			:key="item"
			class="_button"
			:class="$style.item"
			:activeClass="$style.itemActive"
			:to="navbarItemDef[item].to"
			v-on="navbarItemDef[item].action ? { click: navbarItemDef[item].action } : {}"
		>
			<i class="ti-fw" :class="[$style.itemIcon, navbarItemDef[item].icon]"></i>
			<span :class="$style.itemText">{{ navbarItemDef[item].title }}</span>
			<span v-if="navbarItemDef[item].indicated" :class="$style.itemIndicator" class="_blink">
				<span v-if="navbarItemDef[item].indicateValue" class="_indicateCounter" :class="$style.itemIndicateValueIcon">{{ navbarItemDef[item].indicateValue }}</span>
				<i v-else class="_indicatorCircle"></i>
			</span>
		</component>
	</nav>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { navbarItemDef } from '@/navbar.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

// header 已有的条目不在左侧菜单重复显示（通知、搜索、主要板块和"更多"按钮已由 header 提供）
const duplicatedWithHeader = ['notifications', 'explore', 'channels', 'announcements', 'search'];
const rankingCardItems = ['checkin', 'communityRanking'];
const fixedDockItems = ['games', 'about'] as const;

// 可见性判定放在这里而不是模板的 v-if，避免与 v-for 同元素共存
// navbarItemDef 是索引签名字典，未知 key 取到的是 undefined，故用 Object.hasOwn 判定存在性
const menu = computed(() => [...new Set([...prefer.r.menu.value, ...fixedDockItems])].filter(item => {
	if (item === '-' || duplicatedWithHeader.includes(item) || rankingCardItems.includes(item)) return false;
	if (!Object.hasOwn(navbarItemDef, item)) return false;
	const def = navbarItemDef[item];
	return def.show == null || def.show.value !== false;
}));

</script>

<style lang="scss" module>
.root {
	// 宽度由父组件 universal.vue 统一指定
	height: 100%;
	box-sizing: border-box;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.nav {
	padding: 8px;
	box-sizing: border-box;
}

.rankingCard {
	padding: 3px 8px;
	margin-bottom: 8px;
	box-sizing: border-box;

	// 单项卡片里去掉列表项之间的下外边距，避免内容整体上移、看起来没垂直居中
	.item {
		margin-bottom: 0;
	}
}

.item {
	// 掘金实测: height 44px / padding 0 12px / margin-bottom 2px / border-radius 4px / font-size 16px
	// 圆角刻意不用 var(--MI-radius)(12px): 为复刻掘金的 4px 方正观感，此处是有意偏离主题变量
	position: relative;
	display: flex;
	align-items: center;
	width: 100%;
	height: 44px;
	box-sizing: border-box;
	padding: 0 12px;
	margin-bottom: 2px;
	border-radius: 4px;
	color: var(--MI_THEME-fg);
	// 与顶部 header 导航项保持同一字号
	font-size: 14px;
	text-align: left;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonBg);
	}

	&.itemActive {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
	}
}

.itemIcon {
	flex-shrink: 0;
	margin-right: 10px;
	opacity: 0.8;
}

.itemText {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.itemIndicator {
	margin-left: auto;
	padding-left: 6px;
	color: var(--MI_THEME-navIndicator);
	font-size: 8px;
}

.itemIndicateValueIcon {
	font-size: 10px;
}

</style>
