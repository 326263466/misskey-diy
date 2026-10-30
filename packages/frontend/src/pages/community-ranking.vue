<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader class="_standalonePage" :class="[$style.page, { [$style.still]: !prefer.s.animation }]" hideHeader>
	<header class="_panel" :class="$style.head">
		<div :class="$style.headRow">
			<i class="ti ti-trophy" :class="$style.headIcon" aria-hidden="true"></i>
			<div :class="$style.headText">
				<h1>{{ i18n.ts.communityRanking }}</h1>
				<p>{{ i18n.ts._communityRanking.description }}</p>
			</div>
			<span v-if="$i && ranking" :class="$style.myRank">{{ i18n.ts._communityRanking.myRank }} <b>{{ ranking.myRank ? i18n.tsx._communityRanking.rankLabel({ rank: ranking.myRank.rank }) : i18n.ts._communityRanking.notRanked }}</b></span>
			<button v-else-if="!$i" type="button" class="_button" :class="$style.loginPrompt" @click="pleaseLogin({ message: '' })">
				{{ i18n.ts._communityRanking.signInPrompt }}<i class="ti ti-login-2" aria-hidden="true"></i>
			</button>
		</div>
		<nav :class="$style.tabs" :aria-label="i18n.ts.communityRanking">
			<MkA v-for="tab in tabs" :key="tab.key" :to="`/community-ranking?type=${tab.key}`" :class="[$style.tab, { [$style.selected]: type === tab.key }]" :aria-current="type === tab.key ? 'page' : undefined">
				<span>{{ tab.title }}</span>
			</MkA>
		</nav>
	</header>
	<div :class="$style.results" :aria-busy="loading">
		<div :class="$style.summary">
			<p>{{ displayedTab.rule }}</p>
			<span v-if="loading && nextOffset === 0" role="status" :class="$style.loadingStatus"><i class="ti ti-loader-2" aria-hidden="true"></i>{{ selectedTab.title }} · {{ i18n.ts.loading }}</span>
			<div v-if="error" role="alert" :class="$style.error">{{ i18n.ts._communityRanking.loadFailed }} <button type="button" class="_textButton" :disabled="loading" @click="load(failedOffset)">{{ i18n.ts.retry }}</button></div>
		</div>
		<div v-if="!ranking" class="_panel" :class="[$style.card, $style.placeholder]" aria-hidden="true"><span v-for="place in [2, 1, 3]" :key="place" :data-rank="place"><i></i><b></b></span></div>
		<div v-else-if="ranking.items.length === 0" class="_panel" :class="[$style.card, $style.empty]"><i class="ti ti-trophy" aria-hidden="true"></i><h2>{{ i18n.ts._communityRanking.noEntries }}</h2><p>{{ i18n.ts._communityRanking.noEntriesDescription }}</p></div>
		<template v-else>
			<ol v-if="podium.length > 0" class="_panel" :class="[$style.card, $style.podium]" :aria-label="i18n.ts._communityRanking.podium">
				<li v-for="item in podium" :key="item.rank" :value="item.rank" :class="$style.podiumItem" :data-rank="item.rank">
					<MkA :to="userPage(item.user)" :class="$style.podiumUser">
						<span :class="$style.podiumAvatarFrame"><i v-if="item.rank === 1" class="ti ti-crown" :class="$style.crown" aria-hidden="true"></i><MkAvatar :user="item.user" :link="false" :class="$style.podiumAvatar"/></span>
						<MkUserName :user="item.user" :class="$style.podiumName"/>
					</MkA>
					<div :class="[$style.podiumScore, { [$style.points]: displayedTab.key === 'points' }]" :title="`${formatValue(item.value)} ${displayedTab.unit}`"><i v-if="displayedTab.key === 'points'" class="ti ti-coins" aria-hidden="true"></i><b>{{ formatValue(item.value) }}</b><span>{{ displayedTab.unit }}</span></div>
					<div :class="$style.pedestal"><span :aria-label="i18n.tsx._communityRanking.rankLabel({ rank: item.rank })">{{ item.rank }}</span></div>
				</li>
			</ol>
			<div v-if="remaining.length > 0" class="_panel" :class="$style.card">
				<ol :class="$style.list" start="4" :aria-label="displayedTab.title">
					<li v-for="item in remaining" :key="item.user.id" :value="item.rank" :class="[$style.row, { [$style.me]: item.user.id === $i?.id }]">
						<span :class="$style.rank" :aria-label="i18n.tsx._communityRanking.rankLabel({ rank: item.rank })">{{ item.rank }}</span>
						<MkA :to="userPage(item.user)" :class="$style.user"><MkAvatar :user="item.user" :link="false" :class="$style.avatar"/><span :class="$style.userName"><MkUserName :user="item.user"/><span :class="$style.username">@{{ item.user.username }}</span></span></MkA>
						<div :class="[$style.value, { [$style.points]: displayedTab.key === 'points' }]"><i v-if="displayedTab.key === 'points'" class="ti ti-coins" aria-hidden="true"></i><b>{{ formatValue(item.value) }}</b><span>{{ displayedTab.unit }}</span></div>
					</li>
				</ol>
				<div v-if="hasMore && !loading && !error && active && pageActive" v-appear="() => load(nextOffset)" :class="$style.sentinel" aria-hidden="true"></div>
				<MkLoading v-if="loading && nextOffset > 0" :class="$style.loadingMore"/>
			</div>
		</template>
		<footer :class="$style.footnote"><span>{{ i18n.ts._communityRanking.rule }}</span><time v-if="ranking && updatedAt" :datetime="ranking.updatedAt">{{ i18n.tsx._communityRanking.updatedAt({ time: updatedAt }) }}</time></footer>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import { versatileLang } from '@@/js/intl-const.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { userPage } from '@@/js/user.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { DI } from '@/di.js';
import { prefer } from '@/preferences.js';
import { usePageHistoryRestore } from '@/composables/use-page-history-restore.js';

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
const historyRestoring = usePageHistoryRestore();
const podium = computed(() => ranking.value?.items.filter(item => item.rank <= 3) ?? []);
const remaining = computed(() => ranking.value?.items.filter(item => item.rank > 3) ?? []);
const numberFormat = new Intl.NumberFormat(versatileLang, { maximumFractionDigits: 2 });
const pointsFormat = new Intl.NumberFormat(versatileLang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat(versatileLang, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const updatedAt = computed(() => ranking.value ? dateFormat.format(new Date(ranking.value.updatedAt)) : '');
let request = 0;
let failedOffset = 0;
let interrupted = false;
const active = ref(true);

function formatValue(value: number) {
	return displayedTab.value.key === 'points' ? pointsFormat.format(value) : numberFormat.format(value);
}

async function load(offset = 0) {
	if (!active.value || !pageActive.value || loading.value) return;
	if (offset > 0 && (!hasMore.value || ranking.value?.type !== type.value)) return;
	const sequence = ++request;
	const requestedType = type.value;
	interrupted = false;
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
	interrupted ||= loading.value;
	request++;
	loading.value = false;
}

function refresh() {
	if (active.value && pageActive.value && window.document.visibilityState !== 'hidden' && !loading.value) void load();
}

function refreshOnActivation() {
	if (historyRestoring.value && ranking.value?.type === type.value && ranking.value.items.length > 0) {
		if (error.value || interrupted) void load(failedOffset);
		return;
	}
	refresh();
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
watch(pageActive, value => { if (value) refreshOnActivation(); else invalidateRequest(); });
onMounted(() => { window.addEventListener('focus', refresh); });
onActivated(() => { if (!active.value) { active.value = true; refreshOnActivation(); } });
onDeactivated(() => { active.value = false; invalidateRequest(); });
onUnmounted(() => { active.value = false; invalidateRequest(); window.removeEventListener('focus', refresh); });

definePage(() => ({ title: i18n.ts.communityRanking, icon: 'ti ti-trophy' }));
</script>

<style lang="scss" module>
.page {
	--MI-pageHeaderBg: transparent;
}

.head {
	margin-bottom: var(--MI-margin);
}

.headRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px 14px;
	padding: 18px var(--MI-cardPadding) 14px;
}

.headIcon {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 44px;
	height: 44px;
	padding: 10px;
	box-sizing: border-box;
	border-radius: 50%;
	background: color-mix(in srgb, var(--MI-rankingGold) 14%, var(--MI_THEME-panel));
	color: var(--MI-rankingGold);
	font-size: 24px;
}

.headText {
	flex: 1 1 200px;
	min-width: 0;

	h1 { margin: 0; font-size: 1.3em; line-height: 1.4; }
	p { margin: 2px 0 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; line-height: 1.5; }
}

.myRank {
	flex-shrink: 0;
	padding: 6px 12px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
	white-space: nowrap;

	b { margin-left: 6px; color: var(--MI_THEME-accent); }
}

.loginPrompt {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 12px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: .85em;
	white-space: nowrap;

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}

.tabs {
	display: flex;
	gap: 4px;
	padding: 0 calc(var(--MI-cardPadding) - 12px);
	border-top: var(--MI-divider);
	overflow-x: auto;
	scrollbar-width: none;
}

.tab {
	flex-shrink: 0;
	padding: 12px;
	border-bottom: 2px solid transparent;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;

	&:hover { text-decoration: none; color: var(--MI_THEME-fg); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
	&.selected { color: var(--MI_THEME-accent); border-bottom-color: var(--MI_THEME-accent); font-weight: bold; }
}
.results {
	--stageHeight: 280px;
	--firstStepHeight: 64px;
	--secondStepHeight: 48px;
	--thirdStepHeight: 36px;
	container-type: inline-size;
	padding-bottom: var(--MI-pageBottomInset, var(--MI-pageGap));
}

.summary {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 4px 12px;
	min-height: 22px;
	margin: 0 4px 10px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
	line-height: 1.6;

	p { flex: 1; margin: 0; }
}

.loadingStatus {
	display: flex;
	align-items: center;
	gap: 6px;

	> i { animation: loadingSpin 1.2s linear infinite; }
}

.error { color: var(--MI_THEME-error); }

.card {
	margin-bottom: var(--MI-margin);
}

.podium {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	align-items: end;
	gap: 16px;
	min-height: var(--stageHeight);
	margin-top: 0;
	padding: 40px clamp(16px, 6cqi, 64px) 0;
	list-style: none;
}

.podiumItem {
	--rankColor: var(--MI-rankingGold);
	--rankInk: color-mix(in srgb, var(--rankColor) 55%, var(--MI_THEME-fg));
	--pedestalHeight: var(--firstStepHeight);
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

.podiumUser {
	display: flex;
	align-items: center;
	flex-direction: column;
	gap: 10px;
	min-width: 0;

	&:hover { text-decoration: none; color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 4px; border-radius: var(--MI-radius); }
}

.podiumAvatarFrame {
	position: relative;
	display: block;
	padding: 3px;
	border: 2px solid var(--rankColor);
	border-radius: 50%;
}

.podiumAvatar { display: block; width: 56px; height: 56px; }
.podiumItem[data-rank='1'] .podiumAvatar { width: 68px; height: 68px; }

.crown {
	position: absolute;
	bottom: calc(100% + 2px);
	left: 50%;
	transform: translateX(-50%) rotate(-8deg);
	color: var(--rankColor);
	font-size: 28px;
}
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
	justify-content: safe center;
	align-items: center;
	gap: 4px;
	max-width: 100%;
	overflow-x: auto;
	scrollbar-width: none;
	margin: 2px 0 12px;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;

	b { font-size: clamp(1em, 2.4cqi, 1.3em); }
	span { flex-shrink: 0; font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
}

// 积分与集市价格同样式：金币图标、强调色数字。
.points {
	color: var(--MI_THEME-accent);

	> i { display: inline-flex; align-items: center; flex-shrink: 0; line-height: 1; }
	b { font-weight: 600; }
	span { color: var(--MI_THEME-fgTransparentWeak); }
}

.pedestal {
	display: grid;
	place-items: center;
	height: var(--pedestalHeight);
	border-radius: var(--MI-radius) var(--MI-radius) 0 0;
	// 奖座自上而下由深转浅，形成体积感。
	background: linear-gradient(
		to bottom,
		color-mix(in srgb, var(--rankColor) 30%, var(--MI_THEME-panel)),
		color-mix(in srgb, var(--rankColor) 8%, var(--MI_THEME-panel))
	);
	color: var(--rankInk);
	font-size: 1.4em;
	font-weight: 800;
	font-variant-numeric: tabular-nums;
}

.placeholder {
	display: flex;
	align-items: end;
	justify-content: center;
	gap: 16px;
	min-height: var(--stageHeight);
	padding: 40px clamp(16px, 6cqi, 64px) 0;

	> span { display: flex; align-items: center; flex-direction: column; flex: 1; gap: 48px; }
	i { width: 62px; height: 62px; border-radius: 50%; background: var(--MI_THEME-buttonBg); }
	b { width: 100%; height: var(--secondStepHeight); background: var(--MI_THEME-buttonBg); border-radius: var(--MI-radius) var(--MI-radius) 0 0; }
	> [data-rank='1'] b { height: var(--firstStepHeight); }
	> [data-rank='3'] b { height: var(--thirdStepHeight); }
}

.empty {
	min-height: var(--stageHeight);
	padding: 64px 16px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);

	> i { font-size: 36px; }
	h2 { font-size: 1.1em; }
	p { font-size: .85em; }
}
.list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.row {
	position: relative;
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 12px var(--MI-cardPadding);
	background: var(--MI_THEME-panel);
	transition: background-color .18s ease, box-shadow .18s ease;

	& + & { border-top: var(--MI-divider); }
	&.me { background: color-mix(in srgb, var(--MI_THEME-accentedBg) 35%, var(--MI_THEME-panel)); }

	&:is(:hover, :focus-within) {
		z-index: 1;
		background: var(--MI_THEME-panelHighlight);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--MI_THEME-shadow) 35%, transparent);
	}

	&:active { background: color-mix(in srgb, var(--MI_THEME-panelHighlight) 72%, var(--MI_THEME-panel)); }
}

.rank {
	flex: 0 0 28px;
	text-align: center;
	font-size: 1.05em;
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

	&:hover { text-decoration: none; color: inherit; }
}

.avatar { width: 40px; height: 40px; flex-shrink: 0; }
.userName { min-width: 0; font-weight: bold; }
.userName > * { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.username { margin-top: 2px; color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; font-weight: normal; }

.value {
	display: flex;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;

	span { flex-shrink: 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
}

.sentinel { height: 1px; }
.loadingMore { padding: 18px; }

.footnote {
	display: flex;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 4px 16px;
	margin: 0 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .8em;
	line-height: 1.6;
}

@keyframes loadingSpin { to { transform: rotate(360deg); } }

.still .loadingStatus > i { animation: none; }
.still .row { transition: none; }

@media (prefers-reduced-motion: reduce) {
	.loadingStatus > i { animation: none; }
	.row { transition: none; }
}

@container (max-width: 600px) {
	.podium, .placeholder { gap: 8px; padding-inline: 12px; }
	.podiumAvatar { width: 44px; height: 44px; }
	.podiumItem[data-rank='1'] .podiumAvatar { width: 54px; height: 54px; }
	.podiumName { font-size: .85em; }
	.podiumScore { gap: 3px; font-size: clamp(12px, 3cqi, 14px); }
	.podiumScore b { font-size: 1em; }
	.crown { font-size: 24px; }
	.placeholder i { width: 50px; height: 50px; }
	.row { gap: 10px; padding-inline: 12px; }
	.rank { flex-basis: 22px; }
	.user { gap: 8px; }
	.avatar { width: 34px; height: 34px; }
	.userName, .value { font-size: .9em; }
}
</style>
