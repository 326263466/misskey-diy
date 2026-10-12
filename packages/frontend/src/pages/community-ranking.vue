<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader class="_standalonePage" :class="[$style.page, { [$style.still]: !prefer.s.animation }]" hideHeader>
	<section class="_panel" :class="$style.panel">
		<header :class="$style.hero">
			<i class="ti ti-trophy" :class="$style.heroIcon" aria-hidden="true"></i>
			<h1>{{ i18n.ts.communityRanking }}</h1>
			<p>{{ i18n.ts._communityRanking.description }}</p>
			<nav :class="$style.tabs" :aria-label="i18n.ts.communityRanking">
				<MkA v-for="tab in tabs" :key="tab.key" :to="`/community-ranking?type=${tab.key}`" :class="[$style.tab, { [$style.selected]: type === tab.key }]" :aria-current="type === tab.key ? 'page' : undefined">
					<span>{{ tab.title }}</span>
				</MkA>
			</nav>
		</header>
		<div :class="$style.body" :aria-busy="loading">
			<div :class="$style.summary">
				<p>{{ displayedTab.rule }}</p>
				<span v-if="$i && ranking" :class="$style.myRank">{{ i18n.ts._communityRanking.myRank }} <b>{{ ranking.myRank ? i18n.tsx._communityRanking.rankLabel({ rank: ranking.myRank.rank }) : i18n.ts._communityRanking.notRanked }}</b></span>
				<span v-else-if="!$i" :class="$style.notice">{{ i18n.ts._communityRanking.signInPrompt }}</span>
			</div>
			<div :class="$style.statusBar">
				<span v-if="loading && nextOffset === 0" role="status" :class="$style.loadingStatus"><i class="ti ti-loader-2" aria-hidden="true"></i>{{ selectedTab.title }} · {{ i18n.ts.loading }}</span>
				<div v-if="error" role="alert" :class="$style.error">{{ i18n.ts._communityRanking.loadFailed }} <button type="button" class="_textButton" :disabled="loading" @click="load(failedOffset)">{{ i18n.ts.retry }}</button></div>
			</div>
			<div :class="$style.results">
				<div v-if="!ranking" :class="$style.placeholder" aria-hidden="true"><span v-for="place in [2, 1, 3]" :key="place" :data-rank="place"><i></i><b></b></span></div>
				<div v-else-if="ranking && ranking.items.length === 0" :class="$style.empty"><i class="ti ti-trophy" aria-hidden="true"></i><h2>{{ i18n.ts._communityRanking.noEntries }}</h2><p>{{ i18n.ts._communityRanking.noEntriesDescription }}</p></div>
				<template v-else-if="ranking">
					<ol v-if="podium.length > 0" :class="$style.podium" :aria-label="i18n.ts._communityRanking.podium">
						<li v-for="item in podium" :key="item.rank" :value="item.rank" :class="$style.podiumItem" :data-rank="item.rank">
							<div :class="$style.spotlight" aria-hidden="true"></div>
							<i class="ti ti-sparkles" :class="[$style.sparkle, $style.sparkleLeft]" aria-hidden="true"></i>
							<i class="ti ti-sparkles" :class="[$style.sparkle, $style.sparkleRight]" aria-hidden="true"></i>
							<MkA :to="userPage(item.user)" :class="$style.podiumUser">
								<span :class="$style.podiumAvatarFrame"><i v-if="item.rank === 1" class="ti ti-crown" :class="$style.crown" aria-hidden="true"></i><MkAvatar :user="item.user" :link="false" :class="$style.podiumAvatar"/></span>
								<MkUserName :user="item.user" :class="$style.podiumName"/>
							</MkA>
							<div :class="$style.podiumScore"><b>{{ formatValue(item.value) }}</b><span>{{ displayedTab.unit }}</span></div>
							<div :class="$style.pedestal"><div :class="$style.medal"><i class="ti ti-laurel-wreath" aria-hidden="true"></i><span :aria-label="i18n.tsx._communityRanking.rankLabel({ rank: item.rank })">{{ item.rank }}</span></div><span :class="$style.pedestalLine" aria-hidden="true"></span></div>
						</li>
					</ol>
					<ol v-if="remaining.length > 0" :class="$style.list" start="4" :aria-label="displayedTab.title">
						<li v-for="item in remaining" :key="item.user.id" :value="item.rank" :class="[$style.row, { [$style.me]: item.user.id === $i?.id }]">
							<span :class="$style.rank" :aria-label="i18n.tsx._communityRanking.rankLabel({ rank: item.rank })">{{ item.rank }}</span>
							<MkA :to="userPage(item.user)" :class="$style.user"><MkAvatar :user="item.user" :link="false" :class="$style.avatar"/><span :class="$style.userName"><MkUserName :user="item.user"/><span :class="$style.username">@{{ item.user.username }}</span></span></MkA>
							<div :class="$style.value"><b>{{ formatValue(item.value) }}</b><span>{{ displayedTab.unit }}</span></div>
						</li>
					</ol>
					<button v-if="hasMore && !error" type="button" class="_button" :class="$style.more" :disabled="loading" @click="load(nextOffset)">{{ loading ? i18n.ts.loading : i18n.ts.loadMore }}</button>
				</template>
			</div>
			<footer :class="$style.footnote"><span>{{ i18n.ts._communityRanking.rule }}</span><time v-if="ranking && updatedAt" :datetime="ranking.updatedAt">{{ i18n.tsx._communityRanking.updatedAt({ time: updatedAt }) }}</time></footer>
		</div>
	</section>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import { versatileLang } from '@@/js/intl-const.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { userPage } from '@@/js/user.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { DI } from '@/di.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{ type?: string }>();
const tabs = computed(() => [
	{ key: 'points' as const, title: i18n.ts._communityRanking.points, unit: i18n.ts._communityRanking.pointsUnit, rule: i18n.ts._communityRanking.pointsRule },
	{ key: 'replies' as const, title: i18n.ts._communityRanking.replies, unit: i18n.ts._communityRanking.repliesUnit, rule: i18n.ts._communityRanking.repliesRule },
	{ key: 'posts' as const, title: i18n.ts._communityRanking.posts, unit: i18n.ts._communityRanking.postsUnit, rule: i18n.ts._communityRanking.postsRule },
	{ key: 'checkin' as const, title: i18n.ts._communityRanking.checkin, unit: i18n.ts._communityRanking.checkinUnit, rule: i18n.ts._communityRanking.checkinRule },
	{ key: 'tips' as const, title: i18n.ts._communityRanking.tips, unit: i18n.ts._communityRanking.tipsUnit, rule: i18n.ts._communityRanking.tipsRule },
]);
const selectedTab = computed(() => tabs.value.find(tab => tab.key === props.type) ?? tabs.value[0]);
const type = computed(() => selectedTab.value.key);
const ranking = ref<entities.UsersRankingResponse | null>(null);
const displayedTab = computed(() => tabs.value.find(tab => tab.key === ranking.value?.type) ?? selectedTab.value);
const cache = new Map<string, { ranking: entities.UsersRankingResponse; nextOffset: number; hasMore: boolean; fetchedAt: number }>();
const loading = ref(false);
const error = ref(false);
const hasMore = ref(false);
const nextOffset = ref(0);
const pageActive = inject(DI.pageActive, ref(true));
const podium = computed(() => ranking.value?.items.filter(item => item.rank <= 3) ?? []);
const remaining = computed(() => ranking.value?.items.filter(item => item.rank > 3) ?? []);
const numberFormat = new Intl.NumberFormat(versatileLang, { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat(versatileLang, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const updatedAt = computed(() => ranking.value ? dateFormat.format(new Date(ranking.value.updatedAt)) : '');
let request = 0;
let failedOffset = 0;
let active = true;

function formatValue(value: number) {
	return numberFormat.format(value);
}

async function load(offset = 0) {
	if (!active || !pageActive.value) return;
	const sequence = ++request;
	const requestedType = type.value;
	failedOffset = offset;
	loading.value = true;
	error.value = false;
	try {
		const result = await misskeyApi('users/ranking', { type: requestedType, offset, limit: 20 });
		if (sequence !== request) return;
		const items = offset === 0 ? result.items : [...ranking.value!.items, ...result.items];
		ranking.value = { ...result, items: [...new Map(items.map(item => [item.user.id, item])).values()] };
		nextOffset.value = offset + result.items.length;
		hasMore.value = result.items.length === 20 && nextOffset.value < 100;
		cache.set(requestedType, { ranking: ranking.value, nextOffset: nextOffset.value, hasMore: hasMore.value, fetchedAt: Date.now() });
	} catch {
		if (sequence === request) error.value = true;
	} finally {
		if (sequence === request) loading.value = false;
	}
}

function invalidateRequest() {
	request++;
	loading.value = false;
}

function refresh() {
	if (active && pageActive.value && window.document.visibilityState !== 'hidden' && !loading.value) void load();
}

watch(type, () => {
	invalidateRequest();
	error.value = false;
	failedOffset = 0;
	const saved = cache.get(type.value);
	// 未看过的榜单在数据就绪前保留原内容，避免舞台与滚动区域塌缩。
	if (saved) ranking.value = saved.ranking;
	hasMore.value = saved?.hasMore ?? false;
	nextOffset.value = saved?.nextOffset ?? 0;
	if (!saved || Date.now() - saved.fetchedAt > 60_000) void load();
}, { immediate: true });
watch(pageActive, value => { if (value) refresh(); else invalidateRequest(); });
onMounted(() => { window.addEventListener('focus', refresh); });
onActivated(() => { if (!active) { active = true; refresh(); } });
onDeactivated(() => { active = false; invalidateRequest(); });
onUnmounted(() => { active = false; invalidateRequest(); window.removeEventListener('focus', refresh); });

definePage(() => ({ title: i18n.ts.communityRanking, icon: 'ti ti-trophy' }));
</script>

<style lang="scss" module>
.page {
	--MI-pageHeaderBg: transparent;
}

.panel {
	container-type: inline-size;
	margin-bottom: var(--MI-pageGap);
}

.hero {
	padding: 24px var(--MI-cardPadding) 0;
	text-align: center;
	background: radial-gradient(ellipse at top, color-mix(in srgb, var(--MI_THEME-accent) 9%, transparent), transparent 75%);

	h1 { margin: 8px 0; font-size: 1.8em; }
	p { margin: 0 0 20px; color: var(--MI_THEME-fgTransparentWeak); line-height: 1.6; }
}

.heroIcon {
	font-size: 32px;
	color: var(--MI-rankingGold);
}

.tabs {
	display: flex;
	justify-content: center;
	gap: 12px;
	border-bottom: var(--MI-divider);
}

.tab {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 7px;
	min-width: 0;
	padding: 14px 22px;
	border-bottom: 3px solid transparent;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;

	&:hover { text-decoration: none; color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
	&.selected { color: var(--MI_THEME-accent); border-bottom-color: var(--MI_THEME-accent); font-weight: bold; }
}

.body {
	--stageHeight: 328px;
	--stageGap: 16px;
	--firstStepHeight: 88px;
	--secondStepHeight: 68px;
	--thirdStepHeight: 52px;
	padding: 18px clamp(16px, 5cqi, 64px);
	container-type: inline-size;
}

.summary {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
	line-height: 1.6;

	p { margin: 0; }
}

.myRank b { margin-left: 8px; color: var(--MI_THEME-accent); }
.notice { font-size: inherit; }

.statusBar {
	min-height: 20px;
	padding-top: 4px;
	font-size: .8em;
}

.loadingStatus {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--MI_THEME-fgTransparentWeak);

	> i { animation: loadingSpin 1.2s linear infinite; }
}

.results { min-height: calc(var(--stageHeight) + var(--stageGap)); }

.podium {
	position: relative;
	isolation: isolate;
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	align-items: end;
	gap: 12px;
	max-width: 800px;
	min-height: var(--stageHeight);
	box-sizing: border-box;
	margin: 0 auto var(--stageGap);
	padding: 52px 16px 12px;
	list-style: none;

	&::after {
		content: '';
		position: absolute;
		z-index: -1;
		inset: auto 0 0;
		height: 60px;
		border-radius: 50%;
		background: radial-gradient(ellipse, color-mix(in srgb, var(--MI-rankingGold) 14%, transparent), transparent 70%);
		pointer-events: none;
	}
}

.podiumItem {
	--rankColor: var(--MI-rankingGold);
	--pedestalHeight: var(--firstStepHeight);
	position: relative;
	isolation: isolate;
	grid-row: 1;
	grid-column: 2;
	min-width: 0;
	text-align: center;

	&[data-rank='2'] {
		--rankColor: var(--MI-rankingSilver);
		--pedestalHeight: var(--secondStepHeight);
		grid-column: 1;
	}

	&[data-rank='3'] {
		--rankColor: var(--MI-rankingBronze);
		--pedestalHeight: var(--thirdStepHeight);
		grid-column: 3;
	}
}

.spotlight {
	position: absolute;
	z-index: -1;
	inset: -48px 0 0;
	overflow: hidden;
	pointer-events: none;
	background: radial-gradient(ellipse at 50% 44%, color-mix(in srgb, var(--rankColor) 17%, transparent), transparent 66%);

	&::before, &::after {
		content: '';
		position: absolute;
		inset: 0;
		clip-path: polygon(46% 0, 54% 0, 100% 100%, 0 100%);
		background: linear-gradient(to bottom, color-mix(in srgb, var(--rankColor) 12%, transparent), color-mix(in srgb, var(--rankColor) 3%, transparent) 65%, transparent);
		transform-origin: 50% 0;
		transform: rotate(-14deg);
	}

	&::after { transform: rotate(14deg); opacity: .7; }
}

.podiumItem[data-rank='1'] .spotlight {
	background: radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--rankColor) 23%, transparent), transparent 68%);
}

.podiumUser {
	position: relative;
	display: flex;
	align-items: center;
	flex-direction: column;
	gap: 16px;
	min-width: 0;
	padding-top: 6px;

	&:hover { text-decoration: none; color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 4px; border-radius: var(--MI-radius); }
}

.podiumAvatarFrame {
	position: relative;
	display: block;
	border: 2px solid color-mix(in srgb, var(--rankColor) 80%, var(--MI_THEME-panel));
	border-radius: 50%;
	padding: 5px;
	background: var(--MI_THEME-panel);
	box-shadow: 0 0 0 5px color-mix(in srgb, var(--rankColor) 9%, transparent), 0 6px 24px color-mix(in srgb, var(--rankColor) 20%, transparent);
}

.podiumAvatar { display: block; width: 60px; height: 60px; }
.podiumItem[data-rank='1'] .podiumAvatar { width: 72px; height: 72px; }

.crown {
	position: absolute;
	z-index: 1;
	bottom: calc(100% + 13px);
	left: 50%;
	transform: translateX(-50%) rotate(-8deg);
	color: var(--rankColor);
	font-size: 34px;
	filter: drop-shadow(0 3px 5px color-mix(in srgb, var(--rankColor) 30%, transparent));
}

.sparkle {
	position: absolute;
	z-index: -1;
	color: var(--rankColor);
	pointer-events: none;
	font-size: 16px;
	opacity: .6;
	animation: sparkleGlow 4s ease-in-out infinite;
}

.sparkleLeft { top: 6%; left: 14%; }
.sparkleRight { top: 24%; right: 10%; font-size: 11px; animation-delay: -2s; }
.podiumItem[data-rank='2'] .sparkle { animation-delay: -1s; }
.podiumItem[data-rank='3'] .sparkle { animation-delay: -3s; }

.podiumName {
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: bold;
	line-height: 1.5;
}

.podiumScore {
	display: flex;
	justify-content: center;
	align-items: baseline;
	gap: 5px;
	min-height: 28px;
	margin: 4px 0 10px;
	font-variant-numeric: tabular-nums;

	b { font-size: clamp(1em, 2.3cqi, 1.5em); overflow-wrap: anywhere; }
	span { flex-shrink: 0; font-size: .75em; color: var(--MI_THEME-fgTransparentWeak); }
}

.pedestal {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	height: var(--pedestalHeight);
	box-sizing: border-box;
	border: 1px solid color-mix(in srgb, var(--rankColor) 35%, var(--MI_THEME-panel));
	border-top: 4px solid color-mix(in srgb, var(--rankColor) 45%, var(--MI_THEME-panel));
	border-radius: var(--MI-radius) var(--MI-radius) 4px 4px;
	background: linear-gradient(105deg, color-mix(in srgb, var(--rankColor) 20%, var(--MI_THEME-panel)), color-mix(in srgb, var(--rankColor) 7%, var(--MI_THEME-panel)) 48%, color-mix(in srgb, var(--rankColor) 23%, var(--MI_THEME-panel)));
	box-shadow: inset 0 1px 0 var(--MI_THEME-panel), 0 8px 16px color-mix(in srgb, var(--rankColor) 8%, transparent);
	color: var(--rankColor);
}

.medal {
	position: relative;
	display: grid;
	place-items: center;
	width: 44px;
	height: 44px;
	border: 1px solid color-mix(in srgb, var(--rankColor) 42%, transparent);
	border-radius: 50%;
	background: linear-gradient(140deg, color-mix(in srgb, var(--rankColor) 5%, var(--MI_THEME-panel)), color-mix(in srgb, var(--rankColor) 28%, var(--MI_THEME-panel)));
	box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--rankColor) 10%, var(--MI_THEME-panel)), 0 3px 8px color-mix(in srgb, var(--rankColor) 15%, transparent);

	span { position: relative; font-size: 1.7em; font-weight: 800; }
	i { position: absolute; inset: 0; display: block; width: 100%; height: 100%; transform: scale(1.5); opacity: .45; }
}

.pedestalLine {
	position: absolute;
	inset: auto 18% 10px;
	height: 1px;
	background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--rankColor) 40%, transparent), transparent);
}

.placeholder {
	display: flex;
	align-items: end;
	justify-content: center;
	gap: 12px;
	min-height: var(--stageHeight);
	padding-bottom: 28px;
	box-sizing: border-box;

	> span { display: flex; align-items: center; flex-direction: column; width: 25%; gap: 24px; }
	i { width: 72px; height: 72px; border-radius: 50%; background: var(--MI_THEME-buttonBg); }
	b { width: 100%; height: var(--secondStepHeight); background: var(--MI_THEME-buttonBg); border-radius: var(--MI-radius) var(--MI-radius) 0 0; }
	> [data-rank='1'] b { height: var(--firstStepHeight); }
	> [data-rank='3'] b { height: var(--thirdStepHeight); }
}

@keyframes sparkleGlow {
	0%, 100% { opacity: .35; transform: scale(.85); }
	50% { opacity: .8; transform: scale(1.1); }
}

@keyframes loadingSpin { to { transform: rotate(360deg); } }

.still .sparkle, .still .loadingStatus > i { animation: none; }

@media (prefers-reduced-motion: reduce) {
	.sparkle, .loadingStatus > i { animation: none; }
}

.list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.row {
	display: flex;
	align-items: center;
	gap: 18px;
	padding: 16px 14px;
	border-top: var(--MI-divider);

	&.me { background: var(--MI_THEME-accentedBg); border-radius: var(--MI-radius); }
}

.rank {
	flex: 0 0 32px;
	text-align: center;
	font-size: 1.15em;
	font-weight: bold;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
}

.user {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
	flex: 1;

	&:hover { text-decoration: none; color: var(--MI_THEME-accent); }
}

.avatar { width: 42px; height: 42px; flex-shrink: 0; }
.userName { min-width: 0; font-weight: bold; }
.userName > * { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.username { margin-top: 4px; color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; font-weight: normal; }

.value {
	display: flex;
	align-items: flex-end;
	flex-direction: column;
	gap: 4px;
	max-width: 35%;
	text-align: end;
	font-variant-numeric: tabular-nums;

	b { overflow-wrap: anywhere; }
	span { color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; }
}

.more {
	width: 100%;
	padding: 18px;
	border-top: var(--MI-divider);
	color: var(--MI_THEME-accent);

	&:hover { background: var(--MI_THEME-buttonHoverBg); }
}

.empty { box-sizing: border-box; min-height: var(--stageHeight); padding: 64px 16px; text-align: center; color: var(--MI_THEME-fgTransparentWeak); }
.empty > i { font-size: 36px; }
.empty h2 { font-size: 1.1em; }
.empty p { font-size: .85em; }
.error { padding: 0; color: var(--MI_THEME-error); }

.footnote {
	display: flex;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px 16px;
	margin-top: 16px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .75em;
	line-height: 1.6;
}

@container (max-width: 600px) {
	.hero { padding: 20px 12px 0; }
	.hero h1 { font-size: 1.5em; }
	.hero p { font-size: .85em; }
	.tabs { gap: 0; }
	.tab { flex: 1; gap: 4px; padding: 12px 4px; font-size: .85em; }
	.body { --stageHeight: 300px; padding: 16px 12px; }
	.podium { gap: 6px; padding: 44px 0 10px; }
	.podiumAvatar { width: 46px; height: 46px; }
	.podiumItem[data-rank='1'] .podiumAvatar { width: 58px; height: 58px; }
	.podiumAvatarFrame { padding: 3px; border-width: 2px; }
	.podiumName { font-size: .85em; }
	.podiumScore { gap: 3px; flex-direction: column; align-items: center; min-height: 36px; margin-bottom: 8px; }
	.podiumScore b { font-size: clamp(.9em, 4cqi, 1.05em); }
	.medal { width: 36px; height: 36px; }
	.medal span { font-size: 1.4em; }
	.crown { font-size: 28px; }
	.sparkleLeft { left: 2%; }
	.sparkleRight { right: 0; }
	.placeholder i { width: 58px; height: 58px; }
	.row { gap: 8px; padding: 14px 4px; }
	.rank { flex-basis: 24px; }
	.user { gap: 8px; }
	.avatar { width: 34px; height: 34px; }
	.userName, .value { font-size: .9em; }
}
</style>
