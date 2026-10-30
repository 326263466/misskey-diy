<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section v-if="notes.length > 0" class="_panel" :class="$style.root" :aria-labelledby="titleId">
	<h2 :id="titleId" :class="$style.title">{{ i18n.ts._noteDetail.related }}</h2>
	<ol :class="$style.list">
		<li v-for="note in notes" :key="note.id">
			<MkA :to="`/notes/${note.id}`" :class="$style.item">
				<span :class="$style.text"><Mfm :text="getNoteSummary(note)" :plain="true" :author="note.user" :emojiUrls="note.emojis"/></span>
				<span :class="$style.meta">{{ i18n.tsx._noteDetail.stats({ likes: note.likeCount ?? 0, comments: note.repliesCount }) }}</span>
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
import { getNoteSummary } from '@/utility/get-note-summary.js';

const LIMIT = 5;

const props = withDefaults(defineProps<{
	excludeId?: string | null;
	// 帖子所在频道；优先推荐同频道的热门帖子，没有时再推荐全站。
	channelId?: string | null;
}>(), {
	excludeId: null,
	channelId: null,
});

const titleId = useId();
const notes = ref<Misskey.entities.Note[]>([]);

async function fetchFeatured(channelId: string | null, signal: AbortSignal): Promise<Misskey.entities.Note[]> {
	const result = await misskeyApi('notes/featured', { limit: LIMIT + 1, ...(channelId != null ? { channelId } : {}) }, undefined, signal);
	return result.filter(note => (props.excludeId == null || note.id !== props.excludeId) && getNoteSummary(note).trim() !== '');
}

async function fetchRecent(signal: AbortSignal): Promise<Misskey.entities.Note[]> {
	const result = await misskeyApi('notes/local-timeline', { limit: LIMIT + 1, withReplies: false, withRenotes: false }, undefined, signal);
	return result.filter(note => (props.excludeId == null || note.id !== props.excludeId) && getNoteSummary(note).trim() !== '');
}

watch(() => [props.excludeId, props.channelId] as const, async ([, channelId], _previous, onCleanup) => {
	const controller = new AbortController();
	onCleanup(() => controller.abort());
	notes.value = [];
	try {
		let result = channelId != null ? await fetchFeatured(channelId, controller.signal).catch(() => []) : [];
		if (result.length === 0) result = await fetchFeatured(null, controller.signal).catch(() => []);
		if (result.length === 0) result = await fetchRecent(controller.signal).catch(() => []);
		if (controller.signal.aborted) return;
		notes.value = result.slice(0, LIMIT);
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
	padding: 10px calc(var(--MI-cardPadding) - var(--MI-marginHalf));
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fg);
	text-decoration: none;
	transition: background-color .15s ease;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-panelHighlight);

		> .text { text-decoration: underline; text-underline-offset: 2px; }
	}

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

// 帖子没有标题，正文最多显示两行。
.text {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	overflow: hidden;
	overflow-wrap: anywhere;
	line-height: 1.5;
	transition: color .15s ease;
}

.meta {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .9em;
}

@media (prefers-reduced-motion: reduce) {
	.item, .text { transition: none; }
}
</style>
