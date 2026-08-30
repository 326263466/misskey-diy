<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<nav class="_panel" :class="$style.nav">
		<template v-for="item in menu">
			<div v-if="item === '-'" :class="$style.divider"></div>
			<component
				:is="navbarItemDef[item].to ? 'MkA' : 'button'"
				v-else-if="navbarItemDef[item] != null && (navbarItemDef[item].show == null || navbarItemDef[item].show.value !== false)"
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
		</template>
		<div v-if="$i != null && ($i.isAdmin || $i.isModerator)" :class="$style.divider"></div>
		<MkA v-if="$i != null && ($i.isAdmin || $i.isModerator)" :class="$style.item" :activeClass="$style.itemActive" to="/admin">
			<i :class="$style.itemIcon" class="ti ti-dashboard ti-fw"></i>
			<span :class="$style.itemText">{{ i18n.ts.controlPanel }}</span>
		</MkA>
	</nav>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { navbarItemDef } from '@/navbar.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';

// header 已有的条目不在左侧菜单重复显示（时间线和"更多"按钮已随模板一并移除）
// 菜单配置里的分割线 (-) 也不显示，控制面板前的分隔线由模板固定提供
const duplicatedWithHeader = ['explore', 'channels', 'announcements', 'search'];

const menu = computed(() => prefer.r.menu.value.filter(item => item !== '-' && !duplicatedWithHeader.includes(item)));
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

.item {
	// 掘金实测: height 44px / padding 0 12px / margin-bottom 2px / border-radius 4px / font-size 16px
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
	font-size: 15px;
	text-align: left;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonBg);
	}

	&.itemActive {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
		font-weight: 700;
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

.divider {
	margin: 8px 12px;
	border-top: solid 0.5px var(--MI_THEME-divider);
}
</style>
