<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-if="!narrow" class="_pageNavigation" :aria-label="i18n.ts.channel">
		<MkSuperMenu :def="menuDef"/>
	</nav>
	<PageWithHeader v-model:tab="tab" class="_pageContent" :tabs="narrow ? headerTabs : []" :hideHeader="!narrow" hideTitle :swipable="tab !== 'search'">
		<div class="_pageBody _gaps" :class="$style.body">
			<XFeatureToolbar>
				<form :class="$style.search" role="search" @submit.prevent="search">
					<i class="ti ti-search" :class="$style.searchIcon" aria-hidden="true"></i>
					<input v-model="query" :class="$style.searchInput" type="search" enterkeyhint="search" :placeholder="i18n.ts._channel.searchPlaceholder" :aria-label="i18n.ts._channel.searchPlaceholder" @keydown="onSearchKeydown($event, search)">
					<button v-if="tab === 'search'" type="button" class="_button" :class="$style.searchClear" :title="i18n.ts.clear" :aria-label="i18n.ts.clear" @click="clearSearch"><i class="ti ti-x" aria-hidden="true"></i></button>
					<button type="submit" class="_button" :class="$style.searchButton" :disabled="query.trim() === ''">{{ i18n.ts.search }}</button>
				</form>
				<template v-if="$i?.policies.canCreateChannel" #actions>
					<MkButton type="routerLink" primary rounded to="/channels/new"><i class="ti ti-plus" aria-hidden="true"></i>{{ i18n.ts._channel.create }}</MkButton>
				</template>
			</XFeatureToolbar>
			<div :class="$style.list">
				<NestedRouterView :initialRoute="initialRoute"/>
			</div>
		</div>
	</PageWithHeader>
</div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue';
import type { FeatureNavigationItem } from '@/pages/feature-navigation.js';
import { featureNavigationMenu } from '@/pages/feature-navigation.js';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import MkButton from '@/components/MkButton.vue';
import XFeatureToolbar from '@/pages/feature-toolbar.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';
import { onSearchKeydown } from '@/utility/search-keydown.js';

const router = useRouter();
const initialRoute = router.current.route.path === '/channels' ? router.current : router.resolve('/channels')!;
const currentRoute = shallowRef(initialRoute);
const el = useTemplateRef('el');
const narrow = usePageNavigationNarrow(el);

router.useListener('change', ({ resolved }) => {
	if (resolved.route.path === '/channels') currentRoute.value = resolved;
});

// 搜索由内容区顶部的搜索框进入，不在菜单和顶部标签中显示。
const items = [
	{ key: 'featured', title: i18n.ts._channel.featured, icon: 'ti ti-comet', to: '/channels', group: 'explore' },
	{ key: 'following', title: i18n.ts._channel.following, icon: 'ti ti-eye', to: '/channels/following', group: 'mine' },
	{ key: 'favorites', title: i18n.ts._channel.myFavorites, icon: 'ti ti-star', to: '/channels/favorites', group: 'mine' },
	{ key: 'owned', title: i18n.ts._channel.owned, icon: 'ti ti-edit', to: '/channels/owned', group: 'mine' },
	{ key: 'search', title: i18n.ts.search, icon: 'ti ti-search', to: '/channels/search', hidden: true },
] as const satisfies readonly FeatureNavigationItem[];

const tab = computed<string>({
	get: () => items.find(item => item.key === currentRoute.value.child?.route.name)?.key ?? 'featured',
	set: key => {
		const item = items.find(item => item.key === key);
		if (item != null) router.pushByPath(item.to);
	},
});

const menuDef = computed(() => featureNavigationMenu(items, tab.value));

const headerTabs = items.filter(item => !('hidden' in item)).map(({ key, title, icon }) => ({ key, title, icon }));

// 关键词和范围保存在搜索页地址中，搜索框跟随地址，刷新、前进和后退都能恢复。
const routeQuery = computed(() => tab.value === 'search' ? String(currentRoute.value.child?.props.get('query') ?? '') : '');
const routeType = computed(() => currentRoute.value.child?.props.get('type') === 'nameOnly' ? 'nameOnly' : 'nameAndDescription');
const query = ref(routeQuery.value);

watch(routeQuery, value => {
	query.value = value;
});

function search() {
	const trimmed = query.value.trim();
	if (trimmed === '') return;
	router.pushByPath(`/channels/search?q=${encodeURIComponent(trimmed)}&type=${routeType.value}`);
}

function clearSearch() {
	query.value = '';
	router.pushByPath('/channels');
}

definePage(() => ({
	title: i18n.ts.channel,
	icon: 'ti ti-broadcast',
}));
</script>

<style lang="scss" module>
@use '../../styles/search.scss' as search;

.body {
	min-width: 0;
	background: transparent;
}

.list {
	min-width: 0;
}

.search {
	@include search.container;
	flex: 1;
}

.searchIcon {
	@include search.icon;
}

.searchInput {
	@include search.input;
	@include search.hideNativeClear;
}

.searchClear {
	@include search.clear;
}

.searchButton {
	@include search.button;
}
</style>
