<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-show="!narrow || currentPage?.route.name == null" class="_pageNavigation _pageNavigationFill" :aria-label="i18n.ts.settings">
		<div class="_gaps_s">
			<MkInfo v-if="emailNotConfigured" warn class="info">{{ i18n.ts.emailNotConfiguredWarning }} <MkA to="/settings/email" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
			<MkInfo v-if="storagePersistenceSupported && !storagePersisted && store.r.showStoragePersistenceSuggestion.value" class="info">
				<div>{{ i18n.ts._settings.settingsPersistence_description1 }}</div>
				<div>{{ i18n.ts._settings.settingsPersistence_description2 }}</div>
				<div class="_textButtons"><button class="_textButton" @click="enableStoragePersistence">{{ i18n.ts.enable }}</button><button class="_textButton" @click="skipStoragePersistence">{{ i18n.ts.skip }}</button></div>
			</MkInfo>
			<MkInfo v-if="!store.r.enablePreferencesAutoCloudBackup.value && store.r.showPreferencesAutoCloudBackupSuggestion.value" class="info">
				<div>{{ i18n.ts._preferencesBackup.autoPreferencesBackupIsNotEnabledForThisDevice }}</div>
				<div class="_textButtons"><button class="_textButton" @click="enableAutoBackup">{{ i18n.ts.enable }}</button><button class="_textButton" @click="skipAutoBackup">{{ i18n.ts.skip }}</button></div>
			</MkInfo>
			<MkSuperMenu :def="menuDef" :grid="narrow" :searchIndex="searchIndex"></MkSuperMenu>
		</div>
	</nav>
	<PageWithHeader v-show="contentVisible" contentCard class="_pageContent" :class="$style.content" :tabs="headerTabs" :actions="headerActions">
		<NestedRouterView :initialRoute="initialRoute"/>
	</PageWithHeader>
</div>
</template>

<script setup lang="ts">
import { computed, inject, onActivated, onMounted, onUnmounted, provide, ref, shallowRef, useTemplateRef, watch } from 'vue';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import { i18n } from '@/i18n.js';
import MkInfo from '@/components/MkInfo.vue';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import { $i } from '@/i.js';
import { clearCache } from '@/utility/clear-cache.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { enableAutoBackup, getPreferencesProfileMenu } from '@/preferences/utility.js';
import { store } from '@/store.js';
import { genSearchIndexes } from '@/utility/inapp-search.js';
import { enableStoragePersistence, getStoragePersistenceStatusRef, storagePersistenceSupported, skipStoragePersistence } from '@/utility/storage.js';
import { signout } from '@/signout.js';
import { DI } from '@/di.js';

const router = useRouter();
const parentPageActive = inject(DI.pageActive, ref(true));
// Keep this layout's route while asynchronous setup finishes after navigation.
const initialRoute = router.current.route.path === '/settings' ? router.current : router.resolve('/settings')!;

const searchIndex = await import('search-index:settings').then(({ searchIndexes }) => genSearchIndexes(searchIndexes));

const storagePersisted = await getStoragePersistenceStatusRef();

const indexInfo = {
	title: i18n.ts.settings,
	icon: 'ti ti-settings',
	hideHeader: true,
	// 设置页整体使用宽版区域（作业队列同款），不挤在三栏布局的中栏里
	needWideArea: true,
};
const el = useTemplateRef('el');

const NARROW_THRESHOLD = 600;
const narrow = ref(window.innerWidth < NARROW_THRESHOLD);

const currentRoute = shallowRef(router.current.route.path === initialRoute.route.path ? router.current : initialRoute);
const currentPage = computed(() => currentRoute.value.child);
const ownsCurrentRoute = computed(() => router.currentRef.value.route.path === initialRoute.route.path);
const contentVisible = computed(() => !(narrow.value && currentPage.value?.route.name == null));
provide(DI.pageActive, computed(() => parentPageActive.value && ownsCurrentRoute.value && contentVisible.value));

const ro = new ResizeObserver((entries, observer) => {
	const width = entries[0]?.borderBoxSize[0]?.inlineSize;
	if (width) narrow.value = width < NARROW_THRESHOLD;
});

function skipAutoBackup() {
	store.set('showPreferencesAutoCloudBackupSuggestion', false);
}

const menuDef = computed<SuperMenuDef[]>(() => {
	const active = currentPage.value?.route.name;
	return [{
		title: i18n.ts.accountSettings,
		icon: 'ti ti-user-circle',
		collapsible: true,
		items: [
			{ icon: 'ti ti-user', text: i18n.ts.profile, to: '/settings/profile', active: active === 'profile' },
			{ icon: 'ti ti-sparkles', text: i18n.ts.avatarDecorations, to: '/settings/avatar-decoration', active: active === 'avatarDecoration' },
			{ icon: 'ti ti-mail', text: i18n.ts.email, to: '/settings/email', active: active === 'email' },
			{ icon: 'ti ti-lock', text: i18n.ts.security, to: '/settings/security', active: active === 'security' },
			{ icon: 'ti ti-users', text: i18n.ts.manageAccounts, to: '/settings/accounts', active: active === 'accounts' },
		],
	}, {
		title: i18n.ts._menuGroup.privacyAndNotifications,
		icon: 'ti ti-shield-lock',
		collapsible: true,
		items: [
			{ icon: 'ti ti-shield-lock', text: i18n.ts.privacy, to: '/settings/privacy', active: active === 'privacy' },
			{ icon: 'ti ti-bell', text: i18n.ts.notifications, to: '/settings/notifications', active: active === 'notifications' },
			{ icon: 'ti ti-ban', text: i18n.ts.muteAndBlock, to: '/settings/mute-block', active: active === 'mute-block' },
		],
	}, {
		title: i18n.ts._menuGroup.appearanceAndInteraction,
		icon: 'ti ti-palette',
		collapsible: true,
		items: [
			{ icon: 'ti ti-palette', text: i18n.ts.theme, to: '/settings/theme', active: active === 'theme' },
			{ icon: 'ti ti-list', text: i18n.ts.navbar, to: '/settings/navbar', active: active === 'navbar' },
			{ icon: 'ti ti-layout-bottombar', text: i18n.ts.statusbar, to: '/settings/statusbar', active: active === 'statusbar' },
			{ icon: 'ti ti-columns', text: i18n.ts.deck, to: '/settings/deck', active: active === 'deck' },
			{ icon: 'ti ti-code', text: i18n.ts.customCss, to: '/settings/custom-css', active: active === 'custom-css' },
			{ icon: 'ti ti-mood-happy', text: i18n.ts.emojiPalette, to: '/settings/emoji-palette', active: active === 'emoji-palette' },
			{ icon: 'ti ti-volume', text: i18n.ts.sounds, to: '/settings/sounds', active: active === 'sounds' },
		],
	}, {
		title: i18n.ts.clientSettings,
		icon: 'ti ti-adjustments',
		collapsible: true,
		items: [
			{ icon: 'ti ti-adjustments', text: i18n.ts.preferences, to: '/settings/preferences', active: active === 'preferences' },
			{ icon: 'ti ti-cloud', text: i18n.ts.drive, to: '/settings/drive', active: active === 'drive' },
		],
	}, {
		title: i18n.ts._menuGroup.integrationsAndData,
		icon: 'ti ti-plug-connected',
		collapsible: true,
		items: [
			{ icon: 'ti ti-link', text: i18n.ts._settings.serviceConnection, to: '/settings/connect', active: active === 'connect' },
			{ icon: 'ti ti-apps', text: i18n.ts.installedApps, to: '/settings/apps', active: active === 'apps' },
			{ icon: 'ti ti-plug', text: i18n.ts.plugins, to: '/settings/plugin', active: active === 'plugin' },
			{ icon: 'ti ti-package', text: i18n.ts._settings.accountData, to: '/settings/account-data', active: active === 'account-data' },
		],
	}, {
		items: [{
			icon: 'ti ti-dots',
			text: i18n.ts.otherSettings,
			to: '/settings/other',
			active: active === 'other',
		}, {
			type: 'button',
			icon: 'ti ti-settings-2',
			text: i18n.ts.preferencesProfile,
			action: async (ev) => {
				os.popupMenu(getPreferencesProfileMenu(), ev.currentTarget ?? ev.target);
			},
		}, {
			type: 'button',
			icon: 'ti ti-trash',
			text: i18n.ts.clearCache,
			action: async () => {
				await clearCache();
			},
		}, {
			type: 'button',
			icon: 'ti ti-logout',
			text: i18n.ts.logout,
			action: async () => {
				const { canceled } = await os.confirm({
					type: 'warning',
					title: i18n.ts.logoutConfirm,
					text: i18n.ts.logoutWillClearClientData,
				});
				if (canceled) return;
				signout();
			},
			danger: true,
		}],
	}];
});

function openDefaultIfNeeded() {
	if (parentPageActive.value && ownsCurrentRoute.value && !narrow.value && currentPage.value?.route.name == null) {
		router.replace('/settings/profile');
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

onUnmounted(() => {
	ro.disconnect();
});

watch(router.currentRef, resolved => {
	if (resolved.route.path !== initialRoute.route.path) return;
	currentRoute.value = resolved;
	openDefaultIfNeeded();
});

// 布局异步挂载后可能错过 route change，挂载完成时仍要补默认子页。
watch([parentPageActive, ownsCurrentRoute, () => currentPage.value?.route.name], ([active, ownsRoute]) => {
	if (active && ownsRoute) openDefaultIfNeeded();
});

const emailNotConfigured = computed(() => $i && instance.enableEmail && ($i.email == null || !$i.emailVerified));

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(indexInfo);
// w 890
// h 700
</script>

<style lang="scss" module>
// 设置项正文统一 1em，说明文字由各组件保持 .85em。
.content {
	--MI-formButtonFontSize: 1em;
}
</style>
