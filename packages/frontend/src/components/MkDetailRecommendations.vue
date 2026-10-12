<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section v-if="items.length > 0" class="_panel" :class="$style.root" :aria-labelledby="titleId">
	<h2 :id="titleId" :class="$style.title">{{ i18n.ts._article.recommendedArticles }}</h2>
	<ol :class="$style.list">
		<li v-for="item in items" :key="item.id">
			<MkA :to="item.to" :class="$style.item">
				<span :class="$style.text">{{ item.text }}</span>
				<span :class="$style.meta">
					<MkAvatar :user="item.user" :class="$style.avatar" :link="false" :preview="false"/>
					<MkUserName :user="item.user" :class="$style.name"/>
					<MkTime :time="item.createdAt" :class="$style.time"/>
				</span>
			</MkA>
		</li>
	</ol>
</section>
</template>

<script lang="ts" setup>
import { ref, useId, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { articleBody } from '@/utility/article.js';

type Item = {
	id: string;
	to: string;
	text: string;
	user: Misskey.entities.UserLite;
	createdAt: string;
};

const LIMIT = 5;

const props = defineProps<{
	excludeId: string;
}>();

const titleId = useId();
const items = ref<Item[]>([]);

function articleItem(article: Misskey.entities.Page): Item {
	const text = article.title.trim() || article.summary?.trim() || articleBody(article).replace(/\s+/gu, ' ').trim().slice(0, 80);
	return { id: article.id, to: `/articles/${article.id}`, text, user: article.user, createdAt: article.createdAt };
}

watch(() => props.excludeId, async (excludeId, _previous, onCleanup) => {
	const controller = new AbortController();
	onCleanup(() => controller.abort());
	items.value = [];
	try {
		const result = (await misskeyApi('articles/list', { sort: 'recommended', limit: LIMIT + 1 }, undefined, controller.signal)).map(articleItem);
		if (controller.signal.aborted) return;
		items.value = result.filter(item => item.id !== excludeId).slice(0, LIMIT);
	} catch {
		// 推荐只是补充内容，加载失败时不显示卡片。
	}
}, { immediate: true });
</script>

<style lang="scss" module>
@use '@/styles/card-header.scss';

.root {
	min-width: 0;
	overflow: hidden;
}

.title {
	@include card-header.title;
	margin: 0;
	padding-inline: var(--MI-cardPadding);
}

.list {
	margin: 0;
	padding: 0 var(--MI-marginHalf) var(--MI-marginHalf);
	list-style: none;
}

.item {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fg);
	text-decoration: none;
	transition: background-color .15s ease;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);

		> .text { color: var(--MI_THEME-accent); }
	}

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.text {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	font-size: .9em;
	line-height: 1.5;
	font-weight: 600;
	overflow-wrap: anywhere;
	transition: color .15s ease;
}

.meta {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .8em;
}

.avatar {
	flex-shrink: 0;
	width: 18px;
	height: 18px;
}

.name {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}

.time { flex-shrink: 0; }

@media (prefers-reduced-motion: reduce) {
	.item, .text { transition: none; }
}
</style>
