<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :tabs="headerTabs" :swipable="tab !== 'search'" :hideHeader="headerTabs.length === 0" hideTitle>
	<div class="_pageBody _gaps" :class="$style.root">
		<XFeatureToolbar>
			<form :class="$style.search" role="search" @submit.prevent="search">
				<i class="ti ti-search" :class="$style.searchIcon" aria-hidden="true"></i>
				<input v-model="searchQuery" :class="$style.searchInput" type="search" enterkeyhint="search" :placeholder="i18n.ts._play.searchPlaceholder" :aria-label="i18n.ts._play.searchPlaceholder" @keydown="onSearchKeydown($event, search)">
				<button v-if="tab === 'search'" type="button" class="_button" :class="$style.searchClear" :title="i18n.ts.clear" :aria-label="i18n.ts.clear" @click="clearSearch"><i class="ti ti-x" aria-hidden="true"></i></button>
				<button v-if="searchQuery.trim() !== ''" type="submit" class="_button" :class="$style.searchButton">{{ i18n.ts.search }}</button>
			</form>
			<template v-if="$i" #actions>
				<MkPaginationControl v-if="tab === 'liked'" :paginator="likedFlashsPaginator" inHeader/>
				<MkButton type="routerLink" to="/play/new" primary rounded><i class="ti ti-plus" aria-hidden="true"></i>{{ i18n.ts._play.new }}</MkButton>
			</template>
		</XFeatureToolbar>
		<div v-if="paginator" :class="$style.list">
			<MkPagination v-slot="{items}" :paginator="paginator" pageEmpty>
				<div :class="$style.items">
					<MkFlashPreview v-for="(item, index) in items" :key="item.id" :flash="'flash' in item ? item.flash : item" :rank="tab === 'featured' ? index + 1 : undefined" @deleted="paginator.removeItem(item.id)"/>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { markRaw, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkFlashPreview from '@/components/MkFlashPreview.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import XFeatureToolbar from '@/pages/feature-toolbar.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';
import { onSearchKeydown } from '@/utility/search-keydown.js';
import { useFeatureNavigationTab } from '@/pages/feature-navigation.js';

const props = defineProps<{
	query?: string;
}>();

const router = useRouter();
const { tab, headerTabs } = useFeatureNavigationTab();
// 每个分类和搜索结果都是独立子路由，切换时本页面会重建。
const keyword = props.query?.trim() ?? '';
const searchQuery = ref(props.query ?? '');

function search() {
	const trimmed = searchQuery.value.trim();
	if (trimmed === '') return;
	router.pushByPath(`/play/search?q=${encodeURIComponent(trimmed)}`);
}

function clearSearch() {
	router.pushByPath('/play');
}

const likedFlashsPaginator = markRaw(new Paginator('flash/my-likes', {
	limit: 5,
	canSearch: true,
	searchParamName: 'search',
}));

const paginator = tab.value === 'search' ? (keyword === '' ? null : markRaw(new Paginator('flash/search', { params: { query: keyword } })))
	: tab.value === 'my' ? markRaw(new Paginator('flash/my', { limit: 5 }))
	: tab.value === 'liked' ? likedFlashsPaginator
	: markRaw(new Paginator('flash/featured', { limit: 5, offsetMode: true }));
definePage(() => ({
	title: i18n.ts.play,
	icon: 'ti ti-apps',
}));
</script>

<style lang="scss" module>
@use '../../styles/search.scss' as search;

.root {
	gap: 12px;
	min-width: 0;
	background: transparent;
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

.list {
	min-width: 0;
}

.items {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
	align-items: stretch;
	gap: 14px;
	width: 100%;
}
</style>
