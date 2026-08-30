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
// ヘッダー内側 1440px / 本体 1200px / 左 200px + 20px + 中 (flex, 680px) + 20px + 右 280px = 1200px
$content-width: 1200px;
$column-gap: 20px;
$dock-width: 200px;
$sidebar-width: 280px;
$content-top-gap: 20px;

// 掘金は本体が 1200px を割ると3カラムを畳んで中央カラムだけにする (実測: 1215px で 3 カラム成立 / 1201px で崩れ始める)
$columns-collapse-threshold: 1214px;

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
	max-width: $content-width;
	height: 100%;
	margin: 0 auto;
	box-sizing: border-box;
	// 掘金的 main 用 margin-top: 20px 与 header 拉开间距
	padding-top: $content-top-gap;

	// 宽度不足以放下三栏时只保留中栏，窄屏下两侧仍留边距
	@media (max-width: $columns-collapse-threshold) {
		padding-left: var(--MI-margin);
		padding-right: var(--MI-margin);
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

	// 掘金在低于 1200px 时收起左右栏只留中栏
	@media (max-width: $columns-collapse-threshold) {
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

// 右栏: 掘金的 .sidebar
.sidebar {
	width: $sidebar-width;
	flex-shrink: 0;
	height: 100%;
	box-sizing: border-box;
	overflow-y: auto;
	overscroll-behavior: contain;
	// 保留滚动能力，仅隐藏滚动条
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}

	padding-bottom: calc(var(--MI-margin) + env(safe-area-inset-bottom, 0px));

	@media (max-width: $columns-collapse-threshold) {
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
