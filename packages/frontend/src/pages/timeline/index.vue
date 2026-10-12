<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<aside v-if="!narrow" :class="$style.aside">
		<MkA class="_pageNavigation _button" :class="[$style.item, $style.rankingCard]" to="/community-ranking">
			<i class="ti ti-trophy" :class="$style.rankingIcon" aria-hidden="true"></i>
			<span>{{ i18n.ts.communityRanking }}</span>
		</MkA>
			<nav class="_pageNavigation" :class="$style.menu" :aria-label="i18n.ts._channel.featuredChannels">
				<h2 :class="$style.title">{{ i18n.ts._channel.featuredChannels }}</h2>
				<MkA v-for="channel in channels" :key="channel.id" :class="$style.channel" :to="`/channels/${channel.id}`" :title="channel.name">
					<span :class="$style.channelIcon"><img v-if="channel.bannerUrl" :src="channel.bannerUrl" alt=""/><i v-else class="ti ti-device-tv" aria-hidden="true"></i></span>
					<span :class="$style.channelName"><Mfm :text="channel.name" :plain="true" :nowrap="true"/></span>
				</MkA>
				<MkA :class="$style.more" to="/channels">{{ i18n.ts.showMore }}<i class="ti ti-chevron-right" aria-hidden="true"></i></MkA>
			</nav>
	</aside>
	<div class="_pageContent">
		<NestedRouterView :initialRoute="initialRoute"/>
	</div>
</div>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, shallowRef, useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { store } from '@/store.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';

const CHANNEL_LIMIT = 5;

const router = useRouter();
const initialRoute = router.current.route.path === '/timeline' ? router.current : router.resolve('/timeline')!;
const currentRoute = shallowRef(initialRoute);
const el = useTemplateRef('el');
const narrow = usePageNavigationNarrow(el);

router.useListener('change', ({ resolved }) => {
	if (resolved.route.path === '/timeline') currentRoute.value = resolved;
});

// 路径未指定标签时沿用上次选择，与子页面的取值规则一致
const activeTab = computed(() => {
	const tab = currentRoute.value.child?.props.get('initialTab');
	if (!$i) return 'recommended';
	if (tab === 'recommended' || tab === 'following') return tab;
	return store.r.tl.value.src === 'home' ? 'following' : 'recommended';
});

const channels = ref<Misskey.entities.Channel[]>([]);
let fetching = false;

// 热门频道随时间变化，返回页面时刷新；接口不支持 limit，取前几项
async function fetchChannels() {
	if (fetching) return;
	fetching = true;
	try {
		const featured = await misskeyApi('channels/featured');
		channels.value = featured.slice(0, CHANNEL_LIMIT);
	} catch {
		// 列表只是快捷入口，加载失败时保留上次结果
	} finally {
		fetching = false;
	}
}

void fetchChannels();
onActivated(fetchChannels);

definePage(() => ({
	title: i18n.ts.timeline,
	icon: activeTab.value === 'following' ? 'ti ti-home' : 'ti ti-sparkles',
}));
</script>

<style lang="scss" module>
.aside {
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
	min-height: 0;
	max-height: 100%;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}

	> :global(._pageNavigation) {
		flex-shrink: 0;
		align-self: stretch;
		max-height: none;
	}
}

.menu {
	display: flex;
	flex-direction: column;
	padding: 16px 12px;
}

.title {
	margin: 0 0 10px;
	padding: 0 4px;
	font-size: 1.1em;
	font-weight: 600;
}

.item {
	display: flex;
	align-items: center;
	gap: 10px;
	box-sizing: border-box;
	border-radius: var(--MI-cardRadius);
	color: var(--MI_THEME-fg);

	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-accent);
	}
}

.rankingCard {
	min-height: 56px;
	padding: 10px 20px;

	&,
	&:hover {
		background: var(--MI_THEME-panel);
	}
}

.rankingIcon {
	color: var(--MI_THEME-warn);
}

.channel {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	padding: 8px 4px;
	font-size: 0.95em;

	&:hover {
		color: var(--MI_THEME-accent);
		text-decoration: none;
	}
}

.channelIcon {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 28px;
	height: 28px;
	border-radius: calc(var(--MI-radius) / 2);
	overflow: clip;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);

	> img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
}

.channelName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.more {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	margin-top: 8px;
	padding: 8px 0 0;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover {
		color: var(--MI_THEME-accent);
		text-decoration: none;
	}
}
</style>
