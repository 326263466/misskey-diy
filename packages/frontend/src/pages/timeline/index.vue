<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="[$style.root, { _pageLayoutWithSidebar: !narrow }]">
	<aside v-if="!narrow" :class="$style.aside">
		<MkA class="_pageNavigation _button" :class="[$style.item, $style.rankingCard]" to="/community-ranking">
			<i class="ti ti-trophy" :class="$style.rankingIcon" aria-hidden="true"></i>
			<span>{{ i18n.ts.communityRanking }}</span>
		</MkA>
		<MkContainer :class="$style.menu">
			<template #header>{{ i18n.ts._channel.featuredChannels }}</template>
			<template #func>
				<MkA :class="$style.more" to="/channels">{{ i18n.ts.more }}<i class="ti ti-chevron-right" aria-hidden="true"></i></MkA>
			</template>
			<nav :class="$style.channels" :aria-label="i18n.ts._channel.featuredChannels">
				<MkA v-for="channel in channels" :key="channel.id" :class="$style.channel" :to="`/channels/${channel.id}`" :title="channel.name">
					<span :class="$style.channelBody">
						<span :class="$style.channelName"><Mfm :text="channel.name" :plain="true" :nowrap="true"/></span>
						<span :class="$style.channelMeta">{{ i18n.tsx._channel.usersCount({ n: channel.usersCount }) }} · {{ i18n.tsx._channel.notesCount({ n: channel.notesCount }) }}</span>
					</span>
				</MkA>
			</nav>
		</MkContainer>
	</aside>
	<div class="_pageContent">
		<NestedRouterView :initialRoute="initialRoute"/>
	</div>
</div>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, shallowRef, useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkContainer from '@/components/MkContainer.vue';
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

// 热门频道随时间变化，返回页面时刷新；接口不支持 limit，最多取前 5 项。
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
.root {
	padding-bottom: 0;
}

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
		overflow: clip;
	}
}

.menu {
	flex-shrink: 0;
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

.channels {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 6px;
}

.channel {
	display: block;
	min-width: 0;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	overflow: clip;
	color: var(--MI_THEME-fg);
	transition: background 0.15s ease;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
		text-decoration: none;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.channelBody {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.channelName {
	display: block;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 1em;
	line-height: 1.4;
}

.channelMeta {
	display: flex;
	align-items: center;
	min-width: 0;
	overflow: hidden;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .86em;
	line-height: 1.4;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.more {
	flex-shrink: 0;
	font-size: 13px;
	font-weight: normal;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
	background: transparent;

	&:hover {
		color: var(--MI_THEME-accent);
		text-decoration: none;
		background: transparent;
	}
}
</style>
