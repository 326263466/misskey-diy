<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.inner">
		<button class="_button" :class="$style.logo" :aria-label="instance.name ?? i18n.ts.instance" @click="goHome" @contextmenu.prevent.stop>
			<img :src="instance.iconUrl || '/favicon.ico'" width="24" height="24" alt="" :class="$style.logoIcon"/>
			<span :class="$style.logoText">{{ instance.name ?? i18n.ts.instance }}</span>
		</button>

		<nav :class="$style.nav" :aria-label="i18n.ts.navbar">
			<MkA class="_tabUnderline" :class="[$style.navItem, { _tabUnderlineAnimated: prefer.s.animation }]" :activeClass="$style.navItemActive" to="/" exact>
				<span>{{ i18n.ts.home }}</span>
			</MkA>
			<MkA class="_tabUnderline" :class="[$style.navItem, { _tabUnderlineAnimated: prefer.s.animation }]" :activeClass="$style.navItemActive" to="/timeline">
				<span>{{ i18n.ts.timeline }}</span>
			</MkA>
			<template v-for="item in navItems" :key="item">
				<MkA
					v-if="navbarItemDef[item] != null && navbarItemDef[item].to != null && unref(navbarItemDef[item].show) !== false"
					class="_tabUnderline"
					:class="[$style.navItem, { _tabUnderlineAnimated: prefer.s.animation }]"
					:activeClass="$style.navItemActive"
					:to="navbarItemDef[item].to"
				>
					<span>{{ navbarItemDef[item].title }}</span>
					<span v-if="navbarItemDef[item].indicated" :class="$style.navItemIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
				</MkA>
			</template>
			<button type="button" class="_button" :class="[$style.navItem, $style.navMore]" :aria-label="i18n.ts.more" aria-haspopup="dialog" @click="more">
				<span>{{ i18n.ts.more }}</span>
				<i class="ti ti-chevron-down" :class="[$style.navMoreCaret, { [$style.postCaretOpen]: moreMenuShowing }]" aria-hidden="true"></i>
				<span v-if="otherNavItemIndicated" :class="$style.navItemIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
			</button>
		</nav>

		<div :class="$style.right">
			<div ref="searchRoot" :class="$style.searchRoot" @focusout="onSearchFocusOut" @keydown="onSearchKeydown">
				<button ref="compactSearchButton" v-tooltip="i18n.ts.search" type="button" class="_button _iconButton" :class="$style.compactSearch" :aria-label="i18n.ts.search" :aria-controls="searchId" :aria-expanded="searchExpanded" @click="toggleSearch">
					<i class="ti ti-search" aria-hidden="true"></i>
				</button>
				<form :id="searchId" :class="[$style.search, { [$style.searchExpanded]: searchExpanded }]" role="search" @submit.prevent="search">
					<button v-tooltip="i18n.ts.search" type="submit" class="_button _iconButton" :class="$style.searchIcon" :aria-label="i18n.ts.search" :disabled="searchQuery.trim() === ''" @mousedown.prevent>
						<i class="ti ti-search" aria-hidden="true"></i>
					</button>
					<input
						ref="searchInput"
						v-model="searchQuery"
						:class="$style.searchText"
						type="search"
						enterkeyhint="search"
						:placeholder="i18n.ts._search.placeholder"
						:aria-label="i18n.ts.search"
						aria-keyshortcuts="Control+k Meta+k"
						@keydown.enter="onSearchEnter"
					>
					<kbd :class="$style.searchShortcut" aria-hidden="true">⌘ K</kbd>
				</form>
			</div>

			<MkA v-if="$i != null" v-tooltip="i18n.ts.notifications" class="_button" :class="$style.iconButton" :activeClass="$style.iconButtonActive" :aria-label="i18n.ts.notifications" to="/my/notifications">
				<span :class="$style.notificationIcon">
					<i class="ti ti-bell"></i>
				<span v-if="$i.hasUnreadNotification" :class="$style.notificationIndicator">
					<span class="_indicateCounter" :class="$style.iconButtonCounter">{{ $i.unreadNotificationsCount > 99 ? '99+' : $i.unreadNotificationsCount }}</span>
				</span>
				<span v-else-if="$i.hasUnreadAnnouncement" class="_indicatorCircle" :class="$style.notificationDot" role="img" :aria-label="i18n.ts.youHaveUnreadAnnouncements"></span>
			</span>
			</MkA>

			<MkA v-if="$i != null && ($i.isAdmin || $i.isModerator)" v-tooltip="i18n.ts.controlPanel" class="_button" :class="$style.iconButton" :activeClass="$style.iconButtonActive" :aria-label="i18n.ts.controlPanel" to="/admin">
				<i class="ti ti-adjustments"></i>
			</MkA>

			<button
				v-if="$i"
				type="button"
				:class="$style.post"
				class="_button _buttonGradate"
				data-testid="open-publish-menu"
				:aria-label="i18n.ts._postForm.creatorCenter"
				aria-haspopup="menu"
				:aria-expanded="publishMenuShowing"
				@click="openPublishMenu"
			>
				<i v-tooltip="i18n.ts._postForm.creatorCenter" class="ti ti-plus" :class="$style.postIcon"></i>
				<span :class="$style.postText">{{ i18n.ts._postForm.creatorCenter }}</span>
				<i class="ti ti-chevron-down" :class="[$style.postCaret, { [$style.postCaretOpen]: publishMenuShowing }]" aria-hidden="true"></i>
			</button>

			<button v-if="$i != null" v-tooltip="accountTooltip" class="_button" :class="$style.account" :aria-label="`${i18n.ts.account}: @${$i.username}`" @click="openAccountMenu" @contextmenu.stop="openAccountLinkMenu">
				<MkAvatar :user="$i" :class="$style.avatar" title=""/>
			</button>
			<div v-else :class="$style.guestActions">
				<button type="button" class="_button" :class="$style.guestButton" @click="signin">{{ i18n.ts.login }}</button>
				<button type="button" class="_button" :class="[$style.guestButton, $style.signup]" :title="instance.disableRegistration ? i18n.ts.invitationRequiredToRegister : i18n.ts.signup" @click="signup">{{ i18n.ts.signup }}</button>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, unref, useId, useTemplateRef } from 'vue';
import { launchPadExcludedItems, navbarItemDef, primaryNavItems } from '@/navbar.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import * as os from '@/os.js';
import { getAccountMenu } from '@/accounts.js';
import { getLinkMenu } from '@/components/global/MkA.vue';
import { userName, userPage } from '@@/js/user.js';
import { prefer } from '@/preferences.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import { useRouter } from '@/router.js';
import { pleaseLogin } from '@/utility/please-login.js';

const props = defineProps<{
	dockHidden?: boolean;
}>();

const router = useRouter();
const accountTooltip = computed(() => $i != null ? userName($i) : '');
const searchRoot = useTemplateRef('searchRoot');
const compactSearchButton = useTemplateRef('compactSearchButton');
const searchInput = useTemplateRef<HTMLInputElement>('searchInput');
const searchQuery = ref('');
const searchExpanded = ref(false);
const searchId = useId();

function signin() {
	void pleaseLogin({ message: '' });
}

async function signup() {
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkSignupDialog.vue').then(x => x.default), {
		autoSet: true,
	}, {
		closed: () => dispose(),
	});
}

async function openSearch() {
	searchExpanded.value = true;
	await nextTick();
	searchInput.value?.focus();
	searchInput.value?.select();
}

function toggleSearch() {
	if (searchExpanded.value) searchExpanded.value = false;
	else void openSearch();
}

function searchHotkey(event: KeyboardEvent) {
	if (event.defaultPrevented || event.isComposing || event.key.toLowerCase() !== 'k' || (!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) return;
	event.preventDefault();
	if (!event.repeat) void openSearch();
}

function onSearchEnter(event: KeyboardEvent) {
	if (event.isComposing || event.keyCode === 229) event.preventDefault();
}

function onSearchKeydown(event: KeyboardEvent) {
	if (event.key !== 'Escape' || event.isComposing || !searchExpanded.value) return;
	event.preventDefault();
	event.stopPropagation();
	searchExpanded.value = false;
	if (compactSearchButton.value?.offsetParent != null) compactSearchButton.value.focus();
}

function onSearchOutsidePointer(event: PointerEvent) {
	if (!searchRoot.value?.contains(event.target as Node)) searchExpanded.value = false;
}

function onSearchFocusOut(event: FocusEvent) {
	if (!searchRoot.value?.contains(event.relatedTarget as Node | null)) searchExpanded.value = false;
}

onMounted(() => {
	window.document.addEventListener('keydown', searchHotkey, { passive: false });
	window.document.addEventListener('pointerdown', onSearchOutsidePointer);
	compactNavigationMedia.addEventListener('change', onNavigationMediaChange);
});
onBeforeUnmount(() => {
	window.document.removeEventListener('keydown', searchHotkey);
	window.document.removeEventListener('pointerdown', onSearchOutsidePointer);
	compactNavigationMedia.removeEventListener('change', onNavigationMediaChange);
});

function goHome() {
	router.pushByPath('/');
}

function search() {
	const query = searchQuery.value.trim();
	if (query === '') return;
	router.pushByPath(`/search?q=${encodeURIComponent(query)}`);
	searchQuery.value = '';
	searchExpanded.value = false;
}

const compactNavigationMedia = window.matchMedia('(max-width: 760px)');
const compactNavigation = ref(compactNavigationMedia.matches);

function onNavigationMediaChange(event: MediaQueryListEvent) {
	compactNavigation.value = event.matches;
}

const navItems = computed(() => compactNavigation.value ? [] : primaryNavItems);
const fixedDockItems = ['games', 'communityRanking'] as const;
// 登录后公告归入通知中心，由铃铛入口提供。
const headerItems = computed(() => ['notifications', 'chat', 'search', ...($i != null ? ['announcements'] : []), ...navItems.value]);
// 首页左侧显示文章分类而不是菜单，此时菜单项需要在“更多”中提供。
const dockShowsMenu = computed(() => !props.dockHidden && router.currentRoute.value.name !== 'index');
// 左侧菜单始终排除顶部主要板块；折叠后必须在“更多”中恢复这些入口。
// “关于”由右下角悬浮按钮提供；聊天页没有悬浮按钮，仍在“更多”中保留。
const excludedMoreItems = computed(() => new Set([
	...headerItems.value,
	...(router.currentRoute.value.name !== 'chat' ? ['about'] : []),
	...launchPadExcludedItems,
	...(dockShowsMenu.value ? [
		...prefer.r.menu.value.filter(item => item !== 'checkin' && !primaryNavItems.includes(item)),
		...fixedDockItems,
	] : []),
]));

const otherNavItemIndicated = computed<boolean>(() => {
	for (const def in navbarItemDef) {
		// 已经在顶部导航或左侧 dock 展示的项目，不应再次让“更多”闪烁提示。
		if (excludedMoreItems.value.has(def)) continue;
		if (unref(navbarItemDef[def].indicated)) return true;
	}
	return false;
});

async function more(ev: MouseEvent) {
	const target = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (target == null) return;
	moreMenuShowing.value = true;

	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkLaunchPad.vue').then(x => x.default), {
		anchorElement: target,
		anchor: { x: 'center', y: 'bottom' },
		excludedItems: [...excludedMoreItems.value],
		includeMenuItems: true,
	}, {
		closed: () => {
			dispose();
			moreMenuShowing.value = false;
		},
	});
}

const moreMenuShowing = ref(false);

const publishMenuShowing = ref(false);

function openPublishMenu(ev: PointerEvent) {
	publishMenuShowing.value = true;
	os.popupMenu([{
		text: i18n.ts._postForm.post,
		icon: 'ti ti-pencil',
		action: () => { os.post(); },
	}, {
		type: 'link',
		text: i18n.ts._article.publish,
		icon: 'ti ti-article',
		to: '/articles/new',
	}], ev.currentTarget ?? ev.target, {
		onClosing: () => {
			publishMenuShowing.value = false;
		},
	});
}

async function openAccountMenu(ev: PointerEvent) {
	const anchor = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (anchor == null) return;
	const menuItems = await getAccountMenu({
		withExtraOperation: true,
	});

	if (anchor.isConnected) os.popupMenu(menuItems, anchor);
}

function openAccountLinkMenu(ev: PointerEvent) {
	if ($i == null) return;
	os.contextMenu(getLinkMenu(userPage($i), router), ev);
}
</script>

<style lang="scss" module>
// 逐级收缩断点
// header 内侧宽 1440px，低于断点后从左到右依次折叠元素。
// 各段は「実際に入らなくなる幅」で切る。まだ余白がある段階で畳むと間延びして見える
$search-shrink-threshold: 1400px; // 300px -> 200px
// 検索ボックスを 200px 保ったまま nav 全項目が入る下限 (現在の項目数での実測値)。
// header の収縮は主体側の三カラム折り畳みとは別問題なので、そちらの閾値には合わせず単独で決める
$search-collapse-threshold: 1000px; // 只显示图标
$logo-text-hide-threshold: 860px;
$post-text-hide-threshold: 760px;
$compact-navigation-threshold: 760px; // 与 compactNavigation 的媒体查询保持一致

.root {
	--headerHeight: 60px;
	--headerControlHeight: 36px;
	// 头像和图标按钮的悬停圆统一用这个尺寸；图标字号不随之缩小
	--headerRoundControlSize: 32px;

	flex-shrink: 0;
	height: var(--headerHeight);
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
	// header 内侧以 1440px 居中，比下方主体 (1200px) 更宽
	max-width: 1440px;
	height: 100%;
	margin: 0 auto;
	padding: 0 24px;
	box-sizing: border-box;
	display: flex;
	align-items: center;
	gap: 8px;

	@media (max-width: $compact-navigation-threshold) {
		padding: 0 12px;
		gap: 4px;
	}
}

.logo {
	flex-shrink: 1;
	min-width: 40px;
	display: flex;
	align-items: center;
	gap: 8px;
	height: 40px;
	line-height: 1;
	margin-right: 12px;
	padding: 0 8px;

	@media (max-width: $compact-navigation-threshold) {
		min-width: 32px;
		margin-right: 4px;
		padding: 0 4px;
	}
}

.logoIcon {
	height: 24px;
	width: 24px;
	object-fit: contain;
	flex-shrink: 0;
}

.logoText {
	font-weight: 700;
	font-size: 1.1em;
	max-width: 180px;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	@media (max-width: $logo-text-hide-threshold) {
		display: none;
	}
}

.nav {
	position: relative;
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
	--MI-tabPaddingInline: 13px;
	position: relative;
	flex-shrink: 0;
	// 用 line-height 撑高居中会受字体基线度量影响产生偏差，
	// 改为与 header 内其他元素一致的 flex 居中，统一中心线
	display: flex;
	align-items: center;
	height: var(--headerHeight);
	padding: 0 var(--MI-tabPaddingInline);
	font-size: 1.05em;
	color: var(--MI_THEME-navFg);
	white-space: nowrap;

	@media (max-width: $compact-navigation-threshold) {
		--MI-tabPaddingInline: 10px;
	}

	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-accent);
	}

	&.navItemActive {
		--MI-tabUnderlineOpacity: 1;
		--MI-tabUnderlineColor: var(--MI_THEME-navActive);

		color: var(--MI_THEME-navActive);
		font-weight: 700;
	}
}

// 「更多」为动作而非路由，箭头表示有下拉面板
.navMore {
	gap: 3px;
}

.navMoreCaret {
	flex-shrink: 0;
	font-size: .85em;
	color: var(--MI_THEME-fgTransparentWeak);
	pointer-events: none;
	transition: rotate 0.15s ease-out;

	&.postCaretOpen {
		rotate: 180deg;
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

.searchRoot {
	flex-shrink: 0;
	width: 300px;
	height: var(--headerControlHeight);
	margin-right: 8px;

	@media (max-width: $search-shrink-threshold) {
		width: 200px;
	}

	@media (max-width: $search-collapse-threshold) {
		width: var(--headerRoundControlSize);
		margin-right: 4px;
	}
}

.searchRoot .compactSearch {
	display: none;
	width: var(--headerRoundControlSize);
	height: var(--headerRoundControlSize);
	align-items: center;
	justify-content: center;
	border-radius: 6px;
	color: var(--MI_THEME-fgTransparentWeak);

	@media (max-width: $search-collapse-threshold) {
		display: flex;
	}
}

.search {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 100%;
	height: var(--headerControlHeight);
	padding: 0 12px;
	box-sizing: border-box;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	font-size: 13.2px;
	// 图标与文字用 flex 垂直居中
	line-height: 1;
	transition: border-color 0.1s ease-out;

	&:hover {
		border-color: var(--MI_THEME-inputBorderHover);
	}

	&:focus-within {
		border-color: var(--MI_THEME-accent);
	}

	// 相对整个 header 定位，避免展开时挤压导航或从左侧越出视口。
	@media (max-width: $search-collapse-threshold) {
		display: none;
		position: absolute;
		top: calc(100% + 8px);
		right: 16px;
		width: min(320px, calc(100vw - 32px));
		box-shadow: 0 4px 32px var(--MI_THEME-shadow);

		&.searchExpanded {
			display: flex;
		}
	}
}

.search > .searchIcon {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	color: var(--MI_THEME-fgTransparentWeak);
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

	&::placeholder {
		color: var(--MI_THEME-fgTransparentWeak);
		opacity: 1;
	}

	&:focus {
		outline: none;
	}

	// 去掉 type=search 在 WebKit 下自带的清除按钮和放大镜
	&::-webkit-search-cancel-button,
	&::-webkit-search-decoration {
		appearance: none;
	}

}

.searchShortcut {
	flex-shrink: 0;
	padding: 2px 4px;
	border: var(--MI-divider);
	border-radius: 4px;
	font: inherit;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.right > .iconButton {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: var(--headerRoundControlSize);
	height: var(--headerRoundControlSize);
	border-radius: 50%;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1em;
	line-height: 1;

	> i,
	.notificationIcon > i {
		font-size: 1em;
	}

	&:hover {
		text-decoration: none;
		// buttonBg 太接近头部背景，悬停圆边缘看不清会显得比发布/头像小
		background: var(--MI_THEME-buttonHoverBg);
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

.notificationIcon {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 1.28em;
	height: 1.28em;
}

.notificationIndicator {
	position: absolute;
	top: -4px;
	left: 50%;
	transform-origin: top left;
	pointer-events: none;
}

.notificationDot {
	position: absolute;
	top: -1px;
	right: -2px;
	font-size: 7px;
	color: var(--MI_THEME-indicator);
	pointer-events: none;
}

// 全局 ._indicateCounter 的内边距按 em 给，在这个字号下会把单个数字撑成横向椭圆。
// 这里改成固定尺寸: 一位数收成正圆，多位数由内容撑宽成胶囊
.iconButtonCounter {
	box-sizing: border-box;
	display: inline-flex;
	height: 16px;
	min-width: 16px;
	padding: 0 3px;
	align-items: center;
	justify-content: center;
	font-size: 10px;
	line-height: 1;
	white-space: nowrap;
}

.post {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	height: var(--headerControlHeight);
	padding: 0 14px;
	margin-left: 8px;
	border-radius: calc(var(--headerControlHeight) / 2);
	// 图标与文字用 flex 垂直居中
	font-weight: 700;
	color: var(--MI_THEME-fgOnAccent);
	line-height: 1;

	@media (max-width: $post-text-hide-threshold) {
		padding: 0;
		width: var(--headerRoundControlSize);
		height: var(--headerRoundControlSize);
	}
}

.postIcon {
	flex-shrink: 0;
	pointer-events: none;

	@media (max-width: $post-text-hide-threshold) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		pointer-events: auto;
	}
}

.postText {
	white-space: nowrap;

	@media (max-width: $post-text-hide-threshold) {
		display: none;
	}
}

.postCaret {
	flex-shrink: 0;
	margin-left: -2px;
	font-size: 0.85em;
	pointer-events: none;
	transition: rotate 0.15s ease-out;

	&.postCaretOpen {
		rotate: 180deg;
	}

	@media (max-width: $post-text-hide-threshold) {
		display: none;
	}
}

.guestActions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
}

.guestActions > .guestButton {
	height: var(--headerControlHeight);
	padding: 0 10px;
	border-radius: 6px;
	white-space: nowrap;
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);

	&:hover { background: var(--MI_THEME-buttonHoverBg); }

	&.signup {
		color: var(--MI_THEME-fgOnAccent);
		background: var(--MI_THEME-accent);
	}
}

.account {
	display: flex;
	align-items: center;
	justify-content: center;
	height: var(--headerControlHeight);
	margin-left: 4px;
}

.avatar {
	width: var(--headerRoundControlSize);
	height: var(--headerRoundControlSize);
}
</style>
