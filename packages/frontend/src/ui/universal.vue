<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { '_forceShrinkSpacer': deviceKind === 'smartphone' }]">
	<XTitlebar v-if="prefer.r.showTitlebar.value" style="flex-shrink: 0;" @contextmenu.stop="onContextmenu"/>

	<!-- 移动端沿用原有布局 -->
	<div v-if="isMobile" :class="$style.nonTitlebarArea">
		<div :class="$style.contents" @contextmenu.stop="onContextmenu">
			<XJuejinHeader v-if="!$i" :class="$style.header" :dockHidden="true"/>
			<div>
				<XReloadSuggestion v-if="shouldSuggestReload"/>
				<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
				<XThemePreviewing v-if="isThemePreviewMode"/>
				<XAnnouncements v-if="$i"/>
				<XStatusBars v-if="$i" :class="$style.statusbars"/>
			</div>
			<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :class="$style.content"/>
			<RouterView v-else :class="$style.content"/>
			<XMobileFooterMenu ref="navFooter" v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing"/>
		</div>
	</div>

	<!-- 桌面端: 顶部固定 header + 三栏 -->
	<template v-else>
		<XJuejinHeader :class="$style.header" :dockHidden="dockHidden" @contextmenu.stop="onContextmenu"/>

		<div :class="$style.notices" @contextmenu.stop="onContextmenu">
			<XReloadSuggestion v-if="shouldSuggestReload"/>
			<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
			<XThemePreviewing v-if="isThemePreviewMode"/>
			<XAnnouncements v-if="$i"/>
			<XStatusBars v-if="$i"/>
		</div>

		<div :class="$style.body" @contextmenu.stop="onContextmenu">
			<div :class="[$style.columns, { [$style.wide]: wide, [$style.singleColumn]: singleColumn, [$style.navigationLayout]: navigationLayout }]">
				<XJuejinDock v-if="!singleColumn" :class="$style.dock"/>

				<div ref="mainContent" :class="$style.stream">
					<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :class="$style.content"/>
					<RouterView v-else :class="$style.content"/>
				</div>

				<div v-if="!wide && !singleColumn" :class="$style.sidebar">
					<XJuejinCheckin v-if="$i"/>
					<XWidgets/>
				</div>
			</div>
		</div>
		<XJuejinFloatingActions :content="mainContent"/>
	</template>

	<XCommon v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing"/>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, provide, computed, ref, onMounted, onUnmounted, useTemplateRef } from 'vue';
import { instanceName } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import XCommon from './_common_/common.vue';
import XWidgets from './_common_/widgets.vue';
import type { PageMetadata } from '@/page.js';
import XMobileFooterMenu from '@/ui/_common_/mobile-footer-menu.vue';
import XPreferenceRestore from '@/ui/_common_/PreferenceRestore.vue';
import XReloadSuggestion from '@/ui/_common_/ReloadSuggestion.vue';
import XThemePreviewing from '@/ui/_common_/ThemePreviewing.vue';
import XTitlebar from '@/ui/_common_/titlebar.vue';
import XJuejinHeader from '@/ui/_common_/juejin-header.vue';
import XJuejinDock from '@/ui/_common_/juejin-dock.vue';
import XJuejinCheckin from '@/ui/_common_/juejin-checkin.vue';
import XJuejinFloatingActions from '@/ui/_common_/juejin-floating-actions.vue';
import { isPreviewMode as isThemePreviewMode } from '@/theme.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { provideMetadataReceiver, provideReactiveMetadata } from '@/page.js';
import { deviceKind } from '@/utility/device-kind.js';
import { miLocalStorage } from '@/local-storage.js';
import { mainRouter } from '@/router.js';
import { prefer } from '@/preferences.js';
import { shouldSuggestRestoreBackup } from '@/preferences/utility.js';
import { DI } from '@/di.js';
import { shouldSuggestReload } from '@/utility/reload-suggest.js';

const XStatusBars = defineAsyncComponent(() => import('@/ui/_common_/statusbars.vue'));
const XAnnouncements = defineAsyncComponent(() => import('@/ui/_common_/announcements.vue'));

const isRoot = computed(() => mainRouter.currentRoute.value.name === 'index');
// 返回时堆叠的页面仍保持挂载，所以布局要跟随当前激活的路由
const singleColumn = computed(() => mainRouter.currentRoute.value.name === 'community' || [
	'/@:acct', '/@:acct/following', '/@:acct/followers',
	'/checkin', '/community-ranking', '/my/achievements', '/my/benefits',
].includes(mainRouter.currentRoute.value.path));

// 刷新时按路由确定最终宽度，不等待异步页面和用户资料。
const navigationLayout = computed(() => mainRouter.currentRoute.value.name === 'community' || [
	'/settings', '/admin', '/@:acct',
	'/checkin', '/community-ranking', '/my/achievements', '/my/benefits',
].includes(mainRouter.currentRoute.value.path));

const MOBILE_THRESHOLD = 500;
// 与下方 $dock-collapse-threshold 的左右边距、dock、gap、正文最小宽度保持同步。
const DOCK_COLLAPSE_THRESHOLD = 16 * 2 + 180 + 20 + 520 - 1;

// デスクトップでウィンドウを狭くしたときモバイルUIが表示されて欲しいことはあるので deviceKind === 'desktop' の判定は行わない
const isMobile = ref(deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD);
const dockCollapsed = ref(window.innerWidth <= DOCK_COLLAPSE_THRESHOLD);

function onResize() {
	isMobile.value = deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD;
	dockCollapsed.value = window.innerWidth <= DOCK_COLLAPSE_THRESHOLD;
}

onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => window.removeEventListener('resize', onResize));

const pageMetadata = ref<null | PageMetadata>(null);
// 在异步页面元数据到达之前，先确定导航页的布局外壳
const wide = computed(() => !singleColumn.value && (
	['/settings', '/admin', '/feedback'].includes(mainRouter.currentRoute.value.path) || pageMetadata.value?.needWideArea === true
));
const dockHidden = computed(() => singleColumn.value || wide.value || dockCollapsed.value);
const widgetsShowing = ref(false);
const mainContent = useTemplateRef('mainContent');

provide(DI.router, mainRouter);
provideMetadataReceiver((metadataGetter) => {
	const info = metadataGetter();
	pageMetadata.value = info;
	if (pageMetadata.value) {
		if (isRoot.value && pageMetadata.value.title === instanceName) {
			window.document.title = pageMetadata.value.title;
		} else {
			window.document.title = `${pageMetadata.value.title} - ${instanceName}`;
		}
	}
});
provideReactiveMetadata(pageMetadata);

const drawerMenuShowing = ref(false);

mainRouter.on('change', () => {
	drawerMenuShowing.value = false;
});

if (window.innerWidth > 1024) {
	const tempUI = miLocalStorage.getItem('ui_temp');
	if (tempUI) {
		miLocalStorage.setItem('ui', tempUI);
		miLocalStorage.removeItem('ui_temp');
		window.location.reload();
	}
}

function onContextmenu(ev: PointerEvent) {
	if (isLink(ev.target as HTMLElement)) return;
	if (['INPUT', 'TEXTAREA', 'IMG', 'VIDEO', 'CANVAS'].includes((ev.target as HTMLElement).tagName) || (ev.target as HTMLElement).attributes.getNamedItem('contenteditable') != null) return;
	if (window.getSelection()?.toString() !== '') return;
	const path = mainRouter.getCurrentFullPath();
	os.contextMenu([{
		type: 'label',
		text: path,
	}, {
		icon: 'ti ti-window-maximize',
		text: i18n.ts.openInWindow,
		action: () => {
			os.pageWindow(path);
		},
	}], ev);
}
</script>

<style lang="scss" module>
// 掘金实测值 (§1)
// header 内侧 1440px / 主体 1200px / 左 180px + 20px + 中 720px + 20px + 右 260px = 1200px
$content-width: 1200px;
$column-gap: 20px;
$dock-width: 180px;
$sidebar-width: 260px;
// メディアクエリでは CSS 変数が使えないため、--MI-margin と同じ値をここに置く
$body-side-margin: 16px;

// 中カラムの名目幅。両サイドを畳んだ後も中カラムを無限に広げないための上限として使う
$stream-width: 720px;
// 「中カラムをここまでは詰めてよい」という許容下限。閾値の計算にだけ使う値で、
// .stream に min-width として適用されるわけではない (.stream は min-width: 0)。
// この幅を割るくらいならもう 1 カラム畳む、という判断の境界
$stream-fit-min-3col: 600px;
$stream-fit-min-2col: 520px;

// 畳み方は 2 段階: まず右カラム (widgets)、次に左カラム (dock)。
// 「そのカラム構成と左右余白が同時に収まらなくなる幅」を閾値にする。
// 実数を直書きするとカラム幅を変えたとき追従しないので、必ず幅から計算する。
$sidebar-collapse-threshold: $body-side-margin * 2 + $dock-width + $column-gap + $stream-fit-min-3col + $column-gap + $sidebar-width - 1px;
// 修改此断点的组成值时，也要同步上方 DOCK_COLLAPSE_THRESHOLD，保证“更多”能补回隐藏入口。
$dock-collapse-threshold: $body-side-margin * 2 + $dock-width + $column-gap + $stream-fit-min-2col - 1px;

.root {
	height: 100dvh;
	overflow: clip;
	contain: strict;
	display: flex;
	flex-direction: column;
	background: var(--MI_THEME-navBg);
}

.header {
	flex-shrink: 0;
}

.notices {
	flex-shrink: 0;
	background: var(--MI_THEME-bg);
}

.body {
	flex: 1;
	min-height: 0;
	background: var(--MI_THEME-bg);
}

.columns {
	display: flex;
	gap: $column-gap;
	// 与掘金一致，主体为 1200px 固定宽度居中
	width: 100%;
	max-width: $content-width + $body-side-margin * 2;
	height: 100%;
	margin: 0 auto;
	box-sizing: border-box;
	// 页面距 header 的间距统一使用全局值。
	// 左右余白は常時付ける (幅は内容 1200px を保つため max-width に padding 分を足す)
	padding: var(--MI-pageGap) $body-side-margin 0;

	// 右カラムを畳んだ後は残る 2 カラムの自然幅で中央寄せし直す。
	// ここを 1200px のままにすると中カラムだけが 1000px 近くまで伸びて間延びする。
	// 左カラムを畳んだ後 (= $dock-collapse-threshold 以下) は viewport 自体が
	// 中カラムより狭いので、追加の上限は不要 (width: 100% が実効上限になる)
	@media (max-width: $sidebar-collapse-threshold) {
		max-width: $dock-width + $column-gap + $stream-width + $body-side-margin * 2;
	}

	// 控制台等需要横向空间的页面去掉宽度上限和边距
	&.wide {
		max-width: none;
		padding: 0;
		gap: 0;
	}

	// 反馈等普通宽版页面没有双列外壳，需要在此保留宽度和间距。
	&.wide:not(.navigationLayout) {
		max-width: calc(var(--MI-pageWidth) + var(--MI-margin) * 2);
		padding: var(--MI-pageGap) var(--MI-margin) 0;
	}

	&.singleColumn {
		--MI-pageSideInset: 0px;
		max-width: calc(var(--MI-pageWidth) + #{$body-side-margin * 2});
		padding-top: 0;
	}

	&.navigationLayout {
		--MI-pageWidth: var(--MI-navigationPageWidth);
		max-width: calc(var(--MI-pageWidth) + #{$body-side-margin * 2});
	}
}

// 左栏: 掘金的 .dock 固定宽度
.dock {
	width: $dock-width;
	flex-shrink: 0;
	height: 100%;

	// 左カラムは最後まで残す (2 段目でようやく畳む)
	@media (max-width: $dock-collapse-threshold) {
		display: none;
	}
}

.wide .dock {
	display: none;
}

// 中栏: 掘金的 .stream 名义固定 720px，但
// 为了在 1200px 以下不出现横向滚动，改用 flex 伸缩
.stream {
	flex: 1;
	min-width: 0;
	height: 100%;
}

.content {
	height: 100%;
}

// 普通页面和宽版页面的顶部操作栏共用卡片样式。
.columns > .stream > .content {
	--MI-pageHeaderBg: var(--MI_THEME-panel);
	--MI-pageHeaderRadius: var(--MI-cardRadius);
	--MI-pageHeaderBorder: none;
	--MI-pageHeaderOverflow: clip;
}

// Keep scrolling available without reserving a scrollbar gutter in the content column.
.columns > .stream {
	// dock / sidebar と同じ方針: スクロール自体は残してバーだけ隠す。
	// reversed 版 (chat など) も対になっているので必ず両方指定する
	:global(._pageContainer),
	:global(._pageScrollable),
	:global(._pageScrollableReversed) {
		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}
	}

}

// 右栏: 掘金的 .sidebar
.sidebar {
	width: $sidebar-width;
	flex-shrink: 0;
	height: 100%;
	box-sizing: border-box;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding-bottom: calc(var(--MI-margin) + env(safe-area-inset-bottom, 0px));
	// 保留滚动能力，仅隐藏滚动条
	// (宣言はネストされたルールより前に置く。Dart Sass 1.77+ の mixed-decls 警告対象になる)
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}

	// 幅が足りなくなったら右カラムから先に畳む (左カラムのナビは残す)
	@media (max-width: $sidebar-collapse-threshold) {
		display: none;
	}
}

// 移动端用 (原有布局)
.nonTitlebarArea {
	display: flex;
	flex: 1;
	min-height: 0;
}

.contents {
	--MI-pageHeaderBg: var(--MI_THEME-navBg);
	--MI-pageHeaderBgOpacity: 1;
	display: flex;
	flex-direction: column;
	flex: 1;
	height: 100%;
	min-width: 0;
}

.statusbars {
	position: sticky;
	top: 0;
	left: 0;
}
</style>
