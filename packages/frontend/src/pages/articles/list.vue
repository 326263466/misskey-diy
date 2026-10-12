<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" class="_pageScrollable" :class="$style.root">
	<MkStickyContainer class="_card" :class="$style.card">
		<template #header>
			<nav :class="$style.tabs" :aria-label="i18n.ts._article.article">
				<span v-if="tag" :class="$style.topic">#{{ tag }}</span>
				<MkA v-for="tab in tabs" :key="tab.key" :to="`${categoryPath}?tab=${tab.key}`" :class="[$style.tab, { [$style.active]: activeTab === tab.key }]" :aria-current="activeTab === tab.key ? 'page' : undefined">{{ tab.title }}</MkA>
				<button type="button" class="_button" :class="$style.refresh" :title="i18n.ts.reload" :aria-label="i18n.ts.reload" :disabled="paginator.fetching.value" @click="paginator.reload()"><i class="ti ti-refresh" aria-hidden="true"></i></button>
			</nav>
		</template>
		<MkPagination :paginator="paginator" pageEmpty>
			<template #default="{ items }">
				<div :class="$style.list">
					<MkArticlePreview v-for="article in items" :key="article.id" :article="article"/>
				</div>
			</template>
		</MkPagination>
	</MkStickyContainer>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, useTemplateRef, watch } from 'vue';
import MkPagination from '@/components/MkPagination.vue';
import MkArticlePreview from '@/components/MkArticlePreview.vue';
import { Paginator } from '@/utility/paginator.js';
import { instance } from '@/instance.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useScrollToTop } from '@/composables/use-scroll-to-top.js';

const props = defineProps<{ categoryId?: string; tag?: string; tab?: string }>();
const activeTab = computed(() => props.tab === 'latest' ? 'latest' : props.tab === 'following' && !props.categoryId && !props.tag && $i ? 'following' : 'recommended');
const categoryPath = computed(() => props.tag ? `/articles/tag/${encodeURIComponent(props.tag)}` : props.categoryId ? `/articles/category/${encodeURIComponent(props.categoryId)}` : '/');
const tabs = computed(() => [
	{ key: 'recommended', title: i18n.ts.recommended },
	{ key: 'latest', title: i18n.ts._article.latest },
	...(!props.categoryId && !props.tag && $i ? [{ key: 'following', title: i18n.ts._article.following }] : []),
]);
const paginators = new Map<string, Paginator<'articles/list'>>();
const paginator = computed(() => {
	const key = JSON.stringify([props.categoryId, props.tag, activeTab.value]);
	let result = paginators.get(key);
	if (!result) {
		result = markRaw(new Paginator('articles/list', {
			limit: 20,
			offsetMode: activeTab.value === 'recommended',
			params: { categoryId: props.categoryId, tag: props.tag, sort: activeTab.value === 'recommended' ? 'recommended' : 'latest', following: activeTab.value === 'following' },
		}));
		paginators.set(key, result);
	}
	return result;
});
const resetScroll = useScrollToTop(useTemplateRef('root'));
watch(paginator, resetScroll, { flush: 'sync' });

definePage(() => ({
	title: props.tag ? `#${props.tag}` : props.categoryId ? instance.articleCategories?.find(category => category.id === props.categoryId)?.name ?? i18n.ts._article.category : i18n.ts.home,
	icon: 'ti ti-home',
}));
</script>

<style lang="scss" module>
.root {
	border-radius: var(--MI-cardRadius);
}

.card {
	background: var(--MI_THEME-panel);
	overflow: clip;
}

.tabs {
	display: flex;
	align-items: center;
	gap: calc(var(--MI-margin) * 2);
	padding: 0 var(--MI-cardPadding);
	background: var(--MI_THEME-panel);
	border-bottom: var(--MI-divider);
}

.refresh {
	flex-shrink: 0;
	margin-left: auto;
	width: 44px;
	height: 44px;
	border-radius: var(--MI-cardRadius);
	color: var(--MI_THEME-fgTransparentWeak);
	&:hover { color: var(--MI_THEME-fg); background: var(--MI_THEME-buttonBg); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}
.topic { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--MI_THEME-accent); min-width: 0; }

.tab {
	position: relative;
	padding: var(--MI-margin) 0;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;

	&:hover { text-decoration: none; color: var(--MI_THEME-fg); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
	&.active {
		color: var(--MI_THEME-fg);
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

.list {
	> article { border-radius: 0; }
	> article:not(:last-child) { border-bottom: var(--MI-divider); }
}
</style>
