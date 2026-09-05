<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="src" :actions="headerActions" :tabs="$i ? headerTabs : headerTabsWhenNotLogin" :swipable="true" :displayMyAvatar="true" :canOmitTitle="true">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<MkPostForm v-if="prefer.r.showFixedPostForm.value" :class="[$style.postForm, '_juejinCard']" class="_panel" fixed style="margin-bottom: var(--MI-margin);"/>
		<MkStreamingNotesTimeline
			ref="tlComponent"
			:key="effectiveSrc + withRenotes + withReplies + onlyFiles + withSensitive"
			:class="$style.tl"
			:src="effectiveSrc"
			:withRenotes="withRenotes"
			:withReplies="withReplies"
			:withSensitive="withSensitive"
			:onlyFiles="onlyFiles"
			:sound="true"
		/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, watch, useTemplateRef, ref, onMounted, onActivated } from 'vue';
import type { Tab } from '@/components/global/MkPageHeader.tabs.vue';
import type { MenuItem } from '@/types/menu.js';
import type { BasicTimelineType } from '@/timelines.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import MkPostForm from '@/components/MkPostForm.vue';
import * as os from '@/os.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { definePage } from '@/page.js';
import { deviceKind } from '@/utility/device-kind.js';
import { deepMerge } from '@/utility/merge.js';
import { hasWithReplies, isAvailableBasicTimeline } from '@/timelines.js';
import { prefer } from '@/preferences.js';

const tlComponent = useTemplateRef('tlComponent');

type TimelinePageSrc = 'recommended' | 'following';

const src = computed<TimelinePageSrc>({
	get: () => {
		if (!$i) return 'recommended';
		return store.r.tl.value.src === 'home' ? 'following' : 'recommended';
	},
	set: (x: TimelinePageSrc) => saveSrc(x),
});

// 推荐流恒定走全局时间线：是否含联邦内容完全由管理员的实例设置决定
// (未接入远程实例时，全局与本地的取数条件只差 userHost，返回内容等价)。
// 全局被角色策略禁用时退回本地，否则整个推荐页会直接报错。
const recommendedSrc = computed<BasicTimelineType>(() => isAvailableBasicTimeline('global') ? 'global' : 'local');

const effectiveSrc = computed<BasicTimelineType>(() => {
	if (src.value === 'following') return 'home';
	return recommendedSrc.value;
});

const srcForAvailability = effectiveSrc;
const withRenotes = computed<boolean>({
	get: () => store.r.tl.value.filter.withRenotes,
	set: (x) => saveTlFilter('withRenotes', x),
});

// 本地/推荐时间线沿用源码的「回复」与「仅媒体」互斥规则
const localSocialTLFilterSwitchStore = ref<'withReplies' | 'onlyFiles' | false>(
	store.r.tl.value.filter.withReplies ? 'withReplies' :
	store.r.tl.value.filter.onlyFiles ? 'onlyFiles' :
	false,
);

const withReplies = computed<boolean>({
	get: () => {
		if (!$i) return false;
		if (['local', 'social'].includes(srcForAvailability.value) && localSocialTLFilterSwitchStore.value === 'onlyFiles') return false;
		return store.r.tl.value.filter.withReplies;
	},
	set: (x) => saveTlFilter('withReplies', x),
});
const onlyFiles = computed<boolean>({
	get: () => {
		if (['local', 'social'].includes(srcForAvailability.value) && localSocialTLFilterSwitchStore.value === 'withReplies') return false;
		return store.r.tl.value.filter.onlyFiles;
	},
	set: (x) => saveTlFilter('onlyFiles', x),
});

watch([withReplies, onlyFiles], ([withRepliesTo, onlyFilesTo]) => {
	if (withRepliesTo) {
		localSocialTLFilterSwitchStore.value = 'withReplies';
	} else if (onlyFilesTo) {
		localSocialTLFilterSwitchStore.value = 'onlyFiles';
	} else {
		localSocialTLFilterSwitchStore.value = false;
	}
});

const withSensitive = computed<boolean>({
	get: () => store.r.tl.value.filter.withSensitive,
	set: (x) => saveTlFilter('withSensitive', x),
});

const showFixedPostForm = prefer.model('showFixedPostForm');

function saveSrc(newSrc: TimelinePageSrc): void {
	const storedSrc = newSrc === 'following' ? 'home' : recommendedSrc.value;
	const out = deepMerge({ src: storedSrc }, store.s.tl);

	store.set('tl', out);
}

function saveTlFilter(key: keyof typeof store.s.tl.filter, newValue: boolean) {
	if (key !== 'withReplies' || $i) {
		const out = deepMerge({ filter: { [key]: newValue } }, store.s.tl);
		store.set('tl', out);
	}
}

function switchTlIfNeeded() {
	// 当前 tab 对应的时间线被角色策略禁用时，退到另一个可用的 tab
	if (src.value === 'following' && !isAvailableBasicTimeline('home')) {
		src.value = 'recommended';
	} else if (src.value === 'recommended' && !isAvailableBasicTimeline(effectiveSrc.value) && isAvailableBasicTimeline('home')) {
		src.value = 'following';
	}
}

onMounted(() => {
	switchTlIfNeeded();
});
onActivated(() => {
	switchTlIfNeeded();
});

const headerActions = computed<PageHeaderItem[]>(() => {
	const items: PageHeaderItem[] = [{
		icon: 'ti ti-dots',
		text: i18n.ts.options,
		handler: (ev) => {
			const menuItems: MenuItem[] = [];

			menuItems.push({
				type: 'switch',
				icon: 'ti ti-repeat',
				text: i18n.ts.showRenotes,
				ref: withRenotes,
			});

			menuItems.push({
				type: 'switch',
				icon: 'ti ti-eye-exclamation',
				text: i18n.ts.withSensitive,
				ref: withSensitive,
			}, {
				type: 'switch',
				icon: 'ti ti-photo',
				text: i18n.ts.fileAttachedOnly,
				ref: onlyFiles,
				disabled: hasWithReplies(srcForAvailability.value) ? withReplies : false,
			}, {
				type: 'divider',
			}, {
				type: 'switch',
				text: i18n.ts.showFixedPostForm,
				ref: showFixedPostForm,
			});

			os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
		},
	}];

	if (deviceKind === 'desktop') {
		items.unshift({
			icon: 'ti ti-refresh',
			text: i18n.ts.reload,
			handler: () => {
				tlComponent.value?.reloadTimeline();
			},
		});
	}

	return items;
});

const headerTabs = computed(() => [
	{
		key: 'recommended',
		title: i18n.ts.recommended,
	},
	...($i ? [{
		key: 'following',
		title: i18n.ts.following,
	}] : []),
] as Tab[]);

const headerTabsWhenNotLogin = computed(() => [{
	key: 'recommended',
	title: i18n.ts.recommended,
}] as Tab[]);

definePage(() => ({
	title: i18n.ts.timeline,
	icon: src.value === 'following' ? 'ti ti-home' : 'ti ti-sparkles',
}));
</script>

<style lang="scss" module>
.new {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 16px);
	z-index: 1000;
	width: 100%;
	margin: calc(-0.675em - 8px) 0;

	&:first-child {
		margin-top: calc(-0.675em - 8px - var(--MI-margin));
	}
}

.newButton {
	display: block;
	margin: var(--MI-margin) auto 0 auto;
	padding: 8px 16px;
	border-radius: 32px;
}

.postForm {
	border-radius: var(--MI-radius);
}

.tl {
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow: clip;
}
</style>
