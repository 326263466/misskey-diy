<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { '_forceShrinkSpacer': deviceKind === 'smartphone' }]">
	<XTitlebar v-if="prefer.r.showTitlebar.value" style="flex-shrink: 0;" @contextmenu.stop="onContextmenu"/>

	<div v-if="isMobile" :class="$style.nonTitlebarArea">
		<div :class="$style.contents" @contextmenu.stop="onContextmenu">
			<XHeader v-if="!$i && !articleEditor" :class="$style.header" :dockHidden="true"/>
			<div>
				<XReloadSuggestion v-if="shouldSuggestReload"/>
				<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
				<XThemePreviewing v-if="isThemePreviewMode"/>
				<XAnnouncements v-if="$i"/>
				<XStatusBars v-if="$i" :class="$style.statusbars"/>
			</div>
			<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :class="$style.content"/>
			<RouterView v-else :class="$style.content"/>
			<XMobileFooterMenu v-if="!isChatConversation" ref="navFooter" v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing" :openChat="openChatWindow"/>
		</div>
	</div>

	<template v-else>
		<XHeader v-if="!articleEditor" ref="desktopHeader" :class="$style.header" :dockHidden="dockHidden" @contextmenu.stop="onContextmenu"/>

		<div :class="$style.notices" @contextmenu.stop="onContextmenu">
			<XReloadSuggestion v-if="shouldSuggestReload"/>
			<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
			<XThemePreviewing v-if="isThemePreviewMode"/>
			<XAnnouncements v-if="$i"/>
			<XStatusBars v-if="$i"/>
		</div>

		<div :class="$style.body" @contextmenu.stop="onContextmenu">
			<div :class="[$style.columns, { [$style.wide]: wide, [$style.singleColumn]: singleColumn, [$style.navigationLayout]: navigationLayout, [$style.articleEditor]: articleEditor, [$style.chat]: isChat, [$style.channelDetail]: channelDetail, [$style.featureNavigation]: featureNavigation }]">
				<XDock v-if="!singleColumn && !noteDetail && !channelDetail && !isChat && !featureNavigation" :class="$style.dock" :articleCategories="isRoot"/>

				<div ref="mainContent" :class="$style.stream">
					<div v-if="noteDetail && detailActionsLoading" :class="[$style.detailActionsPlaceholder, { [$style.noteActionsPlaceholder]: mainRouter.currentRoute.value.name === 'note' }]" aria-hidden="true">
						<span v-for="icon in detailActionIcons" :key="icon"><i :class="`ti ti-${icon}`"></i></span>
					</div>
					<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :class="$style.content"/>
					<RouterView v-else :class="$style.content"/>
				</div>

				<div v-if="!wide && !singleColumn && !isChat" :class="$style.sidebar">
					<div ref="pageSidebar" :class="[$style.pageSidebar, { [$style.authorSidebar]: noteDetail }]">
						<div v-if="noteDetail" :class="$style.authorPlaceholder">
							<MkUserCardMini v-if="cachedAuthor" :user="cachedAuthor.user" :cachePath="authorPath" :withChart="false" author preview/>
							<div v-else :class="$style.authorSkeleton" aria-busy="true">
								<div :class="$style.skeletonIdentity" aria-hidden="true"><span></span><span></span></div>
								<div :class="$style.skeletonStats" aria-hidden="true"><span v-for="index in 3" :key="index"></span></div>
							</div>
						</div>
					</div>
					<XCheckinCard v-if="isRoot"/>
					<XWidgets v-if="!noteDetail"/>
				</div>
			</div>
		</div>
	<XFloatingActions v-if="!isChat && !articleEditor" :content="mainContent" :chatOpen="chatWindowOpen" @openChat="openChatWindow"/>
	</template>
	<XChatWindow v-if="$i && chatWindowCreated" v-model:open="chatWindowOpen" :visible="!articleEditor" :top="chatWindowTop" :restoreKey="chatWindowRestoreKey" :path="chatWindowPath" :maximize="chatWindowMaximize"/>

	<XCommon v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing"/>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, provide, computed, ref, onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { instanceName } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import XCommon from './_common_/common.vue';
import XWidgets from './_common_/widgets.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { readAuthorCard } from '@/utility/author-card-cache.js';
import type { PageMetadata } from '@/page.js';
import XMobileFooterMenu from '@/ui/_common_/mobile-footer-menu.vue';
import XPreferenceRestore from '@/ui/_common_/PreferenceRestore.vue';
import XReloadSuggestion from '@/ui/_common_/ReloadSuggestion.vue';
import XThemePreviewing from '@/ui/_common_/ThemePreviewing.vue';
import XTitlebar from '@/ui/_common_/titlebar.vue';
import XHeader from '@/ui/_common_/header.vue';
import XDock from '@/ui/_common_/dock.vue';
import XCheckinCard from '@/ui/_common_/checkin-card.vue';
import XFloatingActions from '@/ui/_common_/floating-actions.vue';
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
const XChatWindow = defineAsyncComponent(() => import('@/ui/_common_/chat-window.vue'));
const chatWindowCreated = ref(false);
const chatWindowOpen = ref(false);
const chatWindowRestoreKey = ref(0);
const chatWindowTop = ref(0);
const chatWindowPath = ref('/chat');
const chatWindowMaximize = ref(false);
const desktopHeader = useTemplateRef<InstanceType<typeof XHeader>>('desktopHeader');
watch(desktopHeader, (header, _previous, onCleanup) => {
	const element = header?.$el as HTMLElement | undefined;
	if (!element) { chatWindowTop.value = 0; return; }
	const updateTop = () => { chatWindowTop.value = element.getBoundingClientRect().bottom; };
	const observer = new ResizeObserver(updateTop);
	observer.observe(element);
	updateTop();
	onCleanup(() => observer.disconnect());
}, { flush: 'post' });

function openChatWindow() {
	chatWindowPath.value = '/chat';
	chatWindowMaximize.value = false;
	chatWindowCreated.value = true;
	chatWindowOpen.value = !chatWindowOpen.value;
	if (chatWindowOpen.value) chatWindowRestoreKey.value++;
}

function showChatWindow(path: string, maximize: boolean) {
	chatWindowPath.value = path;
	chatWindowMaximize.value = maximize;
	chatWindowCreated.value = true;
	chatWindowOpen.value = true;
	chatWindowRestoreKey.value++;
}

const isChatPath = (fullPath: string) => fullPath === '/chat' || /^\/chat[/?#]/.test(fullPath);

// 私信等入口统一打开聊天浮窗，不再切换到整页聊天。
const previousNavHook = mainRouter.navHook;
const chatNavHook: NonNullable<typeof mainRouter.navHook> = (fullPath, flag) => {
	// 文章编辑页会隐藏浮窗，交给正常跳转，离开编辑页后再转为浮窗。
	if ($i != null && !articleEditor.value && isChatPath(fullPath)) {
		showChatWindow(fullPath, false);
		return true;
	}
	return previousNavHook?.(fullPath, flag) ?? false;
};
mainRouter.navHook = chatNavHook;
onUnmounted(() => { if (mainRouter.navHook === chatNavHook) mainRouter.navHook = previousNavHook; });

const isRoot = computed(() => mainRouter.currentRoute.value.name === 'index');
const isChat = computed(() => mainRouter.currentRoute.value.name === 'chat');
// 功能内菜单页仍是三栏：页面左侧菜单占用 dock 位置，右侧保留小组件栏
const featureNavigation = computed(() => [
	'/my/notifications', '/timeline', '/explore', '/channels',
].includes(mainRouter.currentRoute.value.path));
// 直接访问或后退到聊天地址时，改为最大化浮窗，保持与浮窗一致的窗口控制和布局。
watch(isChat, value => {
	if (!value || $i == null) return;
	showChatWindow(mainRouter.getCurrentFullPath(), true);
	mainRouter.replace('/');
}, { immediate: true });
const isChatConversation = computed(() => /^\/chat\/(room|user)\//.test(mainRouter.currentRef.value._parsedRoute.fullPath));
const channelDetail = computed(() => ['/channels/:channelId', '/channels/:channelId/members'].includes(mainRouter.currentRoute.value.path));
const noteDetail = computed(() => ['note', 'article'].includes(mainRouter.currentRoute.value.name ?? ''));
const authorPath = computed(() => mainRouter.currentRef.value._parsedRoute.fullPath.split(/[?#]/)[0].split('/').slice(0, 3).join('/'));
const cachedAuthor = computed(() => readAuthorCard(authorPath.value));
const detailActionsLoading = ref(true);
provide(DI.detailActionsLoading, detailActionsLoading);
watch(authorPath, () => { detailActionsLoading.value = true; }, { flush: 'sync' });
const detailActionIcons = computed(() => mainRouter.currentRoute.value.name === 'article'
	? ['heart', 'message-circle', 'star', 'share', 'refresh']
	: ['heart', 'message-circle', 'repeat', 'mood-happy', 'star', 'share']);
// 文章编辑页统一渲染品牌、标题和操作，不再同时创建全局顶栏。
const articleEditor = computed(() => ['/articles/new', '/articles/edit/:articleId'].includes(mainRouter.currentRoute.value.path));
watch(articleEditor, value => { if (value) chatWindowOpen.value = false; });
// 返回时堆叠的页面仍保持挂载，所以布局要跟随当前激活的路由
const singleColumn = computed(() => articleEditor.value || mainRouter.currentRoute.value.path.startsWith('/products') || mainRouter.currentRoute.value.path.startsWith('/orders') || [
	'/shop',
	'/@:acct', '/@:acct/following', '/@:acct/followers',
	'/checkin', '/community-ranking', '/my/achievements',
].includes(mainRouter.currentRoute.value.path));

// 刷新时按路由确定最终宽度，不等待异步页面和用户资料。
const navigationLayout = computed(() => [
	'/settings', '/admin', '/wallet', '/@:acct',
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
const wide = computed(() => !singleColumn.value && !noteDetail.value && !channelDetail.value && !isChat.value && !featureNavigation.value && (
	['/settings', '/admin', '/wallet', '/feedback'].includes(mainRouter.currentRoute.value.path) || pageMetadata.value?.needWideArea === true
));
const dockHidden = computed(() => singleColumn.value || noteDetail.value || channelDetail.value || isChat.value || featureNavigation.value || wide.value || dockCollapsed.value);
provide('chatNavigationInDock', computed(() => !isMobile.value && !dockCollapsed.value));
const widgetsShowing = ref(false);
const mainContent = useTemplateRef('mainContent');
const pageSidebar = useTemplateRef('pageSidebar');
const sidebarVisible = ref(false);
provide(DI.pageSidebar, computed(() => sidebarVisible.value ? pageSidebar.value : null));
watch(pageSidebar, (element, _previous, onCleanup) => {
	sidebarVisible.value = false;
	const container = element?.parentElement;
	if (!container) return;
	const updateVisibility = () => { sidebarVisible.value = container.getBoundingClientRect().width > 0; };
	const observer = new ResizeObserver(updateVisibility);
	observer.observe(container);
	updateVisibility();
	onCleanup(() => observer.disconnect());
}, { flush: 'post' });

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
// 修改此断点的组成值时，也要同步上方 DOCK_COLLAPSE_THRESHOLD，保证“更多”能补回隐藏入口；
// 同时同步 use-page-navigation-narrow.ts 的 NARROW_THRESHOLD，功能内菜单与 dock 同时折叠。
$dock-collapse-threshold: $body-side-margin * 2 + $dock-width + $column-gap + $stream-fit-min-2col - 1px;
$chat-sidebar-collapse-threshold: $body-side-margin * 2 + 240px + $column-gap + $stream-fit-min-2col + $sidebar-width - 1px;

.root {
	position: relative;
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
	position: relative;
	flex: 1;
	min-height: 0;
	background: var(--MI_THEME-bg);
}

.columns {
	--MI-articleCategorySelectorDisplay: none;
	display: flex;
	gap: $column-gap;
	// 主体为 1200px 固定宽度居中
	width: 100%;
	max-width: $content-width + $body-side-margin * 2;
	height: 100%;
	margin: 0 auto;
	box-sizing: border-box;
	// 页面距 header 的间距统一使用全局值。
	// 左右余白は常時付ける (幅は内容 1200px を保つため max-width に padding 分を足す)
	padding: var(--MI-pageGap) $body-side-margin 0;

	@media (max-width: $dock-collapse-threshold) {
		--MI-articleCategorySelectorDisplay: block;
	}

	// 右カラムを畳んだ後は残る 2 カラムの自然幅で中央寄せし直す。
	// ここを 1200px のままにすると中カラムだけが 1000px 近くまで伸びて間延びする。
	// 左カラムを畳んだ後 (= $dock-collapse-threshold 以下) は viewport 自体が
	// 中カラムより狭いので、追加の上限は不要 (width: 100% が実効上限になる)
	@media (max-width: $sidebar-collapse-threshold) {
		max-width: $dock-width + $column-gap + $stream-width + $body-side-margin * 2;
	}

	&.chat {
		max-width: none;
		padding: 0;
		gap: 0;
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

	&.articleEditor {
		max-width: none;
		padding: 0;
	}

		&.channelDetail {
			max-width: calc(var(--MI-navigationPageWidth) + #{$body-side-margin * 2});

			> .sidebar {
				display: block;
			}

			@media (max-width: $body-side-margin * 2 + $stream-fit-min-2col + $column-gap + $sidebar-width - 1px) {
				max-width: $stream-width + $body-side-margin * 2;

				> .sidebar {
					display: none;
				}
			}
		}

		&.featureNavigation {
		--MI-pageSideInset: 0px;
		--MI-pageNavigationWidth: #{$dock-width};
		padding-top: 0;

		// 菜单与正文的间距取三栏列间距，正文才能和首页中栏对齐，切换时不横向跳动
		:global(._pageLayoutWithSidebar) {
			column-gap: $column-gap;
		}

		> .sidebar {
			padding-top: var(--MI-pageGap);
		}
	}
}

// 左栏固定宽度
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

// 中栏名义宽度 720px，为了在 1200px 以下不出现横向滚动，改用 flex 伸缩
.stream {
	position: relative;
	container-type: inline-size;
	flex: 1;
	min-width: 0;
	height: 100%;
}

.detailActionsPlaceholder {
	display: none;
	position: absolute;
	z-index: 1;
	top: 48px;
	left: 8px;
	flex-direction: column;
	gap: 20px;
	pointer-events: none;
	> span { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--MI_THEME-panel); color: var(--MI_THEME-fgTransparentWeak); font-size: 20px; line-height: 1; }
}
.noteActionsPlaceholder { gap: 12px; }
@container (min-width: 700px) { .detailActionsPlaceholder { display: flex; } }
.stream:has([data-detail-actions="true"]) > .detailActionsPlaceholder { display: none; }
@media (max-height: 600px) { .noteActionsPlaceholder { top: 12px; gap: 8px; } }

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

.pageSidebar:not(:empty) {
	margin-bottom: var(--MI-margin);
}

// 首屏显示上次的公开作者信息；首次访问显示骨架，真实卡片到达后原位替换。
.authorSidebar {
	margin-bottom: var(--MI-margin);
}

.authorPlaceholder:not(:only-child) { display: none; }
.authorSkeleton { height: 196px; overflow: clip; border-radius: var(--MI-cardRadius); background: var(--MI_THEME-panel); }
.skeletonIdentity {
	display: flex; align-items: center; gap: 12px; height: 116px; padding: 0 20px; background: var(--MI-userBannerBg);
	> span { width: 52px; height: 52px; border-radius: 50%; background: var(--MI_THEME-panel); opacity: .35; }
	> span + span { width: 100px; height: 16px; border-radius: var(--MI-cardRadius); }
}
.skeletonStats { display: flex; justify-content: space-around; align-items: center; height: 80px; }
.skeletonStats > span { width: 36px; height: 32px; border-radius: var(--MI-cardRadius); background: var(--MI_THEME-panelHighlight); }

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
.chat .sidebar {
	display: block;

	@media (max-width: $chat-sidebar-collapse-threshold) {
		display: none;
	}
}

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
	min-height: 0;

	> .content {
		// 页面填满移动端导航之外的剩余高度，聊天输入框随页面一起保留。
		flex: 1;
		min-height: 0;
		height: 0;
	}

	> :not(.content) {
		flex-shrink: 0;
	}
}

.statusbars {
	position: sticky;
	top: 0;
	left: 0;
}
</style>
