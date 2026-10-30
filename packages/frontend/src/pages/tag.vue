<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="layoutEl" class="_pageLayout" :class="[$style.layout, { _pageLayoutWithSidebar: !narrow }]">
	<PageWithHeader class="_pageContent" :class="$style.main" :actions="headerActions" :tabs="headerTabs">
		<template #header-actions>
			<MkPaginationControl :paginator="paginator"/>
		</template>
		<div class="_pageBody">
			<MkNotesTimeline :paginator="paginator" :withControl="false" pageEmpty/>
		</div>
		<template v-if="$i" #footer>
			<div :class="$style.footer">
				<div class="_pageFooter">
					<MkButton rounded primary :class="$style.button" @click="post()"><i class="ti ti-plus"></i>{{ i18n.ts.postToHashtag }}</MkButton>
				</div>
			</div>
		</template>
	</PageWithHeader>
	<aside v-if="!narrow" class="_pageNavigation" :class="$style.sidebar" :aria-label="i18n.ts.hashtags">
		<MkContainer v-if="stats" :class="$style.sideCard">
			<template #header>{{ i18n.ts._hashtag.stats }}</template>
			<div :class="[$style.sideBody, $style.statistics]">
				<div v-for="item in statItems" :key="item.label" :class="$style.statistic">
					<span :class="$style.statisticValue">{{ number(item.value) }}</span>
					<span :class="$style.statisticLabel">{{ item.label }}</span>
				</div>
			</div>
		</MkContainer>
		<MkContainer v-if="popularTags.length > 0" :class="$style.sideCard">
			<template #header>{{ i18n.ts.popularTags }}</template>
			<ol :class="$style.tagList">
				<li v-for="(item, index) in popularTags" :key="item.tag">
					<MkA :to="`/tags/${encodeURIComponent(item.tag)}`" :class="$style.tagItem" :title="item.tag">
						<span :class="[$style.rank, { [$style.top]: index < 3 }]" aria-hidden="true">{{ index + 1 }}</span>
						<span :class="$style.tagText">
							<span :class="$style.tagName">#{{ item.tag }}</span>
							<span :class="$style.tagMeta">{{ i18n.tsx.nUsersMentioned({ n: number(item.mentionedUsersCount) }) }}</span>
						</span>
					</MkA>
				</li>
			</ol>
		</MkContainer>
	</aside>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, shallowRef, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import type { PageHeaderItem } from '@/types/page-header.js';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import MkButton from '@/components/MkButton.vue';
import MkContainer from '@/components/MkContainer.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import * as os from '@/os.js';
import number from '@/filters/number.js';
import { genEmbedCode } from '@/utility/get-embed-code.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { Paginator } from '@/utility/paginator.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';

const POPULAR_LIMIT = 5;

const props = defineProps<{
	tag: string;
}>();

const layoutEl = useTemplateRef('layoutEl');
const narrow = usePageNavigationNarrow(layoutEl);

const paginator = markRaw(new Paginator('notes/search-by-tag', {
	limit: 10,
	computedParams: computed(() => ({
		tag: props.tag,
	})),
}));

const stats = shallowRef<Misskey.entities.HashtagsStatsResponse | null>(null);
const popularTags = shallowRef<Misskey.entities.Hashtag[]>([]);

const statItems = computed(() => stats.value == null ? [] : [
	{ label: i18n.ts._hashtag.notes, value: stats.value.notesCount },
	{ label: i18n.ts._hashtag.week, value: stats.value.weekNotesCount },
	{ label: i18n.ts._hashtag.today, value: stats.value.todayNotesCount },
]);

// 右栏只是补充信息，请求失败时不显示对应卡片。
watch(() => props.tag, (tag, _previous, onCleanup) => {
	let canceled = false;
	onCleanup(() => { canceled = true; });
	stats.value = null;
	misskeyApi('hashtags/stats', { tag }).then(res => {
		if (!canceled) stats.value = res;
	}).catch(() => {});
	// 多取一个，排除当前话题后仍有 5 条。
	misskeyApi('hashtags/list', { sort: '+mentionedUsers', limit: POPULAR_LIMIT + 1 }).then(res => {
		if (!canceled) popularTags.value = res.filter(item => item.tag !== tag).slice(0, POPULAR_LIMIT);
	}).catch(() => {});
}, { immediate: true });

async function post() {
	await os.post({ initialHashtags: [props.tag] });
	paginator.reload();
}

const headerActions = computed<PageHeaderItem[]>(() => [{
	icon: 'ti ti-dots',
	text: i18n.ts.more,
	handler: (ev) => {
		os.popupMenu([{
			text: i18n.ts.embed,
			icon: 'ti ti-code',
			action: () => {
				genEmbedCode('tags', props.tag);
			},
		}], ev.currentTarget ?? ev.target);
	},
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: props.tag,
	icon: 'ti ti-hash',
}));
</script>

<style lang="scss" module>
@use '../styles/layout.scss' as layout;

.layout:global(._pageLayoutWithSidebar) {
	// 与频道详情一致：主列与右栏各自滚动，列宽在数据加载前就确定。
	grid-template-columns: minmax(0, 1fr) layout.$sidebarWidth;

	> .main {
		grid-column: 1;
	}
}

.sidebar {
	grid-column: 2;
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
	padding: 0;
	background: none;
}

.sideCard {
	--MI-containerHeaderBg: var(--MI_THEME-panel);
	flex-shrink: 0;
}

.sideBody {
	padding: 14px var(--MI-cardPadding);
}

.statistics {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
}

.statistic {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	min-width: 0;
}

.statisticValue {
	max-width: 100%;
	line-height: 24px;
	font-size: 1.2em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.statisticLabel {
	line-height: 20px;
	white-space: nowrap;
	color: var(--MI_THEME-fgTransparentWeak);
}

.tagList {
	margin: 0;
	padding: var(--MI-marginHalf);
	list-style: none;
}

.tagItem {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px calc(var(--MI-cardPadding) - var(--MI-marginHalf));
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fg);
	transition: background-color .15s ease;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-panelHighlight);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.rank {
	flex-shrink: 0;
	width: 16px;
	font-variant-numeric: tabular-nums;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);

	&.top { color: var(--MI_THEME-accent); }
}

.tagText {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.tagName {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	line-height: 1.4;
}

.tagMeta {
	font-size: 12px;
	line-height: 16px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	border-top: var(--MI-divider);
	display: flex;
}

.button {
	margin: 0 auto;
}

@media (prefers-reduced-motion: reduce) {
	.tagItem { transition: none; }
}
</style>
