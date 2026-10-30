<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.mobile]: mobileLayout }]">
	<header v-if="mobileLayout" :class="$style.mobileHeader">
		<div :class="$style.mobileToolbar">
			<MkA v-if="$i" class="_button" :class="$style.account" to="/my/menu" :aria-label="`${i18n.ts.account}: @${$i.username}`">
				<MkAvatar :user="$i" :class="$style.avatar" imageOnly/>
			</MkA>
			<span v-else :class="$style.account" aria-hidden="true"><i class="ti ti-user-circle" :class="$style.guestAvatar"></i></span>
			<form :class="$style.search" role="search" @submit.prevent="search">
				<button type="submit" class="_button" :class="$style.searchAction" :aria-label="i18n.ts.search" :disabled="!searchQuery.trim()"><i class="ti ti-search" aria-hidden="true"></i></button>
				<input v-model="searchQuery" :class="$style.searchInput" type="search" enterkeyhint="search" :placeholder="i18n.ts._search.placeholder" :aria-label="i18n.ts.search" @keydown="onSearchKeydown($event, search)">
			</form>
		</div>
		<nav :class="$style.categoryNavigation" :aria-label="i18n.ts._article.categories">
			<MkA class="_button" :class="[$style.category, { [$style.active]: !activeCategory && !activeTag }]" to="/" :aria-current="!activeCategory && !activeTag ? 'page' : undefined">{{ i18n.ts._article.allCategories }}</MkA>
			<MkA v-for="category in categories" :key="category.id" class="_button" :class="[$style.category, { [$style.active]: activeCategory === category.id }]" :to="`/articles/category/${encodeURIComponent(category.id)}`" :aria-current="activeCategory === category.id ? 'page' : undefined">{{ category.name }}</MkA>
		</nav>
	</header>
	<div v-else class="_panel _card _panelPadding" :class="$style.categories">
		<label :for="categoryId" :class="$style.label">{{ i18n.ts._article.categories }}</label>
		<CategoryPicker :id="categoryId" v-model="selectedCategory" :title="i18n.ts._article.categories" :nullLabel="i18n.ts._article.allCategories"/>
	</div>
	<div :class="$style.content">
		<NestedRouterView :initialRoute="initialRoute"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, ref, useId } from 'vue';
import type { Ref } from 'vue';
import type { PageMetadata } from '@/page.js';
import CategoryPicker from '@/pages/articles/category-picker.vue';
import { i18n } from '@/i18n.js';
import { definePage, provideMetadataReceiver } from '@/page.js';
import { useRouter } from '@/router.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { deviceKind } from '@/utility/device-kind.js';
import { onSearchKeydown } from '@/utility/search-keydown.js';

const router = useRouter();
const mobileLayout = inject<Readonly<Ref<boolean>>>('mobileLayout', computed(() => deviceKind === 'smartphone' || window.innerWidth <= 500));
const searchQuery = ref('');
const categories = computed(() => instance.articleCategories ?? []);
const categoryId = useId();
const initialRoute = router.current.route.name === 'index' ? router.current : router.resolve('/')!;
const activeCategory = ref(initialRoute.child?.props.get('categoryId') as string | undefined);
const activeTag = ref(initialRoute.child?.props.get('tag') as string | undefined);
const selectedCategory = computed({
	get: () => activeCategory.value ?? null,
	set: (categoryId: string | null) => router.pushByPath(categoryId ? `/articles/category/${encodeURIComponent(categoryId)}` : '/'),
});
const metadata = ref<PageMetadata>({ title: i18n.ts.home, icon: 'ti ti-home' });

router.useListener('change', ({ resolved }) => {
	if (resolved.route.name !== 'index') return;
	activeCategory.value = resolved.child?.props.get('categoryId') as string | undefined;
	activeTag.value = resolved.child?.props.get('tag') as string | undefined;
});

function search() {
	const query = searchQuery.value.trim();
	if (!query) return;
	router.pushByPath(`/search?${new URLSearchParams({ q: query }).toString()}`);
}

definePage(computed(() => metadata.value));
provideMetadataReceiver(getter => { metadata.value = getter(); });
</script>

<style lang="scss" module>
@use '../../styles/search.scss' as search;

.root {
	display: flex;
	flex-direction: column;
	gap: var(--MI-pageGap);
	height: 100%;
	min-height: 0;
}

.mobile {
	gap: 0;
}

.mobileHeader {
	flex-shrink: 0;
	background: var(--MI_THEME-panel);
}

.mobileToolbar {
	display: flex;
	align-items: center;
	gap: 8px;
	height: var(--MI-mobileHeaderHeight);
	box-sizing: border-box;
	padding: 0 max(var(--MI-margin), env(safe-area-inset-right, 0px)) 0 max(var(--MI-margin), env(safe-area-inset-left, 0px));
}

.account {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 44px;
	height: 44px;
	border-radius: 50%;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.avatar {
	width: 32px;
	height: 32px;
}

.guestAvatar {
	font-size: 32px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.search {
	@include search.container;
	--MI-searchHeight: var(--MI-mobileSearchHeight);
	flex: 1;
	padding-left: 4px;
}

.searchInput {
	@include search.input;
}

.searchAction {
	@include search.icon;
	display: grid;
	place-items: center;
	width: 44px;
	height: 100%;
	border-radius: calc(var(--MI-radius) / 2);

	&:enabled:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.categoryNavigation {
	display: flex;
	padding-inline: max(var(--MI-margin), env(safe-area-inset-left, 0px)) max(var(--MI-margin), env(safe-area-inset-right, 0px));
	overflow-x: auto;
	scrollbar-width: none;
	border-bottom: var(--MI-divider);

	&::-webkit-scrollbar {
		display: none;
	}
}

.category {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	box-sizing: border-box;
	min-width: 48px;
	min-height: var(--MI-mobileTabHeight);
	padding-inline: 14px;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;

	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-fg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}

	&.active {
		color: var(--MI_THEME-fg);
		font-weight: bold;

		&::after {
			content: '';
			position: absolute;
			bottom: 0;
			left: 25%;
			width: 50%;
			height: 3px;
			border-radius: var(--MI-cardRadius);
			background: var(--MI_THEME-accent);
		}
	}
}

.categories {
	display: var(--MI-articleCategorySelectorDisplay, block);
	flex-shrink: 0;
}

.label {
	display: block;
	margin-bottom: var(--MI-marginHalf);
	font-size: .9em;
}

.content {
	flex: 1;
	min-height: 0;
}
</style>
