<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<div v-if="achievements" class="_gaps_s" :class="{ [$style.card]: card }">
		<div ref="toolbarEl" :class="[$style.toolbar, { [$style.scrolled]: scrolled }]">
			<component :is="card ? 'h1' : 'div'" :class="$style.count">
				<i class="ti ti-medal" aria-hidden="true"></i>
				<span>{{ i18n.ts.achievements }}</span>
				<b>{{ unlockedCount }}</b><span :class="$style.countTotal">/ {{ totalCount }}</span>
			</component>
			<div :class="$style.sort" role="group" :aria-label="i18n.ts.sort">
				<button
					v-for="option in sortOptions"
					:key="option.key"
					type="button"
					class="_button"
					:class="[$style.sortButton, { [$style.sortSelected]: sortKey === option.key }]"
					:aria-pressed="sortKey === option.key"
					@click="sortKey = option.key"
				>{{ option.label }}</button>
			</div>
		</div>
		<MkResult v-if="items.length === 0" type="empty"/>
		<div v-else :class="$style.root">
			<div
				v-for="item in items"
				:key="item.name"
				class="_panel _juejinCard"
				:class="[$style.achievement, { [$style.locked]: item.unlockedAt == null }]"
				:role="isClickHere(item) ? 'button' : undefined"
				:tabindex="isClickHere(item) ? 0 : undefined"
				@click="isClickHere(item) && clickHere()"
				@keydown.enter="isClickHere(item) && clickHere()"
				@keydown.space.prevent="isClickHere(item) && clickHere()"
			>
				<div :class="$style.icon">
					<MkAchievementBadge :name="item.name"/>
				</div>
				<div :class="$style.body">
					<div :class="$style.header">
						<span :class="$style.title">{{ i18n.ts._achievements._types[`_${item.name}`].title }}</span>
						<span v-if="item.unlockedAt != null" :class="$style.time">
							<time v-tooltip="new Date(item.unlockedAt).toLocaleString()">{{ new Date(item.unlockedAt).getFullYear() }}/{{ new Date(item.unlockedAt).getMonth() + 1 }}/{{ new Date(item.unlockedAt).getDate() }}</time>
						</span>
					</div>
					<div :class="$style.description">{{ withDescription ? i18n.ts._achievements._types[`_${item.name}`].description : '???' }}</div>
					<div v-if="withDescription && 'flavor' in i18n.ts._achievements._types[`_${item.name}`]" :class="$style.flavor">{{ (i18n.ts._achievements._types[`_${item.name}`] as { flavor: string; }).flavor }}</div>
				</div>
			</div>
		</div>
	</div>
	<div v-else>
		<MkLoading/>
	</div>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { onMounted, ref, computed, watch, useTemplateRef } from 'vue';
import MkAchievementBadge from '@/components/MkAchievementBadge.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getScrollContainer } from '@@/js/scroll.js';
import { i18n } from '@/i18n.js';
import { ACHIEVEMENT_TYPES, claimAchievement } from '@/utility/achievements.js';

type AchievementName = typeof ACHIEVEMENT_TYPES[number];

type AchievementItem = {
	name: AchievementName;
	unlockedAt: number | null;
};

type SortKey = 'newest' | 'oldest' | 'default';

const props = withDefaults(defineProps<{
	user: Misskey.entities.User;
	withLocked?: boolean;
	withDescription?: boolean;
	card?: boolean;
}>(), {
	withLocked: true,
	withDescription: true,
	card: false,
});

const achievements = ref<Misskey.entities.UsersAchievementsResponse | null>(null);
const sortKey = ref<SortKey>('newest');

const sortOptions: { key: SortKey; label: string }[] = [
	{ key: 'newest', label: i18n.ts.descendingOrder },
	{ key: 'oldest', label: i18n.ts.ascendingOrder },
	{ key: 'default', label: i18n.ts.default },
];

const unlockedAtMap = computed(() => {
	const map = new Map<AchievementName, number>();
	for (const achievement of achievements.value ?? []) {
		map.set(achievement.name as AchievementName, achievement.unlockedAt);
	}
	return map;
});

const totalCount = computed(() => ACHIEVEMENT_TYPES.length);
const unlockedCount = computed(() => ACHIEVEMENT_TYPES.filter(x => unlockedAtMap.value.has(x)).length);

const items = computed<AchievementItem[]>(() => {
	if (achievements.value == null) return [];
	const source = props.withLocked ? ACHIEVEMENT_TYPES : ACHIEVEMENT_TYPES.filter(x => unlockedAtMap.value.has(x));
	const list: AchievementItem[] = source.map(name => ({ name, unlockedAt: unlockedAtMap.value.get(name) ?? null }));
	if (sortKey.value === 'default') return list;

	// 未獲得の実績は日時を持たないので、昇順/降順いずれでも末尾に置く
	return list.sort((a, b) => {
		if (a.unlockedAt == null || b.unlockedAt == null) return (a.unlockedAt == null ? 1 : 0) - (b.unlockedAt == null ? 1 : 0);
		return sortKey.value === 'newest' ? b.unlockedAt - a.unlockedAt : a.unlockedAt - b.unlockedAt;
	});
});

function isClickHere(item: AchievementItem): boolean {
	return item.name === 'clickedClickHere' && item.unlockedAt == null;
}

function _fetch_() {
	misskeyApi('users/achievements', { userId: props.user.id }).then(res => {
		achievements.value = res;
	});
}

function clickHere() {
	claimAchievement('clickedClickHere');
	_fetch_();
}

const toolbarEl = useTemplateRef('toolbarEl');

const scrolled = ref(false);
let scrollContainer: HTMLElement | null = null;

function onToolbarScroll() {
	scrolled.value = (scrollContainer?.scrollTop ?? window.scrollY) > 4;
}

watch(toolbarEl, el => {
	if (el == null) return;
	scrollContainer = getScrollContainer(el);
	const target: EventTarget = scrollContainer ?? window;
	target.addEventListener('scroll', onToolbarScroll, { passive: true });
	onToolbarScroll();
}, { flush: 'post' });

onMounted(() => {
	_fetch_();
});
</script>

<style lang="scss" module>
@use "../styles/page-header.scss";

.toolbar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px 12px;
}

.card {
	.toolbar {
		@include page-header.surface;
		background: var(--MI_THEME-panel);
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
		position: sticky;
		top: var(--MI-stickyTop, 0px);
		z-index: 1;
		min-height: var(--height);
		padding: 0 16px;

		&.scrolled {
			background: color(from var(--MI_THEME-panel) srgb r g b / 0.75);
			-webkit-backdrop-filter: var(--MI-blur, blur(15px));
			backdrop-filter: var(--MI-blur, blur(15px));
		}
	}

	.count {
		margin: 0;
		font-weight: bold;
	}
}

.count {
	display: flex;
	align-items: baseline;
	gap: 6px;
	font-size: 1em;

	> b {
		color: var(--MI_THEME-accent);
	}
}

.countTotal {
	opacity: 0.7;
}

.sort {
	display: flex;
	margin-left: auto;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	overflow: clip;
}

.sortButton {
	padding: 4px 10px;
	line-height: 1.6;

	&:not(:first-child) {
		border-left: solid 1px var(--MI_THEME-divider);
	}

	&.sortSelected {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
	}
}

.root {
	display: grid;
	grid-template-columns: repeat(auto-fill, min(380px, 100%));
	grid-gap: 12px;
	place-content: center;
}

.achievement {
	display: flex;
	padding: 16px;

	&.locked {
		.icon {
			filter: grayscale(1);
			opacity: 0.5;
		}

		.title,
		.description,
		.flavor {
			opacity: 0.6;
		}
	}
}

.icon {
	flex-shrink: 0;
	margin-right: 12px;
}

.body {
	flex: 1;
	min-width: 0;
}

.header {
	margin-bottom: 8px;
	display: flex;
}

.title {
	font-weight: bold;
}

.time {
	margin-left: auto;
	opacity: 0.7;
}

.flavor {
	opacity: 0.7;
	transform: skewX(-15deg);
	margin-top: 8px;
}
</style>
