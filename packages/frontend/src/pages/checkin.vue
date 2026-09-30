<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCommunityHub active="checkin">
	<section class="_panel _juejinCard" :class="$style.panel" :aria-busy="loading || posting">
		<header :class="$style.header">
			<h1>{{ i18n.ts._checkin.dailyCheckin }}</h1>
			<button class="_textButton" @click="showRules"><i class="ti ti-help-circle" aria-hidden="true"></i> {{ i18n.ts._checkin.rules }}</button>
		</header>
		<div :class="$style.body">
			<div v-if="error" role="alert" :class="$style.error">{{ error }} <button v-if="!posting" class="_textButton" @click="retry">{{ i18n.ts.retry }}</button></div>
			<p v-if="notice" role="status" :class="$style.notice">{{ notice }}</p>
			<div :class="$style.dashboard">
				<div :class="$style.calendarColumn">
					<MkLoading v-if="!status && loading"/>
					<template v-if="status">
						<dl :class="$style.stats">
							<div><dt>{{ i18n.ts._checkin.consecutiveDays }}</dt><dd>{{ status.consecutiveDays }}</dd></div>
							<div><dt>{{ i18n.ts._checkin.totalDays }}</dt><dd>{{ status.totalDays }}</dd></div>
							<div><dt>{{ i18n.ts._checkin.monthlyDays }}</dt><dd>{{ status.monthlyDays }}</dd></div>
						</dl>
						<section :aria-label="i18n.ts._checkin.calendar">
							<div :class="$style.monthNav">
								<div :class="$style.monthControls">
									<button type="button" class="_button" :class="$style.monthButton" :aria-label="i18n.ts._checkin.previousMonth" :disabled="loading || posting || status.month <= '1900-01'" @click="load(shiftCheckinMonth(status.month, -1))"><i class="ti ti-caret-left-filled" aria-hidden="true"></i></button>
									<h2 data-testid="checkin-month">{{ monthLabel }}</h2>
									<button type="button" class="_button" :class="$style.monthButton" :aria-label="i18n.ts._checkin.nextMonth" :disabled="loading || posting || status.month >= '2199-12'" @click="load(shiftCheckinMonth(status.month, 1))"><i class="ti ti-caret-right-filled" aria-hidden="true"></i></button>
									<button v-if="status.month !== status.today.slice(0, 7)" type="button" class="_textButton" :class="$style.thisMonth" :disabled="loading || posting" @click="load()">{{ i18n.ts._checkin.currentMonth }}</button>
								</div>
								<div :class="$style.cardCount">
									<i class="ti ti-ticket" aria-hidden="true"></i>
									<I18n :src="i18n.ts._checkin.makeupCardsCount"><template #n><span :class="$style.cardAmount" data-testid="checkin-makeup-cards">{{ status.makeupCards }}</span></template></I18n>
								</div>
							</div>
							<div :class="$style.calendar" data-testid="checkin-calendar">
								<div v-for="weekday in weekdays" :key="weekday" :class="$style.weekday">{{ weekday }}</div>
								<template v-for="(date, index) in dates" :key="date ?? `empty-${index}`">
									<div v-if="date" role="group" :class="[$style.day, { [$style.completed]: checkedDates.has(date), [$style.today]: date === status.today, [$style.future]: date > status.today, [$style.unavailable]: date < status.registeredDate }]" :aria-label="i18n.tsx._checkin.dateState({ date, state: dayState(date) })" :aria-current="date === status.today ? 'date' : undefined" :data-checkin-date="date">
										<i v-if="checkedDates.has(date)" class="ti ti-check" :class="$style.completedMark" aria-hidden="true"></i>
										<time :datetime="date" :class="$style.dayNumber">{{ Number(date.slice(-2)) }}</time>
										<span v-if="checkedDates.has(date) || date > status.today" :class="$style.dayReward" :aria-label="i18n.tsx._checkin.pointsEarned({ n: 1 })"><i class="ti ti-diamond-filled" aria-hidden="true"></i><span aria-hidden="true">+1</span></span>
										<button v-else-if="canMakeup(date)" type="button" class="_button" :class="$style.makeup" :aria-label="i18n.tsx._checkin.makeupDate({ date })" :disabled="loading || posting" @click="makeUp(date)">{{ i18n.ts._checkin.pendingMakeup }}</button>
										<span v-else :class="$style.dayCaption">{{ date < status.registeredDate ? i18n.ts._checkin.beforeRegistration : date === status.today ? i18n.ts._checkin.todayLabel : i18n.ts._checkin.missed }}</span>
									</div>
									<div v-else aria-hidden="true"></div>
								</template>
							</div>
						</section>
						<p :class="$style.note">{{ i18n.ts._checkin.makeupRule }}</p>
					</template>
				</div>
				<div :class="$style.actionColumn">
					<button ref="checkinButton" type="button" class="_button" :class="[$style.checkin, { [$style.checkedIn]: status?.checkedInToday }]" :disabled="!status || loading || posting" data-testid="checkin-submit" @click="checkIn">
						{{ pendingOperation === 'checkin' ? i18n.ts._checkin.checkingIn : status?.checkedInToday ? i18n.ts._checkin.checkedIn : i18n.ts._checkin.checkIn }}
					</button>
					<div v-if="status" :class="$style.rewards">
						<p :class="$style.rewardHint">{{ i18n.ts._checkin.dailyReward }}</p>
						<dl :class="$style.balances">
							<div><dt><i class="ti ti-coin" aria-hidden="true"></i> {{ i18n.ts._checkin.points }}</dt><dd data-testid="checkin-points">{{ status.points }}</dd></div>
						</dl>
						<p data-testid="checkin-card-progress">{{ i18n.tsx._checkin.cardRewardProgress({ current: status.makeupCardProgress, target: status.makeupCardTarget }) }}</p>
						<progress :class="$style.cardProgress" :value="status.makeupCardProgress" :max="status.makeupCardTarget" :aria-label="i18n.tsx._checkin.cardRewardProgress({ current: status.makeupCardProgress, target: status.makeupCardTarget })"></progress>
						<p>{{ i18n.tsx._checkin.cardRewardRule({ target: status.makeupCardTarget }) }}</p>
						<button type="button" class="_button" :class="$style.exchange" :disabled="loading || posting" data-testid="checkin-exchange" @click="exchangeCard()"><i class="ti ti-ticket" aria-hidden="true"></i> {{ pendingOperation === 'exchange' ? i18n.ts._checkin.exchangingCard : i18n.ts._checkin.exchangeCard }}</button>
					</div>
					<div v-if="status" :class="$style.dateCard">
						<div :class="$style.dateVisual">
							<span :class="$style.dateCaption">{{ i18n.ts.today }}</span>
							<time :datetime="status.today" :class="$style.date"><strong>{{ Number(status.today.slice(-2)) }}</strong><span>{{ todayLabel }}</span></time>
						</div>
						<div :class="$style.dateMessage">
							<h2>{{ i18n.ts._checkin.description }}</h2>
							<p>{{ i18n.tsx._checkin.rulesDescription({ timeZone: status.timeZone }) }}</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>
	<section v-if="status" class="_panel _juejinCard" :class="$style.achievements">
		<header :class="$style.header"><h2>{{ i18n.ts._checkin.checkinAchievements }}</h2><MkA to="/my/achievements" class="_link">{{ i18n.ts._checkin.allAchievements }} <i class="ti ti-chevron-right" aria-hidden="true"></i></MkA></header>
		<div :class="$style.milestones">
			<article v-for="milestone in milestones" :key="milestone.name" :class="[$style.milestone, { [$style.unlocked]: earned.has(milestone.name) }]">
				<MkAchievementBadge :name="milestone.name" :class="$style.medal"/>
				<div :class="$style.milestoneBody">
					<h3>{{ i18n.ts._achievements._types[`_${milestone.name}`].title }}</h3>
					<p>{{ i18n.ts._achievements._types[`_${milestone.name}`].description }}</p>
					<span v-if="earned.has(milestone.name)" :class="$style.earned">{{ i18n.ts._checkin.earned }}</span>
					<template v-else><progress :max="milestone.target" :value="Math.min(status[milestone.metric], milestone.target)" :aria-label="i18n.ts._achievements._types[`_${milestone.name}`].title"></progress><span :class="$style.progress">{{ i18n.tsx._checkin.progress({ current: Math.min(status[milestone.metric], milestone.target), target: milestone.target }) }}</span></template>
				</div>
			</article>
		</div>
	</section>
</MkCommunityHub>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, onActivated, onDeactivated, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import { versatileLang } from '@@/js/intl-const.js';
import MkCommunityHub from '@/components/MkCommunityHub.vue';
import MkAchievementBadge from '@/components/MkAchievementBadge.vue';
import { publishCheckinStatus, useCheckinStatus } from '@/composables/use-checkin-status.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { checkinCalendar, checkinDateInZone, shiftCheckinMonth } from '@/utility/checkin.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { definePage } from '@/page.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';

const $i = ensureSignin();
const MkCheckinSuccessDialog = defineAsyncComponent(() => import('@/components/MkCheckinSuccessDialog.vue'));
const checkinButton = useTemplateRef<HTMLButtonElement>('checkinButton');
let successDialog: { dispose: () => void } | undefined;
let lastReward: { date: string; points: number; cards: number } | undefined;
const status = ref<entities.ICheckinStatusResponse | null>(null);
const loading = ref(false);
const posting = ref(false);
const pendingOperation = ref<'checkin' | 'makeup' | 'exchange' | null>(null);
let exchangeRequestId: string | undefined;
const error = ref('');
const retryExchange = ref(false);
const notice = ref('');
const { status: sharedStatus } = useCheckinStatus({ refresh: false });
let publishing = false;
let refreshAfterLoad = false;
let pendingBroadcast = false;
let observedLocalDate = '';
let lastRequestedMonth: string | undefined;
let request = 0;
let active = true;
let timer: number | undefined;
const pageActive = inject(DI.pageActive, ref(true));
const milestones = [
	{ name: 'checkin1', target: 1, metric: 'totalDays' },
	{ name: 'checkinStreak7', target: 7, metric: 'consecutiveDays' },
	{ name: 'checkinStreak30', target: 30, metric: 'consecutiveDays' },
	{ name: 'checkinTotal30', target: 30, metric: 'totalDays' },
	{ name: 'checkinTotal100', target: 100, metric: 'totalDays' },
	{ name: 'checkinTotal365', target: 365, metric: 'totalDays' },
] as const;
const earned = computed(() => new Set(status.value?.achievements.map(achievement => achievement.name)));
const checkedDates = computed(() => new Set(status.value?.checkedInDates));
const makeupDates = computed(() => new Set(status.value?.makeupDates));
const dates = computed(() => status.value ? checkinCalendar(status.value.month) : []);
const monthLabel = computed(() => status.value ? new Intl.DateTimeFormat(versatileLang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${status.value.month}-01T00:00:00Z`)) : '');
const todayLabel = computed(() => status.value ? new Intl.DateTimeFormat(versatileLang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${status.value.today}T00:00:00Z`)) : '');
const weekdays = computed(() => Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(versatileLang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 8, 27 + day)))));

function dayState(date: string): string {
	return makeupDates.value.has(date) ? i18n.ts._checkin.madeUp : checkedDates.value.has(date) ? i18n.ts._checkin.signed : date < status.value!.registeredDate ? i18n.ts._checkin.beforeRegistration : date > status.value!.today ? i18n.ts._checkin.future : i18n.ts._checkin.notCheckedIn;
}

function canMakeup(date: string): boolean {
	return !!status.value && date >= status.value.registeredDate && date < status.value.today && !checkedDates.value.has(date);
}

function applyStatus(result: entities.ICheckinStatusResponse, broadcast = false) {
	status.value = result;
	observedLocalDate = checkinDateInZone(new Date(), result.timeZone);
	lastRequestedMonth = result.month === result.today.slice(0, 7) ? undefined : result.month;
	publishing = true;
	try {
		publishCheckinStatus($i.id, result, { broadcast });
	} finally {
		publishing = false;
	}
}

function applyMutationStatus(result: entities.ICheckinStatusResponse, requestedAt: Date) {
	if (checkinDateInZone(requestedAt, result.timeZone) !== checkinDateInZone(new Date(), result.timeZone)) {
		refreshAfterLoad = true;
		pendingBroadcast = true;
		lastRequestedMonth = result.month === result.today.slice(0, 7) ? undefined : result.month;
	} else {
		applyStatus(result, true);
	}
}

async function load(month?: string) {
	if (posting.value) return;
	const sequence = ++request;
	const requestedAt = new Date();
	lastRequestedMonth = month;
	loading.value = true;
	error.value = '';
	retryExchange.value = false;
	try {
		const result = await misskeyApi('i/checkin-status', month ? { month } : {});
		if (sequence === request) {
			if (checkinDateInZone(requestedAt, result.timeZone) !== checkinDateInZone(new Date(), result.timeZone)) refreshAfterLoad = true;
			if (!refreshAfterLoad) {
				const broadcast = pendingBroadcast;
				pendingBroadcast = false;
				applyStatus(result, broadcast);
			}
		}
	} catch {
		if (sequence === request) error.value = i18n.ts._checkin.loadFailed;
	} finally {
		if (sequence === request) {
			loading.value = false;
			refreshIfNeeded();
		}
	}
}

function showSuccess(result: entities.ICheckinStatusResponse) {
	if (successDialog || !active || !pageActive.value) return;
	const reward = lastReward?.date === result.today ? lastReward : undefined;
	successDialog = os.popup(MkCheckinSuccessDialog, {
		points: reward?.points ?? 1,
		consecutiveDays: result.consecutiveDays,
		earnedMakeupCards: reward?.cards ?? 0,
		returnFocusTo: checkinButton.value ?? undefined,
	}, {
		closed: () => { successDialog?.dispose(); successDialog = undefined; },
	});
}

async function checkIn() {
	if (posting.value || loading.value || !status.value) return;
	if (status.value.checkedInToday) {
		showSuccess(status.value);
		return;
	}
	posting.value = true;
	pendingOperation.value = 'checkin';
	error.value = '';
	retryExchange.value = false;
	notice.value = '';
	const sequence = ++request;
	const requestedAt = new Date();
	try {
		const result = await misskeyApi('i/checkin', {});
		if (sequence !== request) return;
		applyMutationStatus(result, requestedAt);
		notice.value = result.earnedPoints > 0 ? i18n.tsx._checkin.rewardReceived({ n: result.earnedPoints }) : i18n.ts._checkin.alreadyCheckedIn;
		if (result.earnedMakeupCards > 0) notice.value += ` ${i18n.tsx._checkin.cardRewardReceived({ n: result.earnedMakeupCards })}`;
		if (result.newlyCheckedIn) lastReward = { date: result.today, points: result.earnedPoints, cards: result.earnedMakeupCards };
		showSuccess(result);
		lastRequestedMonth = undefined;
	} catch {
		if (sequence === request) error.value = i18n.ts._checkin.checkinFailed;
	} finally {
		posting.value = false;
		pendingOperation.value = null;
		refreshIfNeeded();
	}
}

async function makeUp(date: string) {
	if (posting.value || loading.value || !canMakeup(date) || !status.value) return;
	if (status.value.makeupCards < 1) {
		await exchangeCard(true);
		return;
	}
	posting.value = true;
	pendingOperation.value = 'makeup';
	const sequence = ++request;
	try {
		const { canceled } = await os.confirm({ type: 'question', title: i18n.ts._checkin.makeup, text: i18n.tsx._checkin.makeupConfirm({ date }) });
		if (canceled || sequence !== request) return;
		error.value = '';
		retryExchange.value = false;
		notice.value = '';
		const requestedAt = new Date();
		const result = await misskeyApi('i/checkin-makeup', { date });
		if (sequence !== request) return;
		applyMutationStatus(result, requestedAt);
		notice.value = result.earnedPoints > 0 ? i18n.tsx._checkin.makeupSuccess({ date, n: result.earnedPoints }) : i18n.ts._checkin.alreadyMadeUp;
	} catch (cause) {
		const code = (cause as { code?: string } | null)?.code;
		error.value = code === 'NO_MAKEUP_CARDS' ? i18n.ts._checkin.noMakeupCards : code === 'INVALID_CHECKIN_DATE' ? i18n.ts._checkin.invalidMakeupDate : i18n.ts._checkin.makeupFailed;
	} finally {
		posting.value = false;
		pendingOperation.value = null;
		refreshIfNeeded();
	}
}

async function exchangeCard(fromMakeup = false) {
	if (posting.value || loading.value || !status.value) return;
	posting.value = true;
	pendingOperation.value = 'exchange';
	const sequence = ++request;
	try {
		const cost = status.value.makeupCardExchangeCost;
		if (!exchangeRequestId && status.value.points < cost) {
			await os.alert({ type: 'warning', title: fromMakeup ? i18n.ts._checkin.noMakeupCardsTitle : i18n.ts._checkin.exchangeCard, text: i18n.tsx._checkin.noPointsForCard({ cost, current: status.value.makeupCardProgress, target: status.value.makeupCardTarget }) });
			return;
		}
		const { canceled } = await os.confirm({
			type: 'question', title: fromMakeup ? i18n.ts._checkin.noMakeupCardsTitle : i18n.ts._checkin.exchangeCard,
			text: fromMakeup ? i18n.tsx._checkin.noCardsExchange({ cost }) : i18n.tsx._checkin.exchangeConfirm({ cost }),
			okText: i18n.ts._checkin.exchangeNow, cancelText: i18n.ts._checkin.exchangeLater,
		});
		if (canceled || sequence !== request) return;
		error.value = '';
		notice.value = '';
		exchangeRequestId ??= crypto.randomUUID();
		const result = await misskeyApi('i/checkin-exchange', { requestId: exchangeRequestId });
		if (sequence !== request) return;
		exchangeRequestId = undefined;
		// Reload the selected month so concurrent gifts and check-ins cannot leave stale balances.
		pendingBroadcast = true;
		refreshAfterLoad = true;
		status.value = { ...status.value, points: result.points, makeupCards: result.makeupCards };
		notice.value = i18n.ts._checkin.cardExchangeSuccess;
	} catch (cause) {
		if (sequence !== request) return;
		if ((cause as { code?: string } | null)?.code === 'INSUFFICIENT_CHECKIN_POINTS') {
			exchangeRequestId = undefined;
			error.value = i18n.tsx._checkin.noPointsForCard({ cost: status.value!.makeupCardExchangeCost, current: status.value!.makeupCardProgress, target: status.value!.makeupCardTarget });
		} else {
			error.value = i18n.ts._checkin.cardExchangeFailed;
			retryExchange.value = true;
		}
	} finally {
		posting.value = false;
		pendingOperation.value = null;
		refreshIfNeeded();
	}
}

function retry() {
	if (retryExchange.value) void exchangeCard();
	else void load(lastRequestedMonth);
}

function showRules() {
	os.alert({ type: 'info', title: i18n.ts._checkin.rules, text: [
		i18n.tsx._checkin.rulesDescription({ timeZone: status.value?.timeZone ?? 'Asia/Shanghai' }),
		i18n.ts._checkin.dailyReward, i18n.ts._checkin.makeupRule, i18n.ts._checkin.streakRule, i18n.ts._checkin.privacyRule,
		i18n.tsx._checkin.cardRewardRule({ target: status.value?.makeupCardTarget ?? 7 }), i18n.tsx._checkin.exchangeCost({ cost: status.value?.makeupCardExchangeCost ?? 7 }),
	].join('\n\n') });
}

watch(sharedStatus, incoming => {
	if (publishing || !incoming) return;
	if (status.value) status.value = { ...status.value, today: incoming.today, checkedInToday: incoming.checkedInToday };
	if (loading.value || posting.value) refreshAfterLoad = true;
	else refresh();
}, { flush: 'sync' });

function refresh() {
	if (active && pageActive.value && window.document.visibilityState !== 'hidden' && !posting.value && !loading.value) {
		void load(lastRequestedMonth);
	}
}

function refreshIfNeeded() {
	if (!refreshAfterLoad) return;
	refreshAfterLoad = false;
	refresh();
}

watch(pageActive, value => { if (value) refresh(); });

onMounted(() => {
	void load();
	window.addEventListener('focus', refresh);
	window.addEventListener('online', refresh);
	window.document.addEventListener('visibilitychange', refresh);
	timer = window.setInterval(() => {
		if (status.value && checkinDateInZone(new Date(), status.value.timeZone) !== observedLocalDate) refresh();
	}, 30_000);
});
onActivated(() => { active = true; refresh(); });
onDeactivated(() => { active = false; });
onUnmounted(() => {
	request++;
	active = false;
	successDialog?.dispose();
	successDialog = undefined;
	window.clearInterval(timer);
	window.removeEventListener('focus', refresh);
	window.removeEventListener('online', refresh);
	window.document.removeEventListener('visibilitychange', refresh);
});

definePage(() => ({ title: i18n.ts._checkin.dailyCheckin, icon: 'ti ti-calendar-check', needWideArea: true }));
</script>

<style lang="scss" module>
@use "../styles/community.scss";
@use "../styles/page-header.scss";

.panel, .achievements { overflow: hidden; }
.panel { container-type: inline-size; }
// パネル自身が角丸と overflow: clip を持つので、ヘッダー側は角丸なしで上端に密着させる
.header { @include page-header.surface; --MI-pageHeaderRadius: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: var(--height); padding: 0 24px; }
.header h1, .header h2 { margin: 0; font-size: 1em; }
.body { padding: 28px; }
.dashboard { display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 27%); align-items: start; gap: 28px; }
.calendarColumn, .actionColumn { min-width: 0; }
.actionColumn { display: flex; flex-direction: column; gap: 32px; padding-top: 12px; }
.checkin { display: inline-flex; justify-content: center; align-items: center; gap: 8px; width: 100%; min-height: 64px; box-sizing: border-box; padding: 16px; border-radius: calc(var(--MI-radius) / 2); font-size: 1.05em; font-weight: bold; color: var(--MI_THEME-fgOnAccent); background: var(--MI_THEME-link, var(--MI_THEME-accent)); }
.checkin.checkedIn { color: var(--MI_THEME-link, var(--MI_THEME-accent)); background: color-mix(in srgb, var(--MI_THEME-link, var(--MI_THEME-accent)) 10%, var(--MI_THEME-panel)); }
.checkin:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 3px; }
.checkin:disabled { opacity: .65; cursor: default; }
.error { @include community.error; }
.notice { margin: 0 0 20px; color: var(--MI_THEME-accent); line-height: 1.7; }
.rewards { padding: 16px; border-radius: calc(var(--MI-radius) / 2); background: var(--MI_THEME-accentedBg); }
.rewards p { margin: 12px 0 0; font-size: .8em; line-height: 1.6; color: var(--MI_THEME-fgTransparentWeak); }
.rewards .rewardHint { margin: 0 0 16px; color: var(--MI_THEME-accent); font-weight: bold; }
.balances { margin: 0; display: flex; flex-direction: column; gap: 12px; }
.balances > div { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.balances dt { font-size: .85em; }
.balances dd { margin: 0; font-weight: bold; font-variant-numeric: tabular-nums; }
.cardProgress { width: 100%; height: 6px; margin-top: 8px; }
.exchange { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px; width: 100%; margin-top: 16px; padding: 10px; border-radius: calc(var(--MI-radius) / 2); color: var(--MI_THEME-accent); background: var(--MI_THEME-panel); box-sizing: border-box; }
.exchange:disabled { opacity: .5; cursor: default; }
.makeup { max-width: 100%; min-height: 24px; padding: 0 2px; color: var(--MI_THEME-link, var(--MI_THEME-accent)); font-size: .8em; line-height: 1.35; overflow-wrap: anywhere; }
.makeup:enabled:hover { text-decoration: underline; }
.makeup:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; border-radius: calc(var(--MI-radius) / 4); }
.makeup:disabled { opacity: .5; cursor: default; }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; padding: 24px 12px; background: color-mix(in srgb, var(--MI_THEME-fg) 4%, var(--MI_THEME-panel)); border-radius: calc(var(--MI-radius) / 2); }
.stats > div { display: flex; flex-direction: column-reverse; align-items: center; gap: 6px; text-align: center; }
.stats dt { font-size: .8em; color: var(--MI_THEME-fgTransparentWeak); }
.stats dd { font-size: 2.15em; font-weight: bold; margin: 0; font-variant-numeric: tabular-nums; }
.stats > div:first-child dd { color: var(--MI_THEME-accent); }
.monthNav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 28px 0 16px; }
.monthControls { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; min-width: 0; }
.monthNav h2 { margin: 0; font-size: 1.2em; font-weight: 500; line-height: 1.5; }
.monthButton { display: grid; place-items: center; width: 24px; height: 30px; flex-shrink: 0; color: var(--MI_THEME-fgTransparentWeak); border-radius: calc(var(--MI-radius) / 4); font-size: .8em; }
.monthButton:enabled:hover { background: var(--MI_THEME-buttonHoverBg); }
.monthButton:disabled { opacity: .3; }
.monthButton:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.thisMonth { margin-left: 8px; font-size: .75em; }
.cardCount { display: flex; align-items: center; gap: 6px; margin-left: auto; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; white-space: nowrap; }
.cardCount > i { color: var(--MI_THEME-warn); font-size: 1.55em; transform: rotate(-12deg); }
.cardAmount { color: var(--MI_THEME-warn); font-variant-numeric: tabular-nums; }
.calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 12px; }
.weekday { padding: 4px 0 8px; text-align: center; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.day { position: relative; display: flex; min-height: 84px; align-items: center; justify-content: center; flex-direction: column; gap: 2px; padding: 8px 2px; border-radius: calc(var(--MI-radius) / 6); background: color-mix(in srgb, var(--MI_THEME-fg) 4%, var(--MI_THEME-panel)); box-sizing: border-box; }
.dayNumber { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; font-size: 1.25em; font-weight: 400; line-height: 1; font-variant-numeric: tabular-nums; }
.dayReward { display: flex; align-items: center; justify-content: center; gap: 3px; min-height: 24px; color: var(--MI_THEME-link, var(--MI_THEME-accent)); font-size: .7em; line-height: 1; }
.dayReward > i { font-size: 1.2em; background: linear-gradient(135deg, #7ee8fa 0%, #4aa8ff 55%, #a78bfa 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.dayCaption { display: flex; align-items: center; min-height: 24px; color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; line-height: 1.35; text-align: center; }
.completedMark { position: absolute; top: 4px; right: 4px; color: var(--MI_THEME-warn); font-size: .8em; }
.day.completed, .day.today { background: color-mix(in srgb, var(--MI_THEME-link, var(--MI_THEME-accent)) 10%, var(--MI_THEME-panel)); }
.day.today .dayNumber { color: var(--MI_THEME-fgOnAccent); background: var(--MI_THEME-link, var(--MI_THEME-accent)); }
.day.future .dayNumber, .day.future .dayReward, .day.unavailable .dayNumber { color: var(--MI_THEME-fgTransparentWeak); }
.note { margin: 20px 0 0; font-size: .8em; color: var(--MI_THEME-fgTransparentWeak); line-height: 1.7; }
.dateCard { overflow: hidden; border: 1px solid var(--MI_THEME-divider); border-radius: calc(var(--MI-radius) / 2); }
.dateVisual {
	position: relative;
	isolation: isolate;
	overflow: hidden;
	padding: 24px;
	color: var(--MI_THEME-fgOnAccent);
	background: linear-gradient(145deg, color-mix(in srgb, var(--MI_THEME-accent) 65%, var(--MI_THEME-fg)) 0%, var(--MI_THEME-accent) 58%, color-mix(in srgb, var(--MI_THEME-accent) 75%, var(--MI_THEME-panel)) 100%);

	&::before {
		content: '';
		position: absolute;
		z-index: -1;
		inset: 40% -40% -25%;
		transform: rotate(-30deg);
		border-top: 20px solid color-mix(in srgb, var(--MI_THEME-fgOnAccent) 12%, transparent);
		border-bottom: 32px solid color-mix(in srgb, var(--MI_THEME-fgOnAccent) 10%, transparent);
		background: color-mix(in srgb, var(--MI_THEME-fgOnAccent) 8%, transparent);
	}

	&::after {
		content: '';
		position: absolute;
		top: 24px;
		right: 24px;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: radial-gradient(circle at 30% 30%, var(--MI_THEME-fgOnAccent), color-mix(in srgb, var(--MI_THEME-fgOnAccent) 30%, transparent));
		box-shadow: 0 4px 12px color-mix(in srgb, var(--MI_THEME-fg) 12%, transparent);
	}
}
.dateCaption { font-size: .8em; }
.date { display: flex; flex-direction: column; gap: 4px; margin-top: 16px; }
.date strong { font-size: 4.4em; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.date > span { font-size: .9em; }
.dateMessage { padding: 24px; }
.dateMessage h2 { margin: 12px 0; color: var(--MI_THEME-accent); font-size: 1.15em; line-height: 1.6; }
.dateMessage p { margin: 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; line-height: 1.8; overflow-wrap: anywhere; }
.achievements { margin-top: 20px; }
.milestones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 20px; }
.milestone { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); }
.milestone.unlocked { border-color: color-mix(in srgb, var(--MI_THEME-accent) 30%, var(--MI_THEME-divider)); background: color-mix(in srgb, var(--MI_THEME-accent) 4%, var(--MI_THEME-panel)); }
.medal { flex-shrink: 0; }
.milestoneBody { min-width: 0; flex: 1; }
.milestone h3 { font-size: .9em; margin: 0; }
.milestone p { font-size: .75em; color: var(--MI_THEME-fgTransparentWeak); margin: 6px 0 10px; line-height: 1.5; }
.milestone progress {
	display: block;
	width: 100%;
	height: 8px;
	margin-bottom: 8px;
}
.progress, .earned { font-size: .7em; color: var(--MI_THEME-fgTransparentWeak); }
.earned { color: var(--MI_THEME-accent); }
@container (max-width: 760px) {
	.dashboard { grid-template-columns: minmax(0, 1fr); gap: 24px; }
	.actionColumn { grid-row: 1; gap: 16px; padding-top: 0; }
	.checkin { min-height: 48px; padding: 12px 16px; }
	.dateCard { border: 0; }
	.dateVisual { display: none; }
	.dateMessage { padding: 0; text-align: center; }
	.dateMessage h2 { margin: 0 0 6px; font-size: 1em; }
}
@container (max-width: 480px) {
	.header { padding: 0 16px; }
	.body { padding: 16px; }
	.stats { padding: 16px 6px; gap: 6px; }
	.stats dd { font-size: 1.65em; }
	.monthNav { gap: 8px; }
	.monthNav h2 { font-size: 1.1em; }
	.cardCount { font-size: .75em; }
	.calendar { gap: 4px; }
	.day { min-height: 66px; padding: 6px 1px; }
	.dayNumber { width: 26px; height: 26px; font-size: 1.1em; }
	.makeup, .dayCaption { font-size: .65em; }
	.dayReward { font-size: .65em; gap: 2px; }
	.completedMark { top: 2px; right: 2px; font-size: .65em; }
}
@media (max-width: 600px) {
	.milestones { grid-template-columns: minmax(0, 1fr); padding: 16px; }
}
</style>
