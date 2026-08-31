<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { '_forceShrinkSpacer': deviceKind === 'smartphone' }]">
	<XTitlebar v-if="prefer.r.showTitlebar.value" style="flex-shrink: 0;"/>

	<!-- 移动端沿用原有布局 -->
	<div v-if="isMobile" :class="$style.nonTitlebarArea">
		<div :class="$style.contents" @contextmenu.stop="onContextmenu">
			<div>
				<XReloadSuggestion v-if="shouldSuggestReload"/>
				<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
				<XThemePreviewing v-if="isThemePreviewMode"/>
				<XAnnouncements v-if="$i"/>
				<XStatusBars :class="$style.statusbars"/>
			</div>
			<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :class="$style.content"/>
			<RouterView v-else :class="$style.content"/>
			<XMobileFooterMenu ref="navFooter" v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing"/>
		</div>
	</div>

	<!-- 桌面端: 顶部固定 header + 三栏 -->
	<template v-else>
		<XJuejinHeader :class="$style.header"/>

		<div :class="$style.notices">
			<XReloadSuggestion v-if="shouldSuggestReload"/>
			<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
			<XThemePreviewing v-if="isThemePreviewMode"/>
			<XAnnouncements v-if="$i"/>
			<XStatusBars/>
		</div>

		<div :class="$style.body" @contextmenu.stop="onContextmenu">
			<div :class="[$style.columns, pageMetadata?.needWideArea ? $style.wide : null]">
				<XJuejinDock :class="$style.dock"/>

				<div :class="$style.stream">
					<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :class="$style.content"/>
					<RouterView v-else :class="$style.content"/>
				</div>

				<div v-if="!pageMetadata?.needWideArea" :class="$style.sidebar">
					<XWidgets/>
				</div>
			</div>
		</div>
	</template>

	<XCommon v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing"/>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, provide, computed, ref } from 'vue';
import { instanceName } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import XCommon from './_common_/common.vue';
import type { PageMetadata } from '@/page.js';
import XMobileFooterMenu from '@/ui/_common_/mobile-footer-menu.vue';
import XPreferenceRestore from '@/ui/_common_/PreferenceRestore.vue';
import XReloadSuggestion from '@/ui/_common_/ReloadSuggestion.vue';
import XThemePreviewing from '@/ui/_common_/ThemePreviewing.vue';
import XTitlebar from '@/ui/_common_/titlebar.vue';
import XJuejinHeader from '@/ui/_common_/juejin-header.vue';
import XJuejinDock from '@/ui/_common_/juejin-dock.vue';
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

const XWidgets = defineAsyncComponent(() => import('./_common_/widgets.vue'));
const XStatusBars = defineAsyncComponent(() => import('@/ui/_common_/statusbars.vue'));
const XAnnouncements = defineAsyncComponent(() => import('@/ui/_common_/announcements.vue'));

const isRoot = computed(() => mainRouter.currentRoute.value.name === 'index');

const MOBILE_THRESHOLD = 500;

// デスクトップでウィンドウを狭くしたときモバイルUIが表示されて欲しいことはあるので deviceKind === 'desktop' の判定は行わない
const isMobile = ref(deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD);
window.addEventListener('resize', () => {
	isMobile.value = deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD;
});

const pageMetadata = ref<null | PageMetadata>(null);
const widgetsShowing = ref(false);

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
$content-top-gap: 20px;
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
	// 掘金的 main 用 margin-top: 20px 与 header 拉开间距。
	// 左右余白は常時付ける (幅は内容 1200px を保つため max-width に padding 分を足す)
	padding: $content-top-gap $body-side-margin 0;

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

// 3 カラムの「見た目の間隔」を gap の 20px に揃える。
// dock / sidebar のカードは自分の列幅いっぱいに描かれるが、中カラムだけは
//   - ページ側 ._spacer の左右インセット (既定 24px)
//   - ._pageScrollable が確保するスクロールバーの溝 (10px)
// が内側を食うため、実測ではカード間が左 44px / 右 54px になっていた。
// 中カラムも列幅いっぱいまで描かせて 20px / 20px に揃える。
//
// wide ページ (settings / admin) は左右カラムが無く、_spacer 自身が 1200px 中央寄せと
// 左右余白を担っている (§6) ので対象外にする。
.columns:not(.wide) > .stream {
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

	// 本文スロット直下の _spacer だけ左右インセットを打ち消す (上下 padding は縦余白として残す)。
	// ページが指定した --MI_SPACER-w の上限は尊重する。
	//
	// 起点を MkStickyContainer の本文 div (data-sticky-container-header-height を持つ) に
	// 限定しているのは、sticky footer スロット内の _spacer を巻き込まないため。
	// footer は本文 div の兄弟で、かつ他の _spacer の子孫でもないので、
	// 単に ._spacer:not(._spacer *) と書くと footer のボタン列がカード端に貼り付く。
	//
	// 入れ子の _spacer (MkFolder 等) は内側の余白として意味があるので :not() で除外する
	:global([data-sticky-container-header-height]) :global(._spacer:not(._spacer *)) {
		max-width: min(var(--MI_SPACER-w, 100%), 100%);
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
