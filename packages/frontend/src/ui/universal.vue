<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { '_forceShrinkSpacer': deviceKind === 'smartphone' }]">
	<XTitlebar v-if="prefer.r.showTitlebar.value" style="flex-shrink: 0;" @contextmenu.stop="onContextmenu"/>

	<div v-if="isMobile" :class="$style.nonTitlebarArea">
		<div :class="[$style.contents, { [$style.withGlobalHeader]: hasMobileHeader, [$style.withMobileFooter]: showMobileFooter }]" @contextmenu.stop="onContextmenu">
			<XHeader v-if="hasMobileHeader" :class="$style.header" :dockHidden="true"/>
			<header v-else-if="mobileShellHeader" :class="$style.mobilePageHeader">
				<button type="button" class="_button" :class="$style.mobileBack" :aria-label="i18n.ts.goBack" @click="goBackMobile"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
				<Mfm :text="pageMetadata?.title ?? i18n.ts.details" :plain="true" :nowrap="true" :class="$style.mobilePageTitle"/>
			</header>
			<div>
				<XReloadSuggestion v-if="shouldSuggestReload"/>
				<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
				<XThemePreviewing v-if="isThemePreviewMode"/>
				<XAnnouncements v-if="$i"/>
				<XStatusBars v-if="$i" :class="$style.statusbars"/>
			</div>
			<RouterView :class="$style.content"/>
			<XMobileFooterMenu v-if="showMobileFooter" ref="navFooter" v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing" :openChat="openChatWindow" :chatOpen="chatWindowOpen" :showPost="!isChat && !pageEditor"/>
		</div>
	</div>

	<template v-else>
		<XHeader v-if="!pageEditor && !isAdminPage" ref="desktopHeader" :class="$style.header" :dockHidden="dockHidden" :chatOpen="chatWindowOpen" @openChat="openChatWindow" @contextmenu.stop="onContextmenu"/>

		<div :class="$style.notices" @contextmenu.stop="onContextmenu">
			<XReloadSuggestion v-if="shouldSuggestReload"/>
			<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
			<XThemePreviewing v-if="isThemePreviewMode"/>
			<XAnnouncements v-if="$i"/>
			<XStatusBars v-if="$i"/>
		</div>

		<div :class="[$style.body, { [$style.edgeToEdge]: pageEditor || isChat || isAdminPage }]" @contextmenu.stop="onContextmenu">
			<div :class="[$style.columns, { [$style.wide]: wide, [$style.singleColumn]: singleColumn, [$style.navigationLayout]: navigationLayout, [$style.admin]: isAdminPage, [$style.pageEditor]: pageEditor, [$style.detailPage]: detailPage, [$style.noteDetail]: noteDetail, [$style.chat]: isChat, [$style.featureNavigation]: featureNavigation, [$style.notificationNavigation]: isNotificationsPage }]">
				<XDock v-if="!wide && !singleColumn && !detailPage && !isChat && !featureNavigation" :class="$style.dock" :articleCategories="isRoot"/>

				<div ref="mainContent" :class="$style.stream">
					<div v-if="articleDetail && detailActionsLoading" :class="$style.detailActionsPlaceholder" aria-hidden="true">
						<span v-for="icon in detailActionIcons" :key="icon"><i :class="icon"></i></span>
					</div>
					<div v-if="articleDetail" :class="$style.detailAuthorPlaceholder" aria-hidden="true" inert>
						<MkUserCardMini v-if="cachedAuthor" :user="cachedAuthor.user" :cachePath="authorPath" :withChart="false" author preview/>
						<div v-else :class="$style.authorSkeleton">
							<div :class="$style.skeletonIdentity"><span></span><span></span></div>
							<div :class="$style.skeletonStats"><span v-for="index in 3" :key="index"></span></div>
						</div>
					</div>
					<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :class="$style.content"/>
					<RouterView v-else :class="$style.content"/>
				</div>

				<div v-if="!wide && !singleColumn && !isChat && !detailPage && !isNotificationsPage" :class="$style.sidebar">
					<div ref="pageSidebar" :class="$style.pageSidebar"></div>
					<XCheckinCard v-if="isRoot || isTimeline"/>
					<XWidgets/>
				</div>
			</div>
		</div>
	<XFloatingActions v-if="!isChat && !pageEditor && !isAdminPage && !hideFloatingActions" :content="mainContent"/>
	</template>
	<XChatWindow v-if="$i && !isMobile && chatWindowCreated" v-model:open="chatWindowOpen" v-model:minimized="chatWindowMinimized" :visible="!pageEditor" :top="chatWindowTop" :restoreKey="chatWindowRestoreKey" :path="chatWindowPath" @openFullPage="openChatPage"/>

	<div ref="pageOverlayHost" :class="$style.pageOverlayHost"></div>
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
import { ABUSE_REPORT_ICON } from '@/utility/abuse-report.js';
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
const MOBILE_THRESHOLD = 500;
// 脚本拿不到 SCSS 值：16/180/20 来自 styles/layout.scss，520 为下方 $stream-fit-min-2col，与 $dock-collapse-threshold 保持同步。
const DOCK_COLLAPSE_THRESHOLD = 16 * 2 + 180 + 20 + 520 - 1;
const isMobile = ref(deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD);
provide(DI.pageOverlayHost, useTemplateRef<HTMLElement>('pageOverlayHost'));
provide('chatMobileLayout', computed(() => isMobile.value));
provide('mobileLayout', computed(() => isMobile.value));
const dockCollapsed = ref(window.innerWidth <= DOCK_COLLAPSE_THRESHOLD);
const pageEditor = computed(() => ['/articles/new', '/articles/edit/:articleId', '/compose'].includes(mainRouter.currentRoute.value.path));
const hasMobileHeader = computed(() => !$i && showMobileFooter.value && mainRouter.currentRoute.value.name !== 'index' && !isAdminPage.value);
provide(DI.hasGlobalSearch, computed(() => isMobile.value ? hasMobileHeader.value : !pageEditor.value && !isAdminPage.value));
const chatWindowCreated = ref(false);
const chatWindowOpen = ref(false);
const chatWindowMinimized = ref(false);
const chatWindowRestoreKey = ref(0);
const chatWindowTop = ref(0);
const chatWindowPath = ref('/chat');
const chatPageReturnPath = ref<string | null>(null);
const chatPageReturnEntryId = ref<string | null>(null);
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
	if (isMobile.value) {
		openChatPage('/chat');
		return;
	}
	if (mainRouter.currentRoute.value.name === 'chat') {
		restoreChatWindow(false);
		return;
	}
	chatWindowPath.value = '/chat';
	chatWindowCreated.value = true;
	chatWindowOpen.value = !chatWindowOpen.value;
	if (chatWindowOpen.value) {
		chatWindowMinimized.value = false;
		chatWindowRestoreKey.value++;
	}
}

function showChatWindow(path: string, minimized = false) {
	chatWindowPath.value = path;
	chatWindowCreated.value = true;
	chatWindowOpen.value = true;
	chatWindowMinimized.value = minimized;
	chatWindowRestoreKey.value++;
}

const isChatPath = (fullPath: string) => fullPath === '/chat' || /^\/chat[/?#]/.test(fullPath);

function openChatPage(path: string) {
	const currentPath = mainRouter.currentRef.value._parsedRoute.fullPath;
	if (!isChatPath(currentPath)) {
		chatPageReturnPath.value = currentPath;
		chatPageReturnEntryId.value = mainRouter.navigationRef.value.entryId;
	}
	// 进入整页后卸载浮窗，避免浮窗和页面同时保留会话订阅与滚动状态。
	chatWindowCreated.value = false;
	chatWindowOpen.value = false;
	chatWindowMinimized.value = false;
	mainRouter.pushByPath(path, 'forcePage');
}

function restoreChatWindow(minimized: boolean) {
	if (isMobile.value) return;
	const currentPath = mainRouter.currentRef.value._parsedRoute.fullPath;
	const targetPath = isChatPath(currentPath) ? currentPath : chatWindowPath.value;
	showChatWindow(targetPath, minimized);
	if (!isChatPath(currentPath)) return;

	const returnEntryId = chatPageReturnEntryId.value;
	const storedReturnPath = chatPageReturnPath.value;
	chatPageReturnEntryId.value = null;
	chatPageReturnPath.value = null;
	const returnEntry = returnEntryId == null
		? null
		: mainRouter.historyRef.value.find(entry => entry.entryId === returnEntryId);
	if (returnEntry) {
		const returnIndex = mainRouter.historyRef.value.indexOf(returnEntry);
		const steps = mainRouter.historyIndexRef.value - returnIndex;
		if (steps > 0) {
			window.history.go(-steps);
			return;
		}
	}
	const returnPath = storedReturnPath && !isChatPath(storedReturnPath) ? storedReturnPath : '/timeline';
	mainRouter.pushByPath(returnPath);
}

provide('chatFullPageControls', {
	minimize: () => restoreChatWindow(true),
	restoreWindow: () => restoreChatWindow(false),
});

watch(isMobile, mobile => {
	if (!mobile || !chatWindowOpen.value) return;
	// 桌面浮窗切到手机布局时转为整页，不能留下不可恢复的隐藏窗口。
	openChatPage(chatWindowPath.value);
}, { flush: 'sync' });

// 桌面聊天入口打开浮窗；手机与直接访问聊天地址保留整页路由。
const previousNavHook = mainRouter.navHook;
const chatNavHook: NonNullable<typeof mainRouter.navHook> = (fullPath, flag) => {
	if (isMobile.value || flag === 'forcePage' || mainRouter.currentRoute.value.name === 'chat') return previousNavHook?.(fullPath, flag) ?? false;

	// 编辑页隐藏浮窗，交给正常跳转。
	if ($i != null && !pageEditor.value && isChatPath(fullPath)) {
		showChatWindow(fullPath);
		return true;
	}
	return previousNavHook?.(fullPath, flag) ?? false;
};
mainRouter.navHook = chatNavHook;
onUnmounted(() => { if (mainRouter.navHook === chatNavHook) mainRouter.navHook = previousNavHook; });

const isRoot = computed(() => mainRouter.currentRoute.value.name === 'index');
const isTimeline = computed(() => mainRouter.currentRoute.value.path === '/timeline');
const isChat = computed(() => mainRouter.currentRoute.value.name === 'chat');
const hideFloatingActions = computed(() => {
	const route = mainRouter.currentRoute.value;
	const path = route.path;

	return route.name === 'user'
		|| path === '/admin' || path.startsWith('/admin/')
		|| path === '/my' || path.startsWith('/my/')
		|| path === '/settings' || path.startsWith('/settings/');
});
const isAdminPage = computed(() => mainRouter.currentRoute.value.path === '/admin' && !mainRouter.currentRoute.value.notFound);
const notFound = computed(() => mainRouter.currentRoute.value.notFound === true);
watch(isChat, value => {
	if (!value) return;
	chatWindowCreated.value = false;
	chatWindowOpen.value = false;
	chatWindowMinimized.value = false;
}, { flush: 'sync' });
const isNotificationsPage = computed(() => /^\/my\/notifications(?:\/|$)/.test(mainRouter.currentRef.value._parsedRoute.fullPath.split(/[?#]/)[0]));
// 功能内菜单占用 dock 位置；通知页保持双列，时间线仍使用右侧小组件栏。
const featureNavigation = computed(() => isNotificationsPage.value || isTimeline.value);
const articleDetail = computed(() => mainRouter.currentRoute.value.name === 'article');
const noteDetail = computed(() => mainRouter.currentRoute.value.name === 'note');
// 按实际页面类型区分一级浏览与详情，不把分类和列表标签误当作二级页。
const mobilePageNavigation = computed(() => {
	const resolved = mainRouter.currentRef.value;
	const path = resolved.route.path;
	const childPath = resolved.child?.route.path;
	const param = (name: string) => encodeURIComponent(String(resolved.props.get(name) ?? ''));
	if (path === '/chat') {
		if (childPath?.startsWith('/messages/')) return { back: '/chat', shell: false };
		if (childPath && !['/', '/groups', '/search'].includes(childPath)) return { back: '/chat', shell: false };
		return null;
	}
	if (path === '/my') {
		if (childPath === '/drive' || childPath === '/drive/folder/:folder') return null;
		if (childPath === '/drive/file/:fileId') return { back: '/my/drive', shell: false };
		if (childPath && !['/', '/menu'].includes(childPath)) return { back: '/my/menu', shell: false };
	}
	if (path === '/settings' && childPath && childPath !== '/') return { back: '/settings', shell: false };
	if (resolved.route.name === 'article') return { back: '/', shell: false };
	if (resolved.route.name === 'note') return { back: '/timeline', shell: true };
	if (resolved.route.name === 'user') return { back: '/explore', shell: false };
	if (path === '/compose') return { back: '/timeline', shell: false };
	if (path === '/articles/new') return { back: '/', shell: false };
	if (path === '/articles/edit/:articleId') return { back: `/articles/${param('articleId')}`, shell: false };
	if (path === '/products/:productId') return { back: '/shop', shell: true };
	if (path === '/gallery/:postId') return { back: '/gallery', shell: true };
	if (['/gallery/:postId/edit', '/gallery/new'].includes(path)) return { back: '/gallery', shell: false };
	if (path === '/play/:id') return { back: '/play', shell: true };
	if (['/play/:id/edit', '/play/new'].includes(path)) return { back: '/play', shell: false };
	if (path === '/@:username/pages/:pageName(*)') return { back: '/pages', shell: true };
	if (['/pages/new', '/pages/edit/:initPageId'].includes(path)) return { back: '/pages', shell: false };
	if (path === '/channels/:channelId') return { back: '/channels', shell: true };
	if (['/channels/:channelId/edit', '/channels/:channelId/members'].includes(path)) return { back: `/channels/${param('channelId')}`, shell: false };
	if (path === '/channels/new') return { back: '/channels', shell: false };
	if (['/@:acct/following', '/@:acct/followers'].includes(path)) return { back: `/@${param('acct')}`, shell: false };
	if (['/clips/:clipId', '/list/:listId'].includes(path)) return { back: '/', shell: false };
	if (path === '/announcements/:announcementId') return { back: $i ? '/my/notifications/announcements' : '/announcements', shell: false };
	if (path === '/instance-info/:host') return { back: '/about', shell: false };
	if (path === '/reversi/g/:gameId') return { back: '/reversi', shell: true };
	return null;
});
const mobileShellHeader = computed(() => mobilePageNavigation.value?.shell === true);
const showMobileFooter = computed(() => mobilePageNavigation.value == null && !isAdminPage.value);
provide('mobilePageBackPath', computed(() => mobilePageNavigation.value?.back ?? null));
provide('mobileShellHeader', computed(() => mobileShellHeader.value));
watch([isMobile, showMobileFooter], ([mobile, footer]) => {
	// 底栏卸载后其内部 watch 已停止，由外壳统一清理预留高度。
	window.document.body.style.setProperty('--MI-minBottomSpacing', mobile && footer ? 'var(--MI-minBottomSpacingMobile)' : '0px');
}, { immediate: true, flush: 'sync' });

function goBackMobile() {
	if (mainRouter.canGoBack.value) mainRouter.back();
	else mainRouter.pushByPath(mobilePageNavigation.value?.back ?? '/');
}

// 文章和帖子详情共用“正文 + 右栏”外壳，作者卡和操作占位只属于文章。
const detailPage = computed(() => articleDetail.value || noteDetail.value);
const authorPath = computed(() => mainRouter.currentRef.value._parsedRoute.fullPath.split(/[?#]/)[0].split('/').slice(0, 3).join('/'));
const cachedAuthor = computed(() => readAuthorCard(authorPath.value));
const detailActionsLoading = ref(true);
provide(DI.detailActionsLoading, detailActionsLoading);
watch(authorPath, () => { detailActionsLoading.value = true; }, { flush: 'sync' });
// 与文章页左侧操作栏一一对应；举报项的显示条件和举报按钮相同，加载完成时不会多出或少一个。
const detailActionIcons = computed(() => [
	'ti ti-heart', 'ti ti-message-circle', 'ti ti-star', 'ti ti-share', 'ti ti-refresh',
	...($i != null && cachedAuthor.value?.user.id !== $i.id ? [ABUSE_REPORT_ICON] : []),
]);
// 全屏编辑页自己提供标题和操作，不叠加全局导航与浮窗。
watch(pageEditor, value => { if (value) chatWindowOpen.value = false; });
// 返回时堆叠的页面仍保持挂载，所以布局要跟随当前激活的路由
const singleColumn = computed(() => notFound.value || pageEditor.value || mainRouter.currentRoute.value.path.startsWith('/products') || /^\/(?:play|gallery|pages|channels|explore)(?:\/|$)/.test(mainRouter.currentRoute.value.path) || [
	'/ads',
	'/contact',
	'/search',
	'/shop',
	'/@:acct', '/@:acct/following', '/@:acct/followers',
	'/@:username/pages/:pageName(*)',
	'/community-ranking', '/games',
	'/tags/:tag',
	// 游戏本身占满正文，不需要左侧菜单和右侧小组件
	'/bubble-game', '/reversi', '/reversi/g/:gameId', '/clicker',
].includes(mainRouter.currentRoute.value.path) || /^\/(?:about|about-misskey|api-console|scratchpad|custom-emojis-manager|avatar-decorations|invite)(?:\/|$)/.test(mainRouter.currentRoute.value.path));

// 刷新时按路由确定最终宽度，不等待异步页面和用户资料。
const navigationLayout = computed(() => [
	'/settings', '/admin', '/my', '/@:acct', '/pages', '/gallery', '/explore',
	'/channels', '/channels/:channelId', '/play', '/play/:id',
	'/gallery/:postId', '/@:username/pages/:pageName(*)', '/tags/:tag',
].includes(mainRouter.currentRoute.value.path));

function onResize() {
	isMobile.value = deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD;
	dockCollapsed.value = window.innerWidth <= DOCK_COLLAPSE_THRESHOLD;
}

onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => window.removeEventListener('resize', onResize));

const pageMetadata = ref<null | PageMetadata>(null);
// 在异步页面元数据到达之前，先确定导航页的布局外壳
const wide = computed(() => !singleColumn.value && !detailPage.value && !isChat.value && !featureNavigation.value && (
	['/settings', '/admin', '/my', '/feedback'].includes(mainRouter.currentRoute.value.path) || pageMetadata.value?.needWideArea === true
));
const dockHidden = computed(() => singleColumn.value || detailPage.value || isChat.value || featureNavigation.value || wide.value || dockCollapsed.value);
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
	if (isMobile.value) return;
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
@use '@/styles/layout.scss';

// 列宽来自 styles/layout.scss；媒体查询不能用 CSS 变量，断点直接用 SCSS 值计算
$column-gap: layout.$columnGap;
$dock-width: layout.$dockWidth;
$sidebar-width: layout.$sidebarWidth;
$body-side-margin: layout.$bodySideMargin;

// 中カラムの名目幅。両サイドを畳んだ後も中カラムを無限に広げないための上限として使う
$stream-width: layout.$streamWidth;
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

.pageOverlayHost {
	position: absolute;
	inset: 0;
	z-index: 20;
	pointer-events: none;
}

.notices {
	flex-shrink: 0;
	background: var(--MI_THEME-bg);
}

.body {
	position: relative;
	flex: 1;
	min-height: 0;
	padding-inline: $body-side-margin;
	box-sizing: border-box;
	background: var(--MI_THEME-bg);

	&.edgeToEdge {
		padding-inline: 0;
	}
}

.columns {
	--MI-articleCategorySelectorDisplay: none;
	// 顶部间距由外层统一承担，页面壳不再重复添加。
	--MI-pageTopInset: 0px;
	// 屏幕边距只由 body 提供，列和页面壳不再叠加。
	--MI-pageSideInset: 0px;
	display: flex;
	gap: $column-gap;
	// 主体按三栏宽度居中
	width: 100%;
	max-width: var(--MI-threeColumnWidth);
	height: 100%;
	margin: 0 auto;
	box-sizing: border-box;
	// 页面距 header 的间距由各列滚动区作为顶部内边距承担：静止时位置不变，滚动内容可以一直到达 header。
	--MI-pageScrollInset: var(--MI-pageGap);

	@media (max-width: $dock-collapse-threshold) {
		--MI-articleCategorySelectorDisplay: block;
	}

	// 右カラムを畳んだ後は残る 2 カラムの自然幅で中央寄せし直す。
	// ここを三栏宽度のままにすると中カラムだけが伸びて間延びする。
	// 左カラムを畳んだ後 (= $dock-collapse-threshold 以下) は viewport 自体が
	// 中カラムより狭いので、追加の上限は不要 (width: 100% が実効上限になる)
	@media (max-width: $sidebar-collapse-threshold) {
		max-width: $dock-width + $column-gap + $stream-width;
	}

	&.chat {
		--MI-pageScrollInset: 0px;
		// 聊天是持续工作的应用界面，铺满视口，避免外层卡片边界与圆角。
		max-width: none;
		padding-inline: 0;
		gap: 0;
		border-top: var(--MI-divider);
	}

	&.admin {
		--MI-pageScrollInset: 0px;
	}

	// 控制台等宽版页面不保留首页的列间距。
	&.wide {
		max-width: none;
		gap: 0;
	}

	// 反馈等普通宽版页面没有双列外壳，在此限定宽度。
	&.wide:not(.navigationLayout) {
		max-width: var(--MI-pageWidth);
	}

	&.singleColumn {
		max-width: var(--MI-pageWidth);
	}

	&.navigationLayout {
		--MI-pageWidth: var(--MI-navigationPageWidth);
		max-width: var(--MI-pageWidth);
	}

	&.wide.navigationLayout {
		max-width: none;
	}

	&.pageEditor {
		--MI-pageScrollInset: 0px;
		max-width: none;
	}

	// 详情页“正文 + 右栏”的列宽变量，文章和帖子详情各自引用，右栏内容由页面决定。
	&.detailPage {
		--MI-detailColumns: minmax(0, 1fr) #{$sidebar-width};
		--MI-detailColumnGap: #{$column-gap};
		--MI-detailSidebarDisplay: flex;

		@media (max-width: $sidebar-collapse-threshold) {
			--MI-detailColumns: minmax(0, 1fr);
			--MI-detailSidebarDisplay: none;
		}
	}

	// 帖子详情是双列页，总宽取全局双列宽度；文章详情保持三栏宽度。
	&.noteDetail {
		--MI-pageWidth: var(--MI-navigationPageWidth);
		max-width: var(--MI-pageWidth);
	}

	&.featureNavigation {
		--MI-pageNavigationWidth: #{$dock-width};

		// 菜单与正文的间距取三栏列间距，正文才能和首页中栏对齐，切换时不横向跳动
		:global(._pageLayoutWithSidebar) {
			column-gap: $column-gap;
		}
	}

	&.notificationNavigation {
		max-width: layout.$navigationPageWidth;
	}
}

// 左右两栏自身就是滚动区，间距放在内边距里。
.columns > .dock,
.columns > .sidebar {
	padding-top: var(--MI-pageScrollInset);
	scroll-padding-top: var(--MI-pageScrollInset);
}

// 左栏固定宽度
.dock {
	width: $dock-width;
	flex-shrink: 0;
	height: 100%;
	box-sizing: border-box;

	// 左カラムは最後まで残す (2 段目でようやく畳む)
	@media (max-width: $dock-collapse-threshold) {
		display: none;
	}
}

.wide .dock {
	display: none;
}

// 中栏名义宽度见 layout.$streamWidth，窄于三栏宽度时不出现横向滚动，改用 flex 伸缩
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
	top: calc(var(--MI-pageScrollInset) + 48px);
	left: 8px;
	flex-direction: column;
	gap: 20px;
	pointer-events: none;
	> span { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--MI_THEME-panel); color: var(--MI_THEME-fgTransparentWeak); font-size: 20px; line-height: 1; }
}
@container (min-width: 700px) { .detailActionsPlaceholder { display: flex; } }
.stream:has([data-detail-actions="true"]) > .detailActionsPlaceholder { display: none; }

.detailAuthorPlaceholder {
	position: absolute;
	z-index: 1;
	top: var(--MI-pageScrollInset);
	inset-inline-end: 0;
	width: $sidebar-width;
	pointer-events: none;

	@media (max-width: $sidebar-collapse-threshold) { display: none; }
}
.stream:has([data-article-sidebar="true"]) > .detailAuthorPlaceholder { display: none; }

.content {
	height: 100%;
}

// 普通页面和宽版页面的顶部操作栏共用卡片样式。
.columns > .stream > .content {
	--MI-pageHeaderBg: var(--MI_THEME-panel);
	--MI-pageHeaderRadius: var(--MI-cardRadius);
	--MI-pageHeaderBorder: none;
	--MI-pageHeaderOverflow: clip;
	margin-top: var(--MI-pageScrollInset);
	height: calc(100% - var(--MI-pageScrollInset));

	// 路由根自身滚动时，间距改成内边距。页面根交给 --MI-pageScrollReach 决定是否继续伸到 header 下。
	&:global(._pageContainer) {
		--MI-pageScrollReach: var(--MI-pageScrollInset);
		margin-top: 0;
		height: 100%;
		box-sizing: border-box;
		padding-top: var(--MI-pageScrollInset);
		scroll-padding-top: var(--MI-pageScrollInset);

		// 跳过 display: contents 路由包装层，只限制页面根内部的嵌套内容。
		> [data-route-active] > * > * { --MI-pageScrollReach: 0px; }
	}
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

// 异步文章组件挂载前先显示公开作者缓存，页面内的同宽卡片接管后隐藏。
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
	--MI-pageHeaderHeight: var(--MI-mobileHeaderHeight);
	--MI-pageHeaderThinHeight: var(--MI-mobileHeaderHeight);
	--MI-pageTabHeight: var(--MI-mobileTabHeight);
	--MI-tabHeight: var(--MI-mobileTabHeight);
	--MI-headerActionSize: var(--MI-mobileTouchTarget);
	--MI-navigationBarHeight: var(--MI-mobileHeaderHeight);
	--MI-chatHeaderHeight: var(--MI-mobileHeaderHeight);
	--MI-chatHeaderActionSize: var(--MI-mobileTouchTarget);
	--MI-chatPlainActionSize: var(--MI-mobileTouchTarget);
	--MI-globalHeaderHeight: var(--MI-mobileHeaderHeight);
	--MI-globalHeaderControlHeight: var(--MI-mobileTouchTarget);
	--MI-pageHeaderBg: var(--MI_THEME-panel);
	--MI-pageHeaderBgOpacity: 1;
	--MI-pageHeaderRadius: 0px;
	--MI-pageHeaderGap: 0px;
	--MI-pageTopInset: 0px;
	--MI-pageSideInset: 0px;
	--MI-pageBottomInset: 0px;
	--MI-pageScrollbarGutter: auto;
	position: relative;
	display: flex;
	flex-direction: column;
	flex: 1;
	height: 100%;
	min-width: 0;
	min-height: 0;
	padding-top: env(safe-area-inset-top, 0px);
	box-sizing: border-box;

	> .content {
		// 页面填满移动端导航之外的剩余高度，聊天输入框随页面一起保留。
		flex: 1;
		min-height: 0;
		height: 0;
		scrollbar-width: none;
	}

	&.withGlobalHeader {
		background: var(--MI_THEME-bg);
	}

	> :not(.content) {
		flex-shrink: 0;
	}
}

.withMobileFooter :global(._pageScrollable),
.withMobileFooter :global(._pageNavigationFill) {
	// 底栏浮在内容上，留白放在滚动末尾，不缩短页面或留下固定灰带。
	padding-bottom: var(--MI-minBottomSpacingMobile);
	box-sizing: border-box;
	scroll-padding-bottom: var(--MI-minBottomSpacingMobile);
}

.mobilePageHeader {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	min-height: var(--MI-navigationBarHeight);
	box-sizing: border-box;
	padding: 0 max(8px, env(safe-area-inset-right, 0px)) 0 max(8px, env(safe-area-inset-left, 0px));
	border-bottom: var(--MI-divider);
	background: var(--MI_THEME-panel);
}

.mobileBack {
	display: grid;
	flex: 0 0 var(--MI-mobileTouchTarget);
	place-items: center;
	width: var(--MI-mobileTouchTarget);
	height: var(--MI-mobileTouchTarget);
	border-radius: 8px;
	font-size: 18px;
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.mobilePageTitle {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 600;
}

.statusbars {
	position: sticky;
	top: 0;
	left: 0;
}
</style>
