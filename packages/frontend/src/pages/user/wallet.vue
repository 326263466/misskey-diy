<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-if="!narrow || currentPage?.route.name == null" class="_pageNavigation" :aria-label="i18n.ts._wallet.title">
		<MkSuperMenu :def="menuDef" :grid="narrow"/>
	</nav>
	<PageWithHeader v-if="!(narrow && currentPage?.route.name == null)" contentCard hideHeader class="_pageContent">
		<MkA v-if="narrow" to="/wallet" class="_link" :class="$style.menuLink"><i class="ti ti-chevron-left" aria-hidden="true"></i> {{ i18n.ts._wallet.title }}</MkA>
		<NestedRouterView :initialRoute="initialRoute"/>
	</PageWithHeader>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type { PageMetadata } from '@/page.js';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import { i18n } from '@/i18n.js';
import { definePage, provideMetadataReceiver } from '@/page.js';
import { useRouter } from '@/router.js';
import { useScrollToTop } from '@/composables/use-scroll-to-top.js';

const router = useRouter();
const initialRoute = router.current.route.path === '/wallet' ? router.current : router.resolve('/wallet')!;
const el = useTemplateRef('el');
const currentPage = ref(initialRoute.child);
const NARROW_THRESHOLD = 600;
const narrow = ref(window.innerWidth < NARROW_THRESHOLD);
const childInfo = ref<PageMetadata | null>(null);
useScrollToTop(el);
const resizeObserver = new ResizeObserver(entries => {
	const width = entries[0]?.borderBoxSize[0].inlineSize;
	// 缓存页隐藏时宽度为 0，不因此拆掉左侧菜单。
	if (width) narrow.value = width < NARROW_THRESHOLD;
});
const menuDef = computed<SuperMenuDef[]>(() => [{ items: [
	{ icon: 'ti ti-wallet', text: i18n.ts._wallet.overview, to: '/wallet/overview', active: currentPage.value?.route.name === 'overview' },
	{ icon: 'ti ti-list-details', text: i18n.ts._wallet.transactions, to: '/wallet/transactions', active: currentPage.value?.route.name === 'transactions' },
	{ icon: 'ti ti-gift', text: i18n.ts._redPacket.history, to: '/wallet/red-packets', active: currentPage.value?.route.name === 'red-packets' },
	{ icon: 'ti ti-arrows-exchange', text: i18n.ts._transfer.history, to: '/wallet/transfers', active: currentPage.value?.route.name === 'transfers' },
	{ icon: 'ti ti-ticket', text: i18n.ts._benefits.title, to: '/wallet/benefits', active: currentPage.value?.route.name === 'benefits' },
] }]);

function openOverviewIfNeeded() {
	if (router.current.route.path === '/wallet' && !narrow.value && router.current.child?.route.name == null) router.replace('/wallet/overview');
}

onMounted(() => {
	if (el.value) {
		resizeObserver.observe(el.value);
		narrow.value = el.value.offsetWidth < NARROW_THRESHOLD;
	}
	openOverviewIfNeeded();
});
onActivated(() => {
	if (el.value) narrow.value = el.value.offsetWidth < NARROW_THRESHOLD;
	openOverviewIfNeeded();
});
watch(narrow, openOverviewIfNeeded);
watch(router.currentRef, resolved => {
	if (resolved.route.path !== '/wallet') return;
	currentPage.value = resolved.child;
	openOverviewIfNeeded();
});
onUnmounted(() => resizeObserver.disconnect());
provideMetadataReceiver(getter => { childInfo.value = getter(); });
definePage(computed(() => ({
	...(childInfo.value ?? { title: i18n.ts._wallet.title, icon: 'ti ti-wallet' }),
	needWideArea: true,
})));
</script>

<style lang="scss" module>
.menuLink {
	align-self: flex-start;
	margin-bottom: var(--MI-margin);
}
</style>
