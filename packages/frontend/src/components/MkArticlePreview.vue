<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<article class="_panel" :class="[$style.root, { [$style.previewOnly]: previewOnly }]" @contextmenu.stop="onContextmenu">
	<div :class="$style.body">
		<component :is="previewOnly ? 'div' : 'MkA'" :to="previewOnly ? undefined : `/articles/${article.id}`" :target="previewOnly ? undefined : '_blank'" :class="$style.link" @contextmenu.capture.stop="onContextmenu">
			<h2 :class="$style.title" :title="article.title" data-search-highlight>{{ article.title }}</h2>
			<p v-if="summary" :class="[$style.summary, { [$style.searchSummary]: searchQuery }]" :title="summary" data-search-highlight>{{ summary }}</p>
		</component>
		<div :class="$style.meta">
			<div :class="$style.details">
				<component :is="previewOnly ? 'span' : 'MkA'" :to="previewOnly ? undefined : userPage(article.user)" :class="$style.author" :title="article.user.name ?? article.user.username"><MkUserName :user="article.user"/></component>
				<span :class="$style.likes" :title="i18n.ts._article.views"><i class="ti ti-eye" aria-hidden="true"></i> {{ numberFormat.format(article.articleViews ?? 0) }}</span>
				<span :class="$style.likes" :title="i18n.ts.like"><i class="ti ti-thumb-up" aria-hidden="true"></i> {{ numberFormat.format(article.likedCount ?? 0) }}</span>
				<MkA v-if="!previewOnly && article.userId === $i?.id" :to="`/articles/edit/${article.id}`" class="_textButton" :class="$style.edit">{{ i18n.ts.edit }}</MkA>
			</div>
			<div v-if="category || tags.length > 0" :class="$style.tags">
				<component :is="previewOnly ? 'span' : 'MkA'" v-if="category" :to="previewOnly ? undefined : `/articles/category/${encodeURIComponent(category.id)}`" :class="$style.tag" :title="category.name">{{ category.name }}</component>
				<component :is="previewOnly ? 'span' : 'MkA'" v-for="tag in tags" :key="tag" :to="previewOnly ? undefined : `/articles/tag/${encodeURIComponent(tag)}`" :class="$style.tag" :title="tag">{{ tag }}</component>
			</div>
		</div>
	</div>
	<component :is="previewOnly ? 'div' : 'MkA'" v-if="article.eyeCatchingImage" :to="previewOnly ? undefined : `/articles/${article.id}`" :target="previewOnly ? undefined : '_blank'" :class="$style.coverLink" :aria-label="article.title" @contextmenu.capture.stop="onContextmenu">
		<MkMediaImage :image="article.eyeCatchingImage" cover disableImageLink :controls="false" :class="$style.cover"/>
	</component>
</article>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { entities } from 'misskey-js';
import MkMediaImage from '@/components/MkMediaImage.vue';
import { userPage } from '@@/js/user.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { useRouter } from '@/router.js';
import { getArticleMenu } from '@/utility/get-article-menu.js';
import { articleBody } from '@/utility/article.js';
import { searchExpression, searchSnippet } from '@/utility/search-highlight.js';
import * as os from '@/os.js';

const props = defineProps<{ article: entities.Page; previewOnly?: boolean; searchQuery?: string }>();
const router = useRouter();
const category = computed(() => instance.articleCategories?.find(item => item.id === props.article.articleCategoryId));
const tags = computed(() => props.article.articleTags?.slice(0, 3) ?? []);
const summary = computed(() => {
	const supplied = props.article.summary?.trim() ?? '';
	const body = props.article.content ? articleBody(props.article).replace(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1').replace(/[#*_`>~]/gu, '').replace(/\s+/gu, ' ').trim() : '';
	const query = props.searchQuery ?? '';
	const expression = searchExpression(query);
	if (expression) {
		if (expression.test(supplied)) return searchSnippet(supplied, query);
		expression.lastIndex = 0;
		if (expression.test(body)) return searchSnippet(body, query);
	}
	return supplied || body.slice(0, 256);
});
const numberFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function onContextmenu(event: PointerEvent) {
	if (props.previewOnly) return;
	if (window.getSelection()?.toString()) return;
	os.contextMenu(getArticleMenu(props.article, router), event);
}
</script>

<style lang="scss" module>
.root {
	container: articlePreview / inline-size;
	display: flex;
	align-items: stretch;
	gap: 20px;
	padding: var(--MI-cardPadding);
	min-width: 0;
	text-align: left;

	// 与频道列表卡片的悬停反馈一致，但连续列表行不显示描边。
	&:not(.previewOnly) {
		position: relative;
		transition:
			background-color .18s ease,
			box-shadow .18s ease;

		&:hover {
			z-index: 1;
			background: var(--MI_THEME-panelHighlight);
			box-shadow: 0 4px 16px color-mix(in srgb, var(--MI_THEME-shadow) 35%, transparent);
		}

		&:active {
			background: color-mix(in srgb, var(--MI_THEME-panelHighlight) 72%, var(--MI_THEME-panel));
		}
	}
}

.body { display: flex; flex-direction: column; justify-content: space-between; flex: 1; min-width: 0; min-height: 90px; }
.link { display: block; min-width: 0; &:hover { text-decoration: none; } }
.title { margin: 0 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--MI_THEME-fg); font-size: 16px; font-weight: 600; line-height: 24px; }
.summary { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--MI_THEME-fgTransparentWeak); font-size: 13px; line-height: 22px; }
.searchSummary {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	white-space: normal;
	overflow-wrap: anywhere;
}
.coverLink {
	position: relative;
	display: block;
	flex: 0 0 135px;
	border-radius: var(--MI-cardRadius);
	overflow: clip;

	> .cover {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
}

.meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	min-width: 0;
	margin-top: 12px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 12px;
	line-height: 20px;
}

.details {
	display: flex;
	align-items: center;
	flex: 1;
	min-width: 0;
	> :not(:first-child) { margin-left: 8px; }
	> :nth-child(2) { padding-left: 8px; border-left: var(--MI-divider); }
}

.author { min-width: 0; max-width: 12em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: inherit; }
.likes { flex-shrink: 0; white-space: nowrap; }
.edit { flex-shrink: 0; color: inherit; }
.tags { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; max-width: 45%; margin-left: auto; }
.tag { min-width: 0; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 2px; background: var(--MI_THEME-buttonBg); color: inherit; }

@media (max-width: 500px) {
	.root { gap: 12px; padding: 14px 12px; }
	.body { min-height: 84px; }
}

@container articlePreview (max-width: 520px) {
	.coverLink { flex-basis: clamp(64px, 26cqi, 96px); }
	.meta { gap: 8px; }
	.details > :not(:first-child) { margin-left: 6px; }
	.details > :nth-child(2) { padding-left: 6px; }
	.tags { gap: 4px; }
}
</style>
