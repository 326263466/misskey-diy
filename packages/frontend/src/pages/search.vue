<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :tabs="headerTabs" tabsInline :overridePageMetadata="{ title: resultTitle, icon: 'ti ti-search' }" :swipable="true">
	<div class="_pageBody">
		<form v-if="!hasGlobalSearch" :class="$style.searchForm" role="search" @submit.prevent="search">
			<i class="ti ti-search" aria-hidden="true"></i>
			<input v-model="searchQuery" :class="$style.searchInput" type="search" enterkeyhint="search" :aria-label="i18n.ts.search" :placeholder="i18n.ts._search.placeholder" @keydown="onSearchKeydown($event, search)">
			<button type="submit" class="_button" :class="$style.searchAction" :disabled="!searchQuery.trim()">{{ i18n.ts.search }}</button>
		</form>
		<MkResult v-if="!query.trim()" type="empty" :text="i18n.ts._search.placeholder" page/>
		<KeepAlive :max="prefer.s.numberOfPageCache">
			<Suspense v-if="query.trim() && currentSearchAvailable">
				<TabPage :key="searchKey" :component="searchComponent" :identity="searchKey" :isSelected="isTabSelected" :pageProps="searchProps"/>
			</Suspense>
		</KeepAlive>
		<MkInfo v-if="!currentSearchAvailable" warn>{{ unavailableMessage }}</MkInfo>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, KeepAlive, ref, watch } from 'vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { articlesSearchAvailable, notesSearchAvailable, usersSearchAvailable } from '@/utility/check-permissions.js';
import MkInfo from '@/components/MkInfo.vue';
import { prefer } from '@/preferences.js';
import { TabPage } from '@/composables/use-tab-page.js';
import { DI } from '@/di.js';
import { useRouter } from '@/router.js';
import { onSearchKeydown } from '@/utility/search-keydown.js';

const props = withDefaults(defineProps<{
	query?: string,
	userId?: string,
	username?: string,
	host?: string | null,
	channel?: string,
	type?: 'all' | 'article' | 'note' | 'user',
	origin?: 'combined' | 'local' | 'remote',
	// For storybook only
	ignoreNotesSearchAvailable?: boolean,
}>(), {
	query: '',
	userId: undefined,
	username: undefined,
	host: undefined,
	channel: undefined,
	type: undefined,
	origin: undefined,
	ignoreNotesSearchAvailable: false,
});

const XAll = defineAsyncComponent(() => import('./search.all.vue'));
const XArticle = defineAsyncComponent(() => import('./search.article.vue'));
const XNote = defineAsyncComponent(() => import('./search.note.vue'));
const XUser = defineAsyncComponent(() => import('./search.user.vue'));

const router = useRouter();
const hasGlobalSearch = inject(DI.hasGlobalSearch, ref(false));
const searchQuery = ref(props.query);
const resultTitle = computed(() => props.query.trim() ? i18n.tsx._search.resultsFor({ query: props.query.trim() }) : i18n.ts.search);
const tab = computed({
	get: () => props.type && ['article', 'note', 'user'].includes(props.type) ? props.type : 'all',
	set: (value: string) => { router.pushByPath(searchPath(value)); },
});
const noteAvailable = computed(() => notesSearchAvailable.value || props.ignoreNotesSearchAvailable);
const currentSearchAvailable = computed(() => tab.value === 'all' ? articlesSearchAvailable.value || noteAvailable.value || usersSearchAvailable.value : tab.value === 'article' ? articlesSearchAvailable.value : tab.value === 'note' ? noteAvailable.value : usersSearchAvailable.value);
const unavailableMessage = computed(() => tab.value === 'article' ? i18n.ts.articlesSearchNotAvailable : tab.value === 'note' ? i18n.ts.notesSearchNotAvailable : tab.value === 'user' ? i18n.ts.usersSearchNotAvailable : i18n.ts._search.unavailable);
const searchComponent = computed(() => tab.value === 'all' ? XAll : tab.value === 'article' ? XArticle : tab.value === 'note' ? XNote : XUser);
const searchKey = computed(() => JSON.stringify([tab.value, props.query.trim(), props.userId, props.username, props.host, props.channel, props.origin]));
const isTabSelected = (identity: string) => identity === searchKey.value;
const searchProps = computed(() => ({ ...props, searchPath, notesAvailable: noteAvailable.value }));

watch(() => props.query, value => { searchQuery.value = value; });

function searchPath(type: string, query = props.query): string {
	const params = new URLSearchParams();
	if (query.trim()) params.set('q', query.trim());
	if (type !== 'all') params.set('type', type);
	for (const key of ['userId', 'username', 'host', 'channel', 'origin'] as const) {
		const value = props[key];
		if (value != null && value !== '') params.set(key, value);
	}
	return `/search?${params.toString()}`;
}

function search() {
	if (searchQuery.value.trim()) router.pushByPath(searchPath(tab.value, searchQuery.value));
}

const headerTabs = computed(() => [{
	key: 'all',
	title: i18n.ts._search.combined,
	icon: 'ti ti-search',
}, {
	key: 'article',
	title: i18n.ts._article.article,
	icon: 'ti ti-article',
}, {
	key: 'note',
	title: i18n.ts.notes,
	icon: 'ti ti-pencil',
}, {
	key: 'user',
	title: i18n.ts.users,
	icon: 'ti ti-users',
}]);

definePage(() => ({
	title: i18n.ts.search,
	icon: 'ti ti-search',
}));
</script>

<style lang="scss" module>
@use '../styles/search.scss' as search;

.searchForm {
	@include search.container;
	width: 100%;
	margin-bottom: var(--MI-pageGap);
}

.searchInput {
	@include search.input;
}

.searchAction {
	@include search.button;
}
</style>
