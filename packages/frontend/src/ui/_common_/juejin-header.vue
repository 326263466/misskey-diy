<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.inner">
		<button class="_button" :class="$style.logo" :aria-label="instance.name ?? i18n.ts.instance" @click="openInstanceMenu">
			<img :src="instance.iconUrl || '/favicon.ico'" alt="" :class="$style.logoIcon"/>
			<span :class="$style.logoText">{{ instance.name ?? i18n.ts.instance }}</span>
		</button>

		<!-- dock 側の nav と 2 つの navigation landmark が並ぶので、支援技術向けに区別できる名前を付ける -->
		<nav :class="$style.nav" :aria-label="i18n.ts.navbar">
			<!-- 首页占位：内容待定，暂时与时间线同源。与其他导航项一致，只用文字不加图标 -->
			<MkA :class="$style.navItem" :activeClass="$style.navItemActive" to="/" exact>
				<span>{{ i18n.ts.home }}</span>
			</MkA>
			<MkA :class="$style.navItem" :activeClass="$style.navItemActive" to="/timeline">
				<span>{{ i18n.ts.timeline }}</span>
			</MkA>
			<template v-for="item in navItems" :key="item">
				<MkA
					v-if="navbarItemDef[item] != null && navbarItemDef[item].to != null && (navbarItemDef[item].show == null || navbarItemDef[item].show.value !== false)"
					:class="$style.navItem"
					:activeClass="$style.navItemActive"
					:to="navbarItemDef[item].to"
				>
					<span>{{ navbarItemDef[item].title }}</span>
					<span v-if="navbarItemDef[item].indicated" :class="$style.navItemIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
				</MkA>
			</template>
		</nav>

		<div :class="$style.right">
			<form :class="$style.search" role="search" @submit.prevent="search">
				<button type="submit" class="_button" :class="$style.searchIcon" :aria-label="i18n.ts.search">
					<i class="ti ti-search"></i>
				</button>
				<input
					v-model="searchQuery"
					:class="$style.searchText"
					type="search"
					enterkeyhint="search"
					:placeholder="i18n.ts.search"
					:aria-label="i18n.ts.search"
				>
			</form>

			<MkA v-if="$i != null" class="_button" :class="$style.iconButton" :activeClass="$style.iconButtonActive" :aria-label="i18n.ts.notifications" to="/my/notifications">
				<i class="ti ti-bell"></i>
				<span v-if="$i.hasUnreadNotification" :class="$style.iconButtonIndicator" class="_blink">
					<span class="_indicateCounter" :class="$style.iconButtonCounter">{{ $i.unreadNotificationsCount > 99 ? '99+' : $i.unreadNotificationsCount }}</span>
				</span>
			</MkA>

			<button class="_button" :class="$style.iconButton" :aria-label="i18n.ts.more" @click="more">
				<i class="ti ti-grid-dots"></i>
				<span v-if="otherNavItemIndicated" :class="$style.iconButtonIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
			</button>

			<MkA class="_button" :class="$style.iconButton" :activeClass="$style.iconButtonActive" :aria-label="i18n.ts.settings" to="/settings">
				<i class="ti ti-settings"></i>
			</MkA>

			<button :class="$style.post" class="_button _buttonGradate" data-testid="open-post-form" :aria-label="i18n.ts.note" @click="() => os.post()">
				<i class="ti ti-plus" :class="$style.postIcon"></i>
				<span :class="$style.postText">{{ i18n.ts.note }}</span>
			</button>

			<button v-if="$i != null" class="_button" :class="$style.account" :aria-label="`${i18n.ts.account}: @${$i.username}`" @click="openAccountMenu">
				<MkAvatar :user="$i" :class="$style.avatar"/>
			</button>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, unref } from 'vue';
import { openInstanceMenu } from './common.js';
import { navbarItemDef } from '@/navbar.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import * as os from '@/os.js';
import { getAccountMenu } from '@/accounts.js';
import { prefer } from '@/preferences.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import { useRouter } from '@/router.js';

const router = useRouter();
const searchQuery = ref('');

// 空输入时仍进入搜索页，保持原来点击图标的行为
function search() {
	const query = searchQuery.value.trim();
	router.pushByPath(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
	searchQuery.value = '';
}

// header 中央导航：全站主要板块（与左侧菜单互斥，避免重复）
const navItems = ['explore', 'channels', 'announcements'] as const;
const headerItems = new Set<string>(['notifications', 'search', ...navItems]);
const fixedDockItems = ['games', 'about'] as const;

const otherNavItemIndicated = computed<boolean>(() => {
	for (const def in navbarItemDef) {
		// 已经在顶部导航或左侧 dock 展示的项目，不应再次让“更多”闪烁提示。
		if (headerItems.has(def) || prefer.r.menu.value.includes(def)) continue;
		if (unref(navbarItemDef[def].indicated)) return true;
	}
	return false;
});

async function more(ev: MouseEvent) {
	const target = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (target == null) return;

	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkLaunchPad.vue').then(x => x.default), {
		anchorElement: target,
		anchor: { x: 'center', y: 'bottom' },
		excludedItems: [...headerItems, ...fixedDockItems],
	}, {
		closed: () => dispose(),
	});
}

async function openAccountMenu(ev: MouseEvent) {
	const menuItems = await getAccountMenu({
		withExtraOperation: true,
	});

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}
</script>

<style lang="scss" module>
// 按掘金实测值设定的逐级收缩断点
// header 内侧宽 1440px，低于断点后从左到右依次折叠元素。
// 各段は「実際に入らなくなる幅」で切る。まだ余白がある段階で畳むと間延びして見える
$search-shrink-threshold: 1400px; // 300px -> 200px
// 検索ボックスを 200px 保ったまま nav 全項目が入る下限 (現在の項目数での実測値)。
// header の収縮は主体側の三カラム折り畳みとは別問題なので、そちらの閾値には合わせず単独で決める
$search-collapse-threshold: 1000px; // 只显示图标
$logo-text-hide-threshold: 860px;
$post-text-hide-threshold: 760px;

.root {
	--juejinHeaderHeight: 60px;

	flex-shrink: 0;
	height: var(--juejinHeaderHeight);
	box-sizing: border-box;
	background: var(--MI_THEME-navBg);
	// 与下方内容之间不做分隔 (无分割线、无阴影)。
	// 境界を線で描かない代わりに、下のカラム内で position: sticky する要素
	// (ページ側の MkStickyContainer ヘッダー等) が header の上に重なって
	// はみ出さないよう、header 自身を重ね順で前に出しておく
	position: relative;
	z-index: 1;
}

.inner {
	// 掘金 header 内侧以 1440px 居中，比下方主体 (1200px) 更宽
	max-width: 1440px;
	height: 100%;
	margin: 0 auto;
	padding: 0 24px;
	box-sizing: border-box;
	display: flex;
	align-items: center;
	gap: 8px;
}

.logo {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	height: 40px;
	line-height: 1;
	// 掘金 logo 右侧有 12px 外边距
	margin-right: 12px;
	padding: 0 8px;
}

.logoIcon {
	height: 24px;
	width: auto;
	flex-shrink: 0;
}

.logoText {
	font-weight: 700;
	font-size: 1.1em;
	max-width: 180px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	@media (max-width: $logo-text-hide-threshold) {
		display: none;
	}
}

.nav {
	display: flex;
	align-items: center;
	min-width: 0;
	// 幅が足りないとき overflow: hidden だと末尾の項目が完全に到達不能になる
	// (dock を畳んだ後は header の nav が唯一のナビゲーションなので致命的)。
	// 横スクロールに切り替えて到達性を確保し、バーだけ隠す
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.navItem {
	position: relative;
	flex-shrink: 0;
	// 用 line-height 撑高居中会受字体基线度量影响产生偏差，
	// 改为与 header 内其他元素一致的 flex 居中，统一中心线
	display: flex;
	align-items: center;
	height: var(--juejinHeaderHeight);
	// 掘金实测: 导航项 font-size 14px / 宽 52px 左右 (相当于左右 padding 13px)
	padding: 0 13px;
	font-size: 14px;
	color: var(--MI_THEME-navFg);
	white-space: nowrap;

	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-accent);
	}

	&.navItemActive {
		color: var(--MI_THEME-navActive);
		font-weight: 700;

		&::after {
			content: "";
			position: absolute;
			bottom: 0;
			left: 16px;
			right: 16px;
			height: 2px;
			border-radius: 2px 2px 0 0;
			background: var(--MI_THEME-accent);
		}
	}
}

.navItemIndicator {
	position: absolute;
	top: 14px;
	right: 6px;
	color: var(--MI_THEME-navIndicator);
	font-size: 8px;
}

.right {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-left: auto;
	flex-shrink: 0;
}

// 掘金搜索框: 宽 300px / 高 40px
.search {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 300px;
	height: 40px;
	padding: 0 12px;
	margin-right: 8px;
	box-sizing: border-box;
	border-radius: 20px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fg);
	font-size: 13.2px;
	// 图标与文字用 flex 垂直居中
	line-height: 1;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);
	}

	// 宽度不足时逐级收缩，最后只保留图标
	@media (max-width: $search-shrink-threshold) {
		width: 200px;
	}

	// 必须与文字隐藏断点 (.searchText) 保持一致
	@media (max-width: $search-collapse-threshold) {
		width: 40px;
		padding: 0;
		margin-right: 4px;
		justify-content: center;
		background: transparent;

		&:hover {
			background: transparent;
		}
	}
}

.searchIcon {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	opacity: 0.7;
}

.searchText {
	flex: 1;
	min-width: 0;
	appearance: none;
	border: none;
	background: transparent;
	color: inherit;
	font-family: inherit;
	font-size: inherit;
	line-height: inherit;
	opacity: 0.7;

	&:focus {
		outline: none;
		opacity: 1;
	}

	// 去掉 type=search 在 WebKit 下自带的清除按钮和放大镜
	&::-webkit-search-cancel-button,
	&::-webkit-search-decoration {
		appearance: none;
	}

	@media (max-width: $search-collapse-threshold) {
		display: none;
	}
}

.iconButton {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	color: var(--MI_THEME-navFg);
	line-height: 1;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonBg);
	}

	&.iconButtonActive {
		color: var(--MI_THEME-navActive);
	}
}

.iconButtonIndicator {
	position: absolute;
	top: 0;
	right: 0;
	color: var(--MI_THEME-navIndicator);
	font-size: 8px;
}

// 全局 ._indicateCounter 的内边距按 em 给，在这个字号下会把单个数字撑成横向椭圆。
// 这里改成固定尺寸: 一位数收成正圆，多位数由内容撑宽成胶囊
.iconButtonCounter {
	box-sizing: border-box;
	height: 16px;
	min-width: 16px;
	padding: 0 4px;
	font-size: 10px;
	line-height: 1;
}

.post {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	height: 36px;
	padding: 0 16px;
	margin-left: 8px;
	border-radius: 18px;
	// 图标与文字用 flex 垂直居中
	font-weight: 700;
	color: var(--MI_THEME-fgOnAccent);
	line-height: 1;

	@media (max-width: $post-text-hide-threshold) {
		padding: 0;
		width: 36px;
	}
}

.postIcon {
	flex-shrink: 0;
}

.postText {
	white-space: nowrap;

	@media (max-width: $post-text-hide-threshold) {
		display: none;
	}
}

.account {
	display: flex;
	align-items: center;
	margin-left: 4px;
}

.avatar {
	width: 32px;
	height: 32px;
}
</style>
