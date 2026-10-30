<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="[$style.layout, $style.adminScope, { _pageLayoutWithSidebar: !narrow && !inWindow, [$style.sidebarCollapsed]: sidebarCompact, [$style.drawerOpen]: mobileSidebarOpen, [$style.narrow]: narrow, [$style.inWindow]: inWindow, [$style.noAnimation]: !prefer.s.animation }]">
	<nav v-show="!inWindow" :id="navigationId" ref="navigation" class="_pageNavigation _pageNavigationFill" :class="$style.navigation" :aria-label="i18n.ts.controlPanel" :aria-hidden="narrow && !mobileSidebarOpen ? true : undefined" :inert="narrow && !mobileSidebarOpen" @keydown="onNavigationKeydown">
		<div :class="$style.brand">
			<MkA to="/admin/overview" :class="$style.brandLink" :aria-label="instance.name ?? i18n.ts.controlPanel">
				<img :src="instance.iconUrl || '/favicon.ico'" alt="" :class="$style.brandIcon"/>
				<span :class="$style.brandTitle" :title="instance.name ?? i18n.ts.controlPanel">{{ instance.name ?? i18n.ts.controlPanel }}</span>
			</MkA>
			<button v-if="narrow" type="button" class="_button" :class="$style.drawerClose" :aria-label="i18n.ts.close" @click="closeSidebar"><i class="ti ti-x" aria-hidden="true"></i></button>
		</div>

		<div :class="$style.navigationBody">
			<MkSuperMenu :def="menuDef" :searchIndex="searchIndex" :compact="sidebarCompact" :class="$style.menu">
				<div class="_gaps_s" :class="$style.notices">
					<MkInfo v-if="thereIsUnresolvedAbuseReport" warn>{{ i18n.ts.thereIsUnresolvedAbuseReportWarning }} <MkA to="/admin/abuses" class="_link">{{ i18n.ts.check }}</MkA></MkInfo>
					<MkInfo v-if="noMaintainerInformation" warn>{{ i18n.ts.noMaintainerInformationWarning }} <MkA to="/admin/settings" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
					<MkInfo v-if="noInquiryUrl" warn>{{ i18n.ts.noInquiryUrlWarning }} <MkA to="/admin/settings" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
					<MkInfo v-if="noBotProtection" warn>{{ i18n.ts.noBotProtectionWarning }} <MkA to="/admin/security" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
					<MkInfo v-if="noEmailServer" warn>{{ i18n.ts.noEmailServerWarning }} <MkA to="/admin/email-settings" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
				</div>
			</MkSuperMenu>
		</div>
	</nav>
	<button v-show="!inWindow && narrow && mobileSidebarOpen" type="button" class="_button" :class="$style.drawerBackdrop" :aria-label="i18n.ts.close" tabindex="-1" @click="closeSidebar"></button>
	<header v-if="!inWindow" :class="$style.toolbar" :inert="narrow && mobileSidebarOpen">
		<button ref="sidebarToggle" v-tooltip.noDelay="i18n.ts.menu" type="button" class="_button" :class="$style.hamburger" :aria-label="i18n.ts.menu" :aria-expanded="sidebarOpen" :aria-controls="navigationId" @click="toggleSidebar">
			<i :class="sidebarOpen ? 'ti ti-layout-sidebar-left-collapse' : 'ti ti-layout-sidebar-left-expand'" aria-hidden="true"></i>
		</button>
		<nav :class="$style.breadcrumbs" :aria-label="i18n.ts.navbar">
			<span v-if="activePage === 'overview'" :class="$style.breadcrumbCurrent" aria-current="page">{{ i18n.ts.dashboard }}</span>
			<MkA v-else to="/admin/overview" :class="$style.breadcrumbRoot">{{ i18n.ts.dashboard }}</MkA>
			<template v-if="activeMenuGroup?.title && !narrow">
				<span :class="[$style.separator, $style.groupSeparator]" aria-hidden="true">{{ ' / ' }}</span>
				<span :class="$style.breadcrumbGroup">{{ activeMenuGroup.title }}</span>
			</template>
			<template v-if="activeMenuItem && activePage !== 'overview'">
				<span :class="$style.separator" aria-hidden="true">{{ ' / ' }}</span>
				<span :class="$style.breadcrumbCurrent" :title="activeMenuItem.text" aria-current="page">{{ activeMenuItem.text }}</span>
			</template>
		</nav>
		<div :class="$style.toolbarActions">
			<MkA to="/" :class="$style.homeLink" :aria-label="i18n.ts.home">
				<i class="ti ti-home" aria-hidden="true"></i><span :class="$style.homeText">{{ i18n.ts.home }}</span>
			</MkA>
			<button v-if="$i" type="button" class="_button" :class="$style.account" :aria-label="`${i18n.ts.account}: @${$i.username}`" aria-haspopup="menu" :aria-expanded="accountMenuShowing" @click="openAccountMenu">
				<MkAvatar :user="$i" :class="$style.avatar" imageOnly/>
				<span :class="$style.accountText"><MkUserName :user="$i" :nowrap="true"/></span>
				<i :class="accountMenuShowing ? 'ti ti-chevron-up' : 'ti ti-chevron-down'" aria-hidden="true"></i>
			</button>
		</div>
	</header>
	<div class="_pageContent _pageContainer" :class="$style.content" :inert="narrow && mobileSidebarOpen">
		<NestedRouterView :initialRoute="initialRoute"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onDeactivated, onMounted, onUnmounted, inject, provide, watch, ref, shallowRef, computed, nextTick, useId, useTemplateRef } from 'vue';
import type { Ref } from 'vue';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import { i18n } from '@/i18n.js';
import { navigationIcons } from '@/navigation-icons.js';
import { $i, iAmAdmin } from '@/i.js';
import { getAccountMenu } from '@/accounts.js';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import MkInfo from '@/components/MkInfo.vue';
import { instance } from '@/instance.js';
import { lookup } from '@/utility/lookup.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { lookupUser, lookupUserByEmail, lookupFile } from '@/utility/admin-lookup.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { genSearchIndexes } from '@/utility/inapp-search.js';
import { DI } from '@/di.js';
import { prefer } from '@/preferences.js';
import { miLocalStorage } from '@/local-storage.js';

const router = useRouter();
const inWindow = inject('inWindow', false);
const parentPageActive = inject(DI.pageActive, ref(true));
// Keep this layout's route while asynchronous setup finishes after navigation.
const initialRoute = router.current.route.path === '/admin' ? router.current : router.resolve('/admin')!;

const searchIndex = await import('search-index:admin').then(({ searchIndexes }) => genSearchIndexes(searchIndexes));

const isEmpty = (x: string | null) => x == null || x === '';

const indexInfo = {
	title: i18n.ts.controlPanel,
	icon: navigationIcons.controlPanel,
	hideHeader: true,
	// 管理中心保留左侧菜单，不使用时间线的左右附加栏。
	needWideArea: true,
};

provide('shouldOmitHeaderTitle', true);
provide('adminTableMode', true);
provide('pagePlainCanvas', true);

const narrow = ref(window.innerWidth < 600);
const sidebarCollapsed = ref(readSidebarCollapsed());
const mobileSidebarOpen = ref(false);
const sidebarCompact = computed(() => !narrow.value && !inWindow && sidebarCollapsed.value);
const sidebarOpen = computed(() => narrow.value ? mobileSidebarOpen.value : !sidebarCollapsed.value);
const navigationId = useId();
const navigation = useTemplateRef('navigation');
const sidebarToggle = useTemplateRef('sidebarToggle');
const el = ref<HTMLDivElement | null>(null);
const noMaintainerInformation = computed(() => isEmpty(instance.maintainerName) || isEmpty(instance.maintainerEmail));
const noBotProtection = computed(() => !instance.disableRegistration && !instance.enableHcaptcha && !instance.enableRecaptcha && !instance.enableTurnstile && !instance.enableMcaptcha);
const noEmailServer = computed(() => !instance.enableEmail);
const noInquiryUrl = computed(() => isEmpty(instance.inquiryUrl));
const thereIsUnresolvedAbuseReport = ref(false);
const accountMenuShowing = ref(false);
let accountMenuBusy = false;
let accountMenuCloseRequested: Ref<boolean> | null = null;
const currentRoute = shallowRef(router.current.route.path === initialRoute.route.path ? router.current : initialRoute);
const currentPage = computed(() => currentRoute.value.child);
const ownsCurrentRoute = computed(() => router.currentRef.value.route.path === initialRoute.route.path);
provide(DI.pageActive, computed(() => parentPageActive.value && ownsCurrentRoute.value));

misskeyApi('admin/abuse-user-reports', {
	state: 'unresolved',
	limit: 1,
}).then(reports => {
	if (reports.length > 0) thereIsUnresolvedAbuseReport.value = true;
});

const NARROW_THRESHOLD = 600;
const ro = new ResizeObserver((entries, observer) => {
	const width = entries[0]?.borderBoxSize[0]?.inlineSize;
	if (width) narrow.value = width < NARROW_THRESHOLD;
});

const activePage = computed(() => currentPage.value?.route.name);

const menuDef = computed<SuperMenuDef[]>(() => [{
	items: [
		{ icon: 'ti ti-dashboard', text: i18n.ts.dashboard, to: '/admin/overview', active: activePage.value === 'overview' },
	],
}, {
	title: i18n.ts.quickAction,
	items: [{
		type: 'button',
		icon: 'ti ti-search',
		text: i18n.ts.lookup,
		action: adminLookup,
	}, ...(instance.disableRegistration ? [{
		type: 'button' as const,
		icon: 'ti ti-user-plus',
		text: i18n.ts.createInviteCode,
		action: invite,
	}] : [])],
}, {
	title: i18n.ts._adminMenu.userPermissions,
	icon: 'ti ti-users',
	collapsible: true,
	items: [
		{ icon: 'ti ti-users', text: i18n.ts._adminMenu.users, to: '/admin/users', active: activePage.value === 'users' },
		{ icon: 'ti ti-badges', text: i18n.ts._adminMenu.roles, to: '/admin/roles', active: activePage.value === 'roles' },
		{ icon: 'ti ti-user-plus', text: i18n.ts.invitationCode, to: '/admin/invites', active: activePage.value === 'invites' },
	],
}, {
	title: i18n.ts._menuGroup.contentManagement,
	icon: 'ti ti-folders',
	collapsible: true,
	items: [
		{ icon: 'ti ti-icons', text: i18n.ts._adminMenu.emojis, to: '/admin/emojis', active: activePage.value === 'emojis' },
		{ icon: 'ti ti-icons', text: i18n.ts._adminMenu.emojisBeta, to: '/admin/emojis2', active: activePage.value === 'emojis2' },
		{ icon: 'ti ti-sparkles', text: i18n.ts.avatarDecorations, to: '/admin/avatar-decorations', active: activePage.value === 'avatarDecorations' },
		{ icon: 'ti ti-cloud', text: i18n.ts._adminMenu.files, to: '/admin/files', active: activePage.value === 'files' },
		{ icon: 'ti ti-speakerphone', text: i18n.ts._adminMenu.announcements, to: '/admin/announcements', active: activePage.value === 'announcements' },
		...(iAmAdmin ? [
			{ icon: 'ti ti-category', text: i18n.ts._article.categories, to: '/admin/article-categories', active: activePage.value === 'article-categories' },
			{ icon: 'ti ti-hash', text: i18n.ts._adminMenu.topics, to: '/admin/article-tags', active: activePage.value === 'article-tags' },
		] : []),
	],
}, {
	title: i18n.ts._menuGroup.operations,
	icon: 'ti ti-briefcase',
	collapsible: true,
	items: [
		...(iAmAdmin ? [
			{ icon: 'ti ti-qrcode', text: i18n.ts._benefits.adminTitle, to: '/admin/benefits', active: activePage.value === 'benefits' },
			{ icon: 'ti ti-wallet', text: i18n.ts._wallet.adminTitle, to: '/admin/wallet', active: activePage.value === 'wallet' },
			{ icon: 'ti ti-percentage', text: i18n.ts._payments.title, to: '/admin/payments', active: activePage.value === 'payments' },
		] : []),
		{ icon: 'ti ti-ad', text: i18n.ts._adminMenu.ads, to: '/admin/ads', active: activePage.value === 'ads' },
	],
}, {
	title: i18n.ts._menuGroup.review,
	icon: 'ti ti-shield-check',
	collapsible: true,
	items: [
		{ icon: 'ti ti-flag', text: i18n.ts.abuseReports, to: '/admin/abuses', active: activePage.value === 'abuses' || activePage.value === 'abuse-report-notification-recipient' },
		{ icon: 'ti ti-list-search', text: i18n.ts.moderationLogs, to: '/admin/modlog', active: activePage.value === 'modlog' },
		{ icon: 'ti ti-shield', text: i18n.ts.moderationSettings, to: '/admin/moderation', active: activePage.value === 'moderation' },
	],
}, {
	title: i18n.ts._menuGroup.federation,
	icon: 'ti ti-whirl',
	collapsible: true,
	items: [
		{ icon: 'ti ti-whirl', text: i18n.ts._adminMenu.instances, to: '/admin/federation', active: activePage.value === 'federation' },
		{ icon: 'ti ti-planet', text: i18n.ts._adminMenu.relays, to: '/admin/relays', active: activePage.value === 'relays' },
		{ icon: 'ti ti-clock-play', text: i18n.ts._adminMenu.federationJobs, to: '/admin/federation-job-queue', active: activePage.value === 'federationJobQueue' },
	],
}, {
	title: i18n.ts._menuGroup.systemSettings,
	icon: 'ti ti-settings',
	collapsible: true,
	items: [
		{ icon: 'ti ti-settings', text: i18n.ts.general, to: '/admin/settings', active: activePage.value === 'settings' },
		{ icon: 'ti ti-paint', text: i18n.ts.branding, to: '/admin/branding', active: activePage.value === 'branding' },
		{ icon: 'ti ti-lock', text: i18n.ts._adminMenu.security, to: '/admin/security', active: activePage.value === 'security' },
		{ icon: 'ti ti-mail', text: i18n.ts._adminMenu.email, to: '/admin/email-settings', active: activePage.value === 'email-settings' },
		{ icon: 'ti ti-cloud', text: i18n.ts.objectStorage, to: '/admin/object-storage', active: activePage.value === 'object-storage' },
		{ icon: 'ti ti-link', text: i18n.ts.externalServices, to: '/admin/external-services', active: activePage.value === 'external-services' },
		{ icon: 'ti ti-webhook', text: i18n.ts._adminMenu.systemWebhook, to: '/admin/system-webhook', active: activePage.value === 'system-webhook' },
		{ icon: 'ti ti-bolt', text: i18n.ts._adminMenu.performance, to: '/admin/performance', active: activePage.value === 'performance' },
	],
}, {
	title: i18n.ts._menuGroup.maintenance,
	icon: 'ti ti-server',
	collapsible: true,
	items: [
		{ icon: 'ti ti-clock-play', text: i18n.ts.jobQueue, to: '/admin/job-queue', active: activePage.value === 'jobQueue' },
		{ icon: 'ti ti-database', text: i18n.ts.database, to: '/admin/database', active: activePage.value === 'database' },
	],
}]);

const activeMenuGroup = computed(() => menuDef.value.find(group => group.items.some(item => item.active)));
const activeMenuItem = computed(() => currentPage.value?.route.notFound ? { text: i18n.ts.notFound } : activeMenuGroup.value?.items.find(item => item.active));

function openDefaultIfNeeded() {
	if (parentPageActive.value && ownsCurrentRoute.value && currentPage.value?.route.name == null) {
		router.replace('/admin/overview');
	}
}

function measureLayout() {
	const width = el.value?.offsetWidth;
	if (width) narrow.value = width < NARROW_THRESHOLD;
}

onMounted(() => {
	if (el.value) ro.observe(el.value);
	measureLayout();
	openDefaultIfNeeded();
});

onActivated(() => {
	measureLayout();
	openDefaultIfNeeded();
});

onDeactivated(() => {
	mobileSidebarOpen.value = false;
	closeAccountMenu();
});

onUnmounted(() => {
	ro.disconnect();
	closeAccountMenu();
});

watch([parentPageActive, ownsCurrentRoute], ([active, ownsRoute]) => {
	if (!active || !ownsRoute) closeAccountMenu();
}, { flush: 'sync' });

watch(router.currentRef, resolved => {
	if (mobileSidebarOpen.value) closeSidebar();
	if (resolved.route.path !== initialRoute.route.path) return;
	currentRoute.value = resolved;
	openDefaultIfNeeded();
});

watch(narrow, () => {
	if (mobileSidebarOpen.value) closeSidebar();
});

function readSidebarCollapsed() {
	try {
		return miLocalStorage.getItem('adminSidebarCollapsed') === 'true';
	} catch {
		return false;
	}
}

async function toggleSidebar() {
	if (!narrow.value) {
		sidebarCollapsed.value = !sidebarCollapsed.value;
		try {
			miLocalStorage.setItem('adminSidebarCollapsed', String(sidebarCollapsed.value));
		} catch {
			// 浏览器禁用存储时，仍允许本页展开和收起。
		}
		return;
	}
	if (mobileSidebarOpen.value) {
		closeSidebar();
		return;
	}
	mobileSidebarOpen.value = true;
	await nextTick();
	if (mobileSidebarOpen.value) getNavigationControls()[0]?.focus({ preventScroll: true });
}

function closeSidebar() {
	mobileSidebarOpen.value = false;
	nextTick(() => {
		if (parentPageActive.value && ownsCurrentRoute.value) sidebarToggle.value?.focus({ preventScroll: true });
	});
}

function getNavigationControls() {
	return Array.from(navigation.value?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])
		.filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
}

function onNavigationKeydown(event: KeyboardEvent) {
	if (!narrow.value || !mobileSidebarOpen.value || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
	if (event.key === 'Escape') {
		event.preventDefault();
		event.stopPropagation();
		closeSidebar();
	} else if (event.key === 'Tab') {
		const controls = getNavigationControls();
		const first = controls[0];
		const last = controls.at(-1);
		if (event.shiftKey && window.document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && window.document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	}
}

function invite() {
	// 生成的邀请码需要用户查看，保留对话框；失败提示由 apiWithDialog 处理
	os.apiWithDialog('admin/invite/create', {}).then(x => {
		os.alert({
			type: 'info',
			text: x[0].code,
		});
	}, () => {});
}

async function openAccountMenu(ev: PointerEvent) {
	const anchor = ev.currentTarget;
	if (!(anchor instanceof HTMLElement) || accountMenuBusy) return;
	accountMenuBusy = true;
	const closeRequested = ref(false);
	accountMenuCloseRequested = closeRequested;
	try {
		const items = await getAccountMenu({ withExtraOperation: true });
		if (closeRequested.value || !anchor.isConnected || !parentPageActive.value || !ownsCurrentRoute.value || !$i) return;
		accountMenuShowing.value = true;
		await os.popupMenu(items, anchor, {
			closeRequested,
			onClosing: () => { accountMenuShowing.value = false; },
		});
	} catch {
		// 菜单加载失败时不保留展开状态。
	} finally {
		accountMenuShowing.value = false;
		accountMenuBusy = false;
		accountMenuCloseRequested = null;
	}
}

function closeAccountMenu() {
	if (accountMenuCloseRequested) accountMenuCloseRequested.value = true;
	accountMenuShowing.value = false;
}

function adminLookup(ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts.user,
		icon: 'ti ti-user',
		action: () => {
			lookupUser();
		},
	}, {
		text: `${i18n.ts.user} (${i18n.ts.email})`,
		icon: 'ti ti-user',
		action: () => {
			lookupUserByEmail();
		},
	}, {
		text: i18n.ts.file,
		icon: 'ti ti-cloud',
		action: () => {
			lookupFile();
		},
	}, {
		text: i18n.ts.lookup,
		icon: 'ti ti-world-search',
		action: () => {
			lookup();
		},
	}], ev.currentTarget ?? ev.target);
}

definePage(indexInfo);
</script>

<style lang="scss" module>
@use './table.scss' as admin-table;

// 后台专用类名也用于传送到 body 的管理弹窗。
@include admin-table.styles;

.layout:global(._pageLayout) {
	--MI-pageTopInset: 0px;
	--MI-pageScrollReach: 0px;
	--MI-pageHeaderRadius: var(--MI-cardRadius);
	--MI-pageHeaderBg: var(--MI_THEME-panel);
	--MI-pageHeaderBgOpacity: 1;
	--MI-pageHeaderBorder: var(--MI-divider);
	--MI-pageContentPadding: 20px;
	--MI-formLabelFontSize: 1em;
	--MI-formCaptionFontSize: 0.9em;
	--MI-pageNavigationWidth: 210px;
	--admin-toolbarHeight: 50px;
	--admin-contentInset: 20px;

	max-width: none;
	position: relative;
	isolation: isolate;
	grid-template-rows: var(--admin-toolbarHeight) minmax(0, 1fr);
	padding: 0;
	gap: 0;
	background: var(--MI_THEME-bg);
}

.layout.sidebarCollapsed {
	--MI-pageNavigationWidth: 54px;

	.brandTitle {
		opacity: 0;
		visibility: hidden;
		transform: translateX(-12px);
	}
}

.layout:global(._pageLayoutWithSidebar) {
	transition: grid-template-columns 0.22s ease;

	> nav {
		grid-column: 1;
		grid-row: 1 / -1;
		border-inline-end: var(--MI-divider);
	}

	> :global(._pageContent) {
		grid-column: 2;
		border-radius: 0;
	}

	> .toolbar {
		grid-column: 2;
	}
}

.navigation:global(._pageNavigation) {
	grid-column: 1;
	grid-row: 2;
	align-self: stretch;
	display: flex;
	flex-direction: column;
	width: 100%;
	z-index: 2;
	overflow: clip;
	padding: 0;
	border-radius: 0;
	background: var(--MI_THEME-navBg);
	color: var(--MI_THEME-navFg);
}

.brand {
	position: relative;
	z-index: 1;
	display: flex;
	flex: 0 0 var(--admin-toolbarHeight);
	align-items: center;
	height: var(--admin-toolbarHeight);
	overflow: clip;
	background: var(--MI_THEME-navBg);
	border-bottom: var(--MI-divider);
}

.brandLink {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 10px;
	min-width: 0;
	height: var(--admin-toolbarHeight);
	padding: 8px 12px;
	box-sizing: border-box;
	overflow: hidden;
	color: var(--MI_THEME-navFg);

	&:hover {
		text-decoration: none;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.brandIcon {
	display: block;
	flex: 0 0 auto;
	width: 30px;
	height: 30px;
	object-fit: contain;
}

.brandTitle {
	flex: 0 0 auto;
	min-width: 0;
	max-width: 146px;
	color: var(--MI_THEME-navFg);
	font-size: 1em;
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	transition: opacity 0.18s ease, transform 0.22s ease, visibility 0.22s;
}

.navigationBody {
	position: relative;
	flex: 1 1 auto;
	min-height: 0;
}

.notices {
	margin-top: 16px;
	padding-top: 16px;
	border-top: var(--MI-divider);
	font-size: 0.9em;

	&:empty {
		display: none;
	}
}

// 只调整后台菜单，设置页等共享菜单保留原样。
.layout .navigation .menu {
	--MI-searchHeight: 36px;

	:global(.expandedTrack) {
		padding-inline: 0;
	}

	:global(.expandedTrack > .menuSearch) {
		margin-inline: 10px;
	}

	:global(.group > .title) {
		margin: 0;
		padding: 8px 22px;
		font-size: 0.9em;
	}

	:global(.group > .items) {
		gap: 0;
		color: var(--MI_THEME-navFg);
	}

	:global(.group > .items > .item),
	:global(.group.collapsible > .toggle),
	:global(.searchResultItem) {
		min-height: 50px;
		padding: 10px 12px 10px 16px;
		border-radius: 0;
		font-size: 1em;
		line-height: 1.5;

		&:focus-visible {
			outline: 2px solid var(--MI_THEME-accent);
			outline-offset: -2px;
		}
	}

	:global(.group > .items > .item.active),
	:global(.compactTrack > .group > .compactToggle.active) {
		// 半透明选中色统一叠在侧栏底色上，展开和收起保持一致。
		color: var(--MI_THEME-accent);
		background: linear-gradient(var(--MI_THEME-accentedBg), var(--MI_THEME-accentedBg)) var(--MI_THEME-navBg);
		box-shadow: none;
	}

	:global(.group.collapsible > .toggle) {
		color: var(--MI_THEME-navFg);
	}

	:global(.group.collapsible > .items) {
		margin-top: 0;
		padding-left: 0;
		background: var(--MI_THEME-panelHighlight);

		> :global(.item) {
			padding-inline-start: 28px;
		}
	}

	:global(.group.collapsible + .group.collapsible) {
		margin-top: 4px;
	}

	:global(.group > .items > .item > .icon),
	:global(.group.collapsible > .toggle > .icon),
	:global(.searchResultItem > .icon) {
		width: 22px;
		margin-right: 8px;
	}

	:global(.group > .items > .item > .text) {
		min-width: 0;
		padding-right: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
}

.layout .navigation .menu :global(.compactTrack) {
	:global(.group + .group) {
		margin-top: 0;
	}

	:global(.group > .items > .item),
	:global(.group > .toggle) {
		justify-content: center;
		min-height: 50px;
		padding: 0;
	}

	:global(.group > .items > .item > .icon),
	:global(.group > .toggle > .icon) {
		margin: 0;
	}
}

.toolbar {
	grid-column: 1;
	grid-row: 1;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-width: 0;
	min-height: var(--admin-toolbarHeight);
	padding: 0 var(--admin-contentInset) 0 0;
	box-sizing: border-box;
	border-bottom: var(--MI-divider);
	background: var(--MI_THEME-panel);
}

.hamburger,
.drawerClose {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	justify-content: center;
	width: 50px;
	height: var(--admin-toolbarHeight);
	color: var(--MI_THEME-fg);
	font-size: 1.25em;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.drawerClose {
	width: 36px;
	color: var(--MI_THEME-navFg);
}

.breadcrumbs {
	flex: 1 1 auto;
	min-width: 0;
	font-size: 0.9em;
	line-height: 1.5;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.breadcrumbRoot {
	color: var(--MI_THEME-fg);

	&:hover {
		color: var(--MI_THEME-accent);
		text-decoration: none;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-accent);
		outline-offset: 4px;
	}
}

.separator {
	color: var(--MI_THEME-fgTransparentWeak);
}

.breadcrumbGroup {
	color: var(--MI_THEME-fg);
}

.breadcrumbCurrent {
	color: var(--MI_THEME-fgTransparentWeak);
}

.content {
	grid-column: 1;
	grid-row: 2;
	min-width: 0;
	min-height: 0;
	padding: var(--admin-contentInset);
	box-sizing: border-box;
}

.toolbarActions {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 20px;
	margin-inline-start: auto;
}

.homeLink,
.account {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	color: var(--MI_THEME-fg);
	font-size: 1em;

	&:hover {
		color: var(--MI_THEME-accent);
		text-decoration: none;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-accent);
		outline-offset: 4px;
	}
}

.avatar {
	flex: 0 0 auto;
	width: 32px;
	height: 32px;
}

.accountText {
	min-width: 0;
	max-width: 10em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.account > i {
	flex: 0 0 auto;
}

@media (max-width: 870px) {
	.homeText,
	.groupSeparator,
	.breadcrumbGroup {
		display: none;
	}

	.toolbarActions {
		gap: 12px;
	}

	.accountText {
		max-width: 5em;
	}
}

.drawerBackdrop {
	position: absolute;
	inset: 0;
	z-index: 4;
	background: var(--MI_THEME-modalBg);
}

.layout.inWindow {
	--admin-contentInset: 0px;
	grid-template-rows: minmax(0, 1fr);

	.content {
		grid-row: 1;
	}
}

.layout.narrow {
	--MI-pageContentPadding: 16px;
	--admin-contentInset: 12px;

	.navigation {
		position: absolute;
		grid-row: 1 / -1;
		inset-block: 0;
		inset-inline-start: 0;
		z-index: 5;
		width: 210px;
		max-width: calc(100% - 54px);
		transform: translateX(-100%);
		visibility: hidden;
		transition: transform 0.28s ease, visibility 0s linear 0.28s;
	}

	&.drawerOpen .navigation {
		transform: translateX(0);
		visibility: visible;
		transition-delay: 0s;
	}

	.toolbarActions {
		gap: 12px;
	}

	.homeText {
		display: none;
	}

	.accountText {
		max-width: 4em;
	}
}

.layout.noAnimation,
.layout.noAnimation:global(._pageLayoutWithSidebar),
.layout.noAnimation .navigation,
.layout.noAnimation.narrow .navigation,
.layout.noAnimation .brandTitle {
	transition: none;
}

@media (prefers-reduced-motion: reduce) {
	.layout,
	.layout:global(._pageLayoutWithSidebar),
	.layout .navigation,
	.layout.narrow .navigation,
	.layout .brandTitle {
		transition: none;
	}
}
</style>
