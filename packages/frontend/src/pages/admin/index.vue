<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-if="!narrow || currentPage?.route.name == null" class="_pageNavigation _pageNavigationFill" :aria-label="i18n.ts.controlPanel">
		<div class="_gaps">
			<div :class="$style.banner">
				<img :src="instance.iconUrl || '/favicon.ico'" alt="" :class="$style.icon"/>
			</div>

			<div class="_gaps_s">
				<MkInfo v-if="thereIsUnresolvedAbuseReport" warn>{{ i18n.ts.thereIsUnresolvedAbuseReportWarning }} <MkA to="/admin/abuses" class="_link">{{ i18n.ts.check }}</MkA></MkInfo>
				<MkInfo v-if="noMaintainerInformation" warn>{{ i18n.ts.noMaintainerInformationWarning }} <MkA to="/admin/settings" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
				<MkInfo v-if="noInquiryUrl" warn>{{ i18n.ts.noInquiryUrlWarning }} <MkA to="/admin/settings" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
				<MkInfo v-if="noBotProtection" warn>{{ i18n.ts.noBotProtectionWarning }} <MkA to="/admin/security" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
				<MkInfo v-if="noEmailServer" warn>{{ i18n.ts.noEmailServerWarning }} <MkA to="/admin/email-settings" class="_link">{{ i18n.ts.configure }}</MkA></MkInfo>
			</div>

			<MkSuperMenu :def="menuDef" :searchIndex="searchIndex" :grid="narrow"></MkSuperMenu>
		</div>
	</nav>
	<div v-if="!(narrow && currentPage?.route.name == null)" class="_pageContent _pageContainer">
		<NestedRouterView :initialRoute="initialRoute"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onMounted, onUnmounted, provide, watch, ref, computed } from 'vue';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import type { PageMetadata } from '@/page.js';
import { i18n } from '@/i18n.js';
import { iAmAdmin } from '@/i.js';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import MkInfo from '@/components/MkInfo.vue';
import { instance } from '@/instance.js';
import { lookup } from '@/utility/lookup.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { lookupUser, lookupUserByEmail, lookupFile } from '@/utility/admin-lookup.js';
import { definePage, provideMetadataReceiver, provideReactiveMetadata } from '@/page.js';
import { useRouter } from '@/router.js';
import { genSearchIndexes } from '@/utility/inapp-search.js';
import { useScrollToTop } from '@/composables/use-scroll-to-top.js';

const router = useRouter();
// Keep this layout's route while asynchronous setup finishes after navigation.
const initialRoute = router.current.route.path === '/admin' ? router.current : router.resolve('/admin')!;

const searchIndex = await import('search-index:admin').then(({ searchIndexes }) => genSearchIndexes(searchIndexes));

const isEmpty = (x: string | null) => x == null || x === '';

const indexInfo = {
	title: i18n.ts.controlPanel,
	icon: 'ti ti-settings',
	hideHeader: true,
	// 控制面板整体使用宽版区域（作业队列同款），不挤在三栏布局的中栏里
	needWideArea: true,
};

provide('shouldOmitHeaderTitle', false);

const INFO = ref<PageMetadata>(indexInfo);
const childInfo = ref<null | PageMetadata>(null);
const narrow = ref(false);
const view = ref(null);
const el = ref<HTMLDivElement | null>(null);
useScrollToTop(el);
const pageProps = ref({});
const noMaintainerInformation = computed(() => isEmpty(instance.maintainerName) || isEmpty(instance.maintainerEmail));
const noBotProtection = computed(() => !instance.disableRegistration && !instance.enableHcaptcha && !instance.enableRecaptcha && !instance.enableTurnstile && !instance.enableMcaptcha);
const noEmailServer = computed(() => !instance.enableEmail);
const noInquiryUrl = computed(() => isEmpty(instance.inquiryUrl));
const thereIsUnresolvedAbuseReport = ref(false);
const currentPage = computed(() => router.currentRef.value.child);

misskeyApi('admin/abuse-user-reports', {
	state: 'unresolved',
	limit: 1,
}).then(reports => {
	if (reports.length > 0) thereIsUnresolvedAbuseReport.value = true;
});

const NARROW_THRESHOLD = 600;
const ro = new ResizeObserver((entries, observer) => {
	if (entries.length === 0) return;
	narrow.value = entries[0].borderBoxSize[0].inlineSize < NARROW_THRESHOLD;
});

const activePage = computed(() => currentPage.value?.route.name);

const menuDef = computed<SuperMenuDef[]>(() => [{
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
	items: [
		{ icon: 'ti ti-dashboard', text: i18n.ts.dashboard, to: '/admin/overview', active: activePage.value === 'overview' },
	],
}, {
	title: i18n.ts._menuGroup.userManagement,
	icon: 'ti ti-users',
	collapsible: true,
	items: [
		{ icon: 'ti ti-users', text: i18n.ts.users, to: '/admin/users', active: activePage.value === 'users' },
		{ icon: 'ti ti-badges', text: i18n.ts.roles, to: '/admin/roles', active: activePage.value === 'roles' },
		{ icon: 'ti ti-user-plus', text: i18n.ts.invite, to: '/admin/invites', active: activePage.value === 'invites' },
	],
}, {
	title: i18n.ts._menuGroup.contentManagement,
	icon: 'ti ti-folders',
	collapsible: true,
	items: [
		{ icon: 'ti ti-icons', text: i18n.ts.customEmojis, to: '/admin/emojis', active: activePage.value === 'emojis' },
		{ icon: 'ti ti-icons', text: i18n.ts.customEmojis + '(beta)', to: '/admin/emojis2', active: activePage.value === 'emojis2' },
		{ icon: 'ti ti-sparkles', text: i18n.ts.avatarDecorations, to: '/admin/avatar-decorations', active: activePage.value === 'avatarDecorations' },
		{ icon: 'ti ti-cloud', text: i18n.ts.files, to: '/admin/files', active: activePage.value === 'files' },
		{ icon: 'ti ti-speakerphone', text: i18n.ts.announcements, to: '/admin/announcements', active: activePage.value === 'announcements' },
		...(iAmAdmin ? [{ icon: 'ti ti-category', text: i18n.ts._article.categoryAndTagSettings, to: '/admin/article-categories', active: activePage.value === 'article-categories' }] : []),
	],
}, {
	title: i18n.ts._menuGroup.operations,
	icon: 'ti ti-briefcase',
	collapsible: true,
	items: [
		...(iAmAdmin ? [
			{ icon: 'ti ti-gift', text: i18n.ts._benefits.adminTitle, to: '/admin/benefits', active: activePage.value === 'benefits' },
			{ icon: 'ti ti-wallet', text: i18n.ts._wallet.adminTitle, to: '/admin/wallet', active: activePage.value === 'wallet' },
			{ icon: 'ti ti-percentage', text: i18n.ts._payments.title, to: '/admin/payments', active: activePage.value === 'payments' },
		] : []),
		{ icon: 'ti ti-ad', text: i18n.ts.ads, to: '/admin/ads', active: activePage.value === 'ads' },
	],
}, {
	title: i18n.ts._menuGroup.review,
	icon: 'ti ti-shield-check',
	collapsible: true,
	items: [
		{ icon: 'ti ti-exclamation-circle', text: i18n.ts.abuseReports, to: '/admin/abuses', active: activePage.value === 'abuses' },
		{ icon: 'ti ti-list-search', text: i18n.ts.moderationLogs, to: '/admin/modlog', active: activePage.value === 'modlog' },
		{ icon: 'ti ti-shield', text: i18n.ts.moderation, to: '/admin/moderation', active: activePage.value === 'moderation' },
	],
}, {
	title: i18n.ts._menuGroup.federation,
	icon: 'ti ti-whirl',
	collapsible: true,
	items: [
		{ icon: 'ti ti-whirl', text: i18n.ts.federation, to: '/admin/federation', active: activePage.value === 'federation' },
		{ icon: 'ti ti-planet', text: i18n.ts.relays, to: '/admin/relays', active: activePage.value === 'relays' },
		{ icon: 'ti ti-clock-play', text: i18n.ts.federationJobs, to: '/admin/federation-job-queue', active: activePage.value === 'federationJobQueue' },
	],
}, {
	title: i18n.ts._menuGroup.systemSettings,
	icon: 'ti ti-settings',
	collapsible: true,
	items: [
		{ icon: 'ti ti-settings', text: i18n.ts.general, to: '/admin/settings', active: activePage.value === 'settings' },
		{ icon: 'ti ti-paint', text: i18n.ts.branding, to: '/admin/branding', active: activePage.value === 'branding' },
		{ icon: 'ti ti-lock', text: i18n.ts.security, to: '/admin/security', active: activePage.value === 'security' },
		{ icon: 'ti ti-mail', text: i18n.ts.emailServer, to: '/admin/email-settings', active: activePage.value === 'email-settings' },
		{ icon: 'ti ti-cloud', text: i18n.ts.objectStorage, to: '/admin/object-storage', active: activePage.value === 'object-storage' },
		{ icon: 'ti ti-link', text: i18n.ts.externalServices, to: '/admin/external-services', active: activePage.value === 'external-services' },
		{ icon: 'ti ti-webhook', text: 'Webhook', to: '/admin/system-webhook', active: activePage.value === 'system-webhook' },
		{ icon: 'ti ti-bolt', text: i18n.ts.performance, to: '/admin/performance', active: activePage.value === 'performance' },
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

onMounted(() => {
	if (el.value != null) {
		ro.observe(el.value);
		narrow.value = el.value.offsetWidth < NARROW_THRESHOLD;
	}
	if (currentPage.value?.route.name == null && !narrow.value) {
		router.replace('/admin/overview');
	}
});

onActivated(() => {
	if (el.value != null) {
		narrow.value = el.value.offsetWidth < NARROW_THRESHOLD;
	}
	if (currentPage.value?.route.name == null && !narrow.value) {
		router.replace('/admin/overview');
	}
});

onUnmounted(() => {
	ro.disconnect();
});

watch(router.currentRef, (to, from) => {
	if (!narrow.value && to.route.path === '/admin' && from.route.path === '/admin') {
		el.value?.querySelector('._pageContent')?.scrollTo({ top: 0, behavior: 'instant' });
	}
	if (to.route.path === '/admin' && to.child?.route.name == null && !narrow.value) {
		router.replace('/admin/overview');
	}
});

provideMetadataReceiver((metadataGetter) => {
	const info = metadataGetter();
	if (info == null) {
		childInfo.value = null;
	} else {
		childInfo.value = info;
		// needWideArea は indexInfo 側で常に true にしているため、子ページの値で上書きしない
		// (上書きすると job-queue 以外の子ページに入った瞬間に横幅が 3 カラムの中央幅まで縮む)
	}
});
provideReactiveMetadata(INFO);

function invite() {
	misskeyApi('admin/invite/create').then(x => {
		os.alert({
			type: 'info',
			text: x[0].code,
		});
	}).catch(err => {
		os.alert({
			type: 'error',
			text: err,
		});
	});
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

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => INFO.value);
</script>

<style lang="scss" module>
.banner {
	margin: var(--MI-margin);
}

.icon {
	display: block;
	margin: auto;
	height: 42px;
	border-radius: var(--MI-radius);
}
</style>
