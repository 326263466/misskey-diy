<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCommunityHub active="ranking">
	<section class="_panel _juejinCard" :class="$style.panel">
		<header :class="$style.hero">
			<div :class="$style.heading"><h1>{{ i18n.ts.communityRanking }}</h1><MkA to="/checkin" class="_buttonPrimary" :class="$style.checkinLink"><i class="ti ti-calendar-check" aria-hidden="true"></i> {{ checkedInToday ? i18n.ts._checkin.checkedIn : i18n.ts._checkin.goCheckin }}</MkA></div>
			<p>{{ i18n.ts._checkin.rankingDescription }}</p>
			<div :class="$style.tabs" role="group" :aria-label="i18n.ts.communityRanking">
				<button v-for="item in tabs" :key="item.key" type="button" class="_button" :class="[$style.tab, { [$style.selected]: type === item.key }]" :aria-pressed="type === item.key" @click="changeType(item.key)">{{ item.title }}</button>
			</div>
		</header>
		<div :class="$style.body" :aria-busy="loading">
			<div :class="$style.summary"><h2>{{ title }}</h2><span v-if="$i && ranking" :class="$style.myRank">{{ i18n.ts._checkin.myRank }} <b>{{ ranking.myRank ? ranking.myRank.rank : i18n.ts._checkin.notRanked }}</b></span><span v-if="updatedAt" :class="$style.updated">{{ i18n.tsx._checkin.updatedAt({ time: updatedAt }) }}</span></div>
			<p v-if="!$i" :class="$style.notice">{{ i18n.ts._checkin.signInPrompt }}</p>
			<p v-else-if="ranking && !ranking.myRank" :class="$style.notice">{{ i18n.ts._checkin.notRankedHelp }}</p>
			<div v-if="error" role="alert" :class="$style.error">{{ i18n.ts._checkin.loadFailed }} <button class="_textButton" :disabled="loading" @click="load(failedOffset)">{{ i18n.ts.retry }}</button></div>
			<MkLoading v-if="loading && !ranking"/>
			<div v-else-if="ranking && ranking.items.length === 0" :class="$style.empty"><i class="ti ti-calendar" aria-hidden="true"></i><h3>{{ i18n.ts._checkin.noEntries }}</h3><p>{{ i18n.ts._checkin.noEntriesDescription }}</p></div>
			<div v-else-if="ranking" :class="$style.tableCard">
				<table :class="$style.table">
					<thead><tr><th scope="col">{{ i18n.ts.ranking }}</th><th scope="col">{{ i18n.ts.user }}</th><th scope="col">{{ metric }}</th><th scope="col">{{ i18n.ts.operations }}</th></tr></thead>
					<tbody>
						<tr v-for="item in ranking.items" :key="item.user.id" :class="{ [$style.me]: item.user.id === $i?.id }">
							<td :class="[$style.rank, { [$style.leading]: item.rank <= 3 }]" :data-rank="item.rank">{{ item.rank }}</td>
							<td><div :class="$style.user"><MkAvatar :user="item.user" :class="$style.avatar"/><MkA :to="userPage(item.user)" :class="$style.userName"><MkUserName :user="item.user"/></MkA></div></td>
							<td :class="$style.days">{{ i18n.tsx._checkin.days({ n: item.days }) }}</td>
							<td :class="$style.follow"><MkFollowButton v-if="item.user.id !== $i?.id" :user="item.user" full/></td>
						</tr>
					</tbody>
				</table>
				<button v-if="hasMore" class="_button" :class="$style.more" :disabled="loading" @click="load(nextOffset)">{{ loading ? i18n.ts.loading : i18n.ts.loadMore }}</button>
			</div>
			<footer :class="$style.footnote"><p>{{ i18n.ts._checkin.rankingFootnote }}</p><p>{{ i18n.ts._checkin.rankingRule }}</p><p>{{ i18n.ts._checkin.privacyRule }}</p></footer>
		</div>
	</section>
</MkCommunityHub>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import { versatileLang } from '@@/js/intl-const.js';
import MkCommunityHub from '@/components/MkCommunityHub.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { userPage } from '@/filters/user.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { DI } from '@/di.js';
import { useCheckinStatus } from '@/composables/use-checkin-status.js';

const { checkedInToday } = useCheckinStatus();
type RankingType = 'consecutive' | 'total' | 'monthly';
const type = ref<RankingType>('consecutive');
const ranking = ref<entities.CheckinRankingResponse | null>(null);
const loading = ref(false);
const error = ref(false);
const hasMore = ref(false);
const updatedAt = ref('');
const nextOffset = ref(0);
const pageActive = inject(DI.pageActive, ref(true));
let request = 0;
let failedOffset = 0;
let active = true;
const tabs = computed(() => [
	{ key: 'consecutive' as const, title: i18n.ts._checkin.consecutiveRanking },
	{ key: 'total' as const, title: i18n.ts._checkin.totalRanking },
	{ key: 'monthly' as const, title: i18n.ts._checkin.monthlyRanking },
]);
const title = computed(() => tabs.value.find(tab => tab.key === type.value)!.title);
const metric = computed(() => type.value === 'consecutive' ? i18n.ts._checkin.consecutiveDays : type.value === 'total' ? i18n.ts._checkin.totalDays : i18n.ts._checkin.monthlyRanking);

async function load(offset = 0) {
	const sequence = ++request;
	const requestedType = type.value;
	failedOffset = offset;
	loading.value = true;
	error.value = false;
	try {
		const result = await misskeyApi('checkin/ranking', { type: requestedType, offset, limit: 20 });
		if (sequence !== request) return;
		// A new server date may invalidate the old pages, especially at a month boundary.
		if (offset > 0 && ranking.value && result.today !== ranking.value.today) { void load(); return; }
		const items = offset === 0 ? result.items : [...ranking.value!.items, ...result.items];
		ranking.value = { ...result, items: [...new Map(items.map(item => [item.user.id, item])).values()] };
		nextOffset.value = offset + result.items.length;
		hasMore.value = result.items.length === 20 && nextOffset.value < 100;
		updatedAt.value = new Intl.DateTimeFormat(versatileLang, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: result.timeZone }).format(new Date());
	} catch {
		if (sequence === request) error.value = true;
	} finally {
		if (sequence === request) loading.value = false;
	}
}

function changeType(value: RankingType) {
	if (value === type.value) return;
	type.value = value;
	ranking.value = null;
	updatedAt.value = '';
	void load();
}

function refresh() { if (active && pageActive.value && window.document.visibilityState !== 'hidden' && !loading.value) void load(); }

watch(pageActive, value => { if (value && ranking.value) refresh(); });
onMounted(() => { void load(); window.addEventListener('focus', refresh); });
onActivated(() => { active = true; if (ranking.value) refresh(); });
onDeactivated(() => { active = false; });
onUnmounted(() => { request++; window.removeEventListener('focus', refresh); });

definePage(() => ({ title: i18n.ts.communityRanking, icon: 'ti ti-trophy', needWideArea: true }));
</script>

<style lang="scss" module>
@use "../styles/community.scss";

.panel {
	overflow: hidden;
	font-size: var(--MI-communityBodyFontSize, 14px);
	background: radial-gradient(ellipse at top right, color-mix(in srgb, var(--MI_THEME-accent) 13%, transparent), transparent 65%), var(--MI_THEME-panel);
}
.hero { padding: var(--MI-cardPadding) var(--MI-cardPadding) 0; }
.heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.heading h1 { margin: 0; font-size: 30px; font-weight: 750; line-height: 1.4; }
.hero p { color: var(--MI_THEME-fgTransparentWeak); line-height: 1.7; margin: 12px 0 24px; }
.checkinLink { display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding: 8px 12px; font-size: var(--MI-communityBodyFontSize, 14px); border-radius: var(--MI-radius); text-decoration: none; }
.checkinLink:hover { text-decoration: none; }
.tabs { display: flex; flex-wrap: wrap; gap: 16px; }
.tab { padding: 9px 18px; border: 1px solid var(--MI_THEME-divider); border-radius: 999px; background: var(--MI_THEME-panel); font-size: var(--MI-communityBodyFontSize, 14px); line-height: 1.4; }
.tab:hover { background: var(--MI_THEME-buttonHoverBg); }
.tab.selected { color: var(--MI_THEME-accent); border-color: color-mix(in srgb, var(--MI_THEME-accent) 30%, transparent); background: var(--MI_THEME-accentedBg); font-weight: bold; }
.tab:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.body { padding: var(--MI-cardPadding); }
.summary { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 18px; }
.summary h2 { margin: 0; font-size: 24px; font-weight: 750; line-height: 1.4; }
.myRank { padding: 6px 10px; border-radius: 999px; background: var(--MI_THEME-panel); }
.myRank b { color: var(--MI_THEME-accent); margin-left: 6px; }
.updated { margin-left: auto; font-size: 12px; color: var(--MI_THEME-fgTransparentWeak); }
.notice, .footnote { line-height: 1.7; color: var(--MI_THEME-fgTransparentWeak); }
.notice { margin: 0 0 16px; }
.tableCard { overflow: hidden; border-radius: calc(var(--MI-radius) * 2); background: var(--MI_THEME-panel); }
.table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.table th { padding: 16px 12px; text-align: start; font-weight: normal; color: var(--MI_THEME-fgTransparentWeak); }
.table th:first-child { width: 64px; text-align: center; }
.table th:nth-child(3) { width: 100px; text-align: end; }
.table th:last-child { width: 88px; text-align: center; }
.table td { height: 40px; border-top: 1px solid var(--MI_THEME-divider); padding: 16px 12px; }
.rank { font-size: 24px; font-weight: bold; text-align: center; color: var(--MI_THEME-fgTransparentWeak); font-variant-numeric: tabular-nums; }
.rank.leading { color: var(--MI_THEME-warn); }
.rank.leading[data-rank='1'] { color: var(--MI_THEME-error); }
.rank.leading[data-rank='2'] { color: color-mix(in srgb, var(--MI_THEME-error) 55%, var(--MI_THEME-warn)); }
.user { display: flex; align-items: center; gap: 12px; min-width: 0; }
.avatar { width: 40px; height: 40px; flex-shrink: 0; }
.userName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--MI-communityBodyFontSize, 14px); font-weight: bold; }
.days { text-align: end; font-size: var(--MI-communityBodyFontSize, 14px); font-weight: bold; font-variant-numeric: tabular-nums; }
.follow { text-align: center; }
.follow :global(button) { max-width: 100%; font-size: var(--MI-communityBodyFontSize, 14px); border-radius: var(--MI-cardRadius); }
.me { background: color-mix(in srgb, var(--MI_THEME-accent) 5%, var(--MI_THEME-panel)); }
.more { width: 100%; padding: 16px; border-top: 1px solid var(--MI_THEME-divider); color: var(--MI_THEME-accent); }
.more:hover { background: var(--MI_THEME-buttonHoverBg); }
.empty { text-align: center; padding: 48px 12px; color: var(--MI_THEME-fgTransparentWeak); }
.empty > i { font-size: 36px; }
.empty h3 { font-size: 18px; }
.empty p { font-size: var(--MI-communityBodyFontSize, 14px); }
.error { @include community.error; }
.footnote { font-size: 12px; margin-top: 20px; }
.footnote p { margin: 4px 0; }
@container (max-width: 600px) {
	.heading { flex-wrap: wrap; }
	.heading h1 { font-size: 26px; }
	.summary h2 { font-size: 20px; }
	.tabs { gap: 8px; }
	.tab { padding: 8px 12px; }
	.table th:first-child { width: 30px; }
	.table th:nth-child(3) { width: 60px; }
	.table th:last-child { width: 52px; }
	.table td, .table th { padding: 14px 4px; }
	.rank { font-size: 20px; }
	.follow :global(button) { padding: 6px 8px; min-width: 0; }
	.follow :global(button > span) { display: none; }
	.user { gap: 8px; }
	.avatar { width: 30px; height: 30px; }
	.updated { width: 100%; margin-left: 0; }
}
</style>
