<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-if="!narrow || currentPage?.route.name == null" class="_pageNavigation _pageNavigationFill" :aria-label="i18n.ts._myCenter.title">
		<div class="_gaps_s">
			<MkButton primary full type="routerLink" to="/articles/new"><i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts._article.newArticle }}</MkButton>
			<MkSuperMenu :def="menuDef" :grid="narrow"/>
		</div>
	</nav>
	<div v-if="!(narrow && currentPage?.route.name == null)" class="_pageContent" :class="$style.content">
		<MkA v-if="narrow" to="/my" class="_link" :class="$style.menuLink"><i class="ti ti-chevron-left" aria-hidden="true"></i> {{ i18n.ts._myCenter.title }}</MkA>
		<div class="_pageContainer" :class="$style.view">
			<NestedRouterView :initialRoute="initialRoute"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type { PageMetadata } from '@/page.js';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import MkButton from '@/components/MkButton.vue';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import { i18n } from '@/i18n.js';
import { definePage, provideMetadataReceiver } from '@/page.js';
import { useRouter } from '@/router.js';
import { useScrollToTop } from '@/composables/use-scroll-to-top.js';

const router = useRouter();
// 导航后异步初始化期间仍保持本布局的路由。
const initialRoute = router.current.route.path === '/my' ? router.current : router.resolve('/my')!;
const el = useTemplateRef('el');
const currentPage = ref(initialRoute.child);
const NARROW_THRESHOLD = 800;
const narrow = ref(window.innerWidth < NARROW_THRESHOLD);
const childInfo = ref<PageMetadata | null>(null);
useScrollToTop(el);
const resizeObserver = new ResizeObserver(entries => {
	const width = entries[0]?.borderBoxSize[0].inlineSize;
	// 缓存页隐藏时宽度为 0，不因此拆掉左侧菜单。
	if (width) narrow.value = width < NARROW_THRESHOLD;
});

const menuDef = computed<SuperMenuDef[]>(() => {
	const active = currentPage.value?.route.name;
	return [{
		title: i18n.ts._myCenter.points,
		icon: 'ti ti-coins',
		collapsible: true,
		items: [
			{ icon: 'ti ti-wallet', text: i18n.ts._wallet.overview, to: '/my/wallet', active: active === 'wallet' },
			{ icon: 'ti ti-list-details', text: i18n.ts._wallet.transactions, to: '/my/wallet/transactions', active: active === 'transactions' },
			{ icon: 'ti ti-gift', text: i18n.ts._redPacket.history, to: '/my/wallet/red-packets', active: active === 'red-packets' },
			{ icon: 'ti ti-arrows-exchange', text: i18n.ts._transfer.history, to: '/my/wallet/transfers', active: active === 'transfers' },
		],
	}, {
		title: i18n.ts._myCenter.trade,
		icon: 'ti ti-building-store',
		collapsible: true,
		items: [
			{ icon: 'ti ti-package', text: i18n.ts._marketplace.myProducts, to: '/my/products', active: active === 'products' },
			{ icon: 'ti ti-plus', text: i18n.ts._marketplace.publishProduct, to: '/my/products/new', active: active === 'products-new' },
			{ icon: 'ti ti-receipt', text: i18n.ts._myCenter.purchases, to: '/my/orders', active: active === 'orders' },
			{ icon: 'ti ti-cash', text: i18n.ts._marketplace.sales, to: '/my/sales', active: active === 'sales' },
		],
	}, {
		title: i18n.ts._menuGroup.contentManagement,
		icon: 'ti ti-folders',
		collapsible: true,
		items: [
			{ icon: 'ti ti-cloud', text: i18n.ts.drive, to: '/my/drive', active: active === 'drive' },
			{ icon: 'ti ti-star', text: i18n.ts.favorites, to: '/my/favorites', active: active === 'favorites' },
			{ icon: 'ti ti-paperclip', text: i18n.ts.clip, to: '/my/clips', active: active === 'clips' },
			{ icon: 'ti ti-list', text: i18n.ts.lists, to: '/my/lists', active: active === 'lists' },
			{ icon: 'ti ti-antenna', text: i18n.ts.antennas, to: '/my/antennas', active: active === 'antennas' },
		],
	}, {
		title: i18n.ts._myCenter.growth,
		icon: 'ti ti-plant-2',
		collapsible: true,
		items: [
			{ icon: 'ti ti-calendar-check', text: i18n.ts._checkin.dailyCheckin, to: '/my/checkin', active: active === 'checkin' },
			{ icon: 'ti ti-ticket', text: i18n.ts._benefits.title, to: '/my/benefits', active: active === 'benefits' },
			{ icon: 'ti ti-medal', text: i18n.ts.achievements, to: '/my/achievements', active: active === 'achievements' },
		],
	}];
});

function openDefaultIfNeeded() {
	if (router.current.route.path === '/my' && !narrow.value && router.current.child?.route.name == null) router.replace('/my/wallet');
}

onMounted(() => {
	if (el.value) {
		resizeObserver.observe(el.value);
		narrow.value = el.value.offsetWidth < NARROW_THRESHOLD;
	}
	openDefaultIfNeeded();
});
onActivated(() => {
	if (el.value) narrow.value = el.value.offsetWidth < NARROW_THRESHOLD;
	openDefaultIfNeeded();
});
watch(narrow, openDefaultIfNeeded);
watch(router.currentRef, resolved => {
	if (resolved.route.path !== '/my') return;
	if (!narrow.value) el.value?.querySelector('._pageContainer')?.scrollTo({ top: 0, behavior: 'instant' });
	currentPage.value = resolved.child;
	openDefaultIfNeeded();
});
onUnmounted(() => resizeObserver.disconnect());
provideMetadataReceiver(getter => { childInfo.value = getter(); });
definePage(computed(() => ({
	...(childInfo.value ?? { title: i18n.ts._myCenter.title, icon: 'ti ti-layout-dashboard' }),
	needWideArea: true,
})));
</script>

<style lang="scss" module>
.content {
	display: flex;
	flex-direction: column;
}

.menuLink {
	align-self: flex-start;
	margin-bottom: var(--MI-margin);
}

.view {
	flex: 1 1 0;
	min-height: 0;
}
</style>
