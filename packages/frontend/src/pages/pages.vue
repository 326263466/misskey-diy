<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :tabs="headerTabs" :hideHeader="headerTabs.length === 0" hideTitle :swipable="true" :loading="paginator.fetching.value">
	<div class="_pageBody _gaps" :class="$style.root">
		<XFeatureToolbar>
			<div :class="$style.section">
				<span :class="$style.sectionIcon" aria-hidden="true"><i :class="section.icon"></i></span>
				<h2 :class="$style.sectionTitle">{{ section.title }}</h2>
			</div>
			<template v-if="$i" #actions>
				<MkButton type="routerLink" to="/pages/new" primary rounded><i class="ti ti-plus" aria-hidden="true"></i>{{ i18n.ts._pages.newPage }}</MkButton>
			</template>
		</XFeatureToolbar>
		<MkTip k="pages">{{ i18n.ts._pages.tip }}</MkTip>
		<MkPagination v-slot="{items}" :paginator="paginator" pageEmpty>
			<div :class="$style.items">
				<MkPagePreview v-for="page in items.map(item => 'page' in item ? item.page : item)" :key="page.id" :page="page" :class="$style.card"/>
			</div>
		</MkPagination>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkPagePreview from '@/components/MkPagePreview.vue';
import MkPagination from '@/components/MkPagination.vue';
import XFeatureToolbar from '@/pages/feature-toolbar.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';
import { useFeatureNavigationTab } from '@/pages/feature-navigation.js';

const { tab, headerTabs } = useFeatureNavigationTab();
const sections = [
	{ key: 'featured', title: i18n.ts._pages.featured, icon: 'ti ti-flare' },
	{ key: 'my', title: i18n.ts._pages.my, icon: 'ti ti-edit' },
	{ key: 'liked', title: i18n.ts._pages.liked, icon: 'ti ti-heart' },
] as const;
const section = computed(() => sections.find(item => item.key === tab.value) ?? sections[0]);

const featuredPagesPaginator = markRaw(new Paginator('pages/featured', {
	noPaging: true,
}));
const myPagesPaginator = markRaw(new Paginator('i/pages', {
	limit: 5,
}));
const likedPagesPaginator = markRaw(new Paginator('i/page-likes', {
	limit: 5,
}));
const paginator = computed(() => tab.value === 'my' ? myPagesPaginator : tab.value === 'liked' ? likedPagesPaginator : featuredPagesPaginator);

definePage(() => ({
	title: i18n.ts.pages,
	icon: 'ti ti-file-description',
}));
</script>

<style lang="scss" module>
.root {
	min-width: 0;
	container-type: inline-size;
	background: var(--MI_THEME-bg);
}

.section {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.sectionIcon {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 34px;
	height: 34px;
	border-radius: 10px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panelHighlight));
	color: var(--MI_THEME-accent);
	font-size: 17px;
}

.sectionTitle {
	margin: 0;
	overflow: hidden;
	color: var(--MI_THEME-fgHighlighted);
	font-size: 1.08em;
	font-weight: 700;
	line-height: 1.4;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.items {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
	align-items: stretch;
	gap: 14px;
	min-width: 0;
}

.card {
	min-width: 0;
}

@container (max-width: 680px) {
	.items {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
