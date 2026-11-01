<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<template #header-actions><button type="button" class="_button _iconButton" :class="$style.rules" :aria-label="i18n.ts._checkin.rules" @click="showRules"><i class="ti ti-help-circle" aria-hidden="true"></i></button></template>
<div class="_pageBody" :class="$style.root">
	<section :class="$style.panel" :aria-busy="loading || posting">
		<div>
			<div v-if="error" role="alert" :class="$style.error">{{ error }} <button v-if="!posting" ref="retryButton" class="_textButton" @click="retry">{{ i18n.ts.retry }}</button></div>
			<div v-if="!status && loading" :class="$style.loading"><MkLoading/></div>
			<template v-if="status">
				<div :class="$style.dashboard">
					<section :class="$style.todayPanel" :aria-label="todayLabel">
						<div>
							<div :class="$style.todayHeader"><h2><time :datetime="status.today">{{ todayLabel }}</time></h2><span>{{ todayWeekday }}</span></div>
							<p :class="$style.rewardHint"><i class="ti ti-coins" aria-hidden="true"></i>{{ i18n.ts._checkin.dailyReward }}</p>
						</div>
						<button ref="checkinButton" type="button" class="_button" :class="[$style.checkin, { [$style.checkedIn]: status.checkedInToday }]" :disabled="loading || posting || statusStale" data-testid="checkin-submit" @click="checkIn">
							<i v-if="pendingOperation === 'checkin'" class="ti ti-loader-2" :class="$style.spin" aria-hidden="true"></i>
							<i v-else :class="['ti', status.checkedInToday ? 'ti-circle-check-filled' : 'ti-calendar-check']" aria-hidden="true"></i>
							<span>{{ pendingOperation === 'checkin' ? i18n.ts._checkin.checkingIn : status.checkedInToday ? i18n.ts._checkin.checkedIn : i18n.ts._checkin.checkIn }}</span>
						</button>
					</section>
					<section class="_panel _card" :class="$style.calendarColumn" :aria-label="i18n.ts._checkin.calendar">
						<header :class="$style.calendarHeader">
							<div :class="$style.monthTitle">
								<h2 data-testid="checkin-month">{{ monthLabel }}</h2>
							</div>
							<div :class="$style.monthControls">
								<button type="button" class="_button" :class="$style.monthButton" :aria-label="i18n.ts._checkin.previousMonth" :disabled="loading || posting || status.month <= '1900-01'" @click="load(shiftCheckinMonth(status.month, -1))"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
								<button type="button" class="_button" :class="$style.monthButton" :aria-label="i18n.ts._checkin.nextMonth" :disabled="loading || posting || status.month >= '2199-12'" @click="load(shiftCheckinMonth(status.month, 1))"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
							</div>
						</header>
						<div :class="$style.calendarToolbar">
							<div :class="$style.calendarLegend" :aria-label="i18n.ts._checkin.calendarStates">
								<span><i :class="$style.legendSigned" aria-hidden="true"></i>{{ i18n.ts._checkin.signed }}</span>
								<span><i :class="$style.legendUnsigned" aria-hidden="true"></i>{{ i18n.ts._checkin.notCheckedIn }}</span>
							</div>
							<button v-if="status.month !== status.today.slice(0, 7)" type="button" class="_textButton" :class="$style.thisMonth" :disabled="loading || posting || statusStale" @click="load()">{{ i18n.ts._checkin.currentMonth }}</button>
						</div>
						<div :class="$style.weekdays" aria-hidden="true">
							<div v-for="weekday in weekdays" :key="weekday" :class="$style.weekday">{{ weekday }}</div>
						</div>
						<div ref="calendarElement" :class="$style.calendar" data-testid="checkin-calendar">
							<template v-for="(date, index) in dates" :key="date ?? `empty-${index}`">
								<div v-if="date" role="group" :class="[$style.day, $style[calendarState(date)], { [$style.today]: date === status.today, [$style.selectedDay]: date === selectedDate }]" :aria-label="i18n.tsx._checkin.dateState({ date, state: dayState(date) })" :aria-current="date === status.today ? 'date' : undefined" :data-checkin-date="date" :data-day-state="calendarState(date)">
									<button type="button" class="_button" :class="$style.daySelect" :aria-label="dayLabel(date)" :aria-pressed="date === selectedDate" :tabindex="date === selectedDate ? 0 : -1" :data-date-select="date" :title="dayLabel(date)" @click="selectedDate = date" @keydown="moveCalendarFocus($event, date)">
										<span :class="$style.dayTop"><time :datetime="date" :class="$style.dayNumber">{{ Number(date.slice(-2)) }}</time><i v-if="makeupDates.has(date)" class="ti ti-history" :class="$style.stateIcon" aria-hidden="true"></i></span>
									</button>
									<span v-if="rewardDates.has(date) || predictedRewardDates.has(date)" :class="[$style.cardReward, { [$style.predictedReward]: !rewardDates.has(date) }]" :title="rewardDates.has(date) ? i18n.ts._checkin.calendarRewardReceived : i18n.ts._checkin.calendarRewardExpected" :aria-label="rewardDates.has(date) ? i18n.ts._checkin.calendarRewardReceived : i18n.ts._checkin.calendarRewardExpected" :data-card-reward="rewardDates.has(date) ? 'received' : 'expected'"><i :class="rewardDates.has(date) ? 'ti ti-ticket' : 'ti ti-gift'" aria-hidden="true"></i><span :class="$style.rewardLabel">{{ rewardDates.has(date) ? i18n.ts._checkin.earned : i18n.ts._checkin.rewardPreview }}</span></span>
									<button v-else-if="date === status.today && !status.checkedInToday" type="button" class="_button" :class="$style.dayAction" :aria-label="i18n.ts._checkin.checkIn" :disabled="loading || posting || statusStale" @click="checkIn()">{{ i18n.ts._checkin.checkIn }}</button>
									<button v-else-if="canMakeup(date)" type="button" class="_button" :class="$style.dayAction" :aria-label="i18n.tsx._checkin.makeupDate({ date })" :disabled="loading || posting || statusStale" @click="selectedDate = date; makeUp(date)">{{ i18n.ts._checkin.makeup }}</button>
									<span v-else-if="checkedDates.has(date) && !makeupDates.has(date)" :class="$style.dayReward" :aria-label="i18n.tsx._checkin.pointsEarned({ n: 1 })"><i class="ti ti-coins" aria-hidden="true"></i>+1</span>
									<span v-else-if="makeupDates.has(date)" :class="$style.dayStatus">{{ i18n.ts._checkin.madeUp }}</span>
								</div>
								<div v-else aria-hidden="true"></div>
							</template>
						</div>
						<dl :class="$style.stats">
							<div><dt><i class="ti ti-flame" aria-hidden="true"></i>{{ i18n.ts._checkin.consecutiveDays }}</dt><dd>{{ status.consecutiveDays }}</dd></div>
							<div><dt><i class="ti ti-sparkles" aria-hidden="true"></i>{{ i18n.ts._checkin.totalDays }}</dt><dd>{{ status.totalDays }}</dd></div>
							<div><dt><i class="ti ti-calendar-check" aria-hidden="true"></i>{{ i18n.ts._checkin.monthlyDays }}</dt><dd>{{ status.monthlyDays }}</dd></div>
						</dl>
					</section>
					<section :class="$style.walletPanel" :aria-label="i18n.ts._checkin.makeupCards">
						<div :class="$style.walletSummary">
							<div :class="$style.balanceRow"><span><i class="ti ti-coins" aria-hidden="true"></i>{{ i18n.ts._checkin.points }}</span><strong data-testid="checkin-points">{{ status.points }}</strong></div>
							<div :class="$style.balanceRow"><span><i class="ti ti-ticket" aria-hidden="true"></i>{{ i18n.ts._checkin.makeupCards }}</span><strong data-testid="checkin-makeup-cards">{{ status.makeupCards }}</strong></div>
							<div :class="$style.progressSection">
								<p :class="$style.progressHeading" data-testid="checkin-card-progress">{{ i18n.tsx._checkin.cardRewardProgress({ current: status.makeupCardProgress, target: status.makeupCardTarget }) }}</p>
								<progress :class="$style.cardProgress" :value="status.makeupCardProgress" :max="status.makeupCardTarget" :aria-label="i18n.tsx._checkin.cardRewardProgress({ current: status.makeupCardProgress, target: status.makeupCardTarget })"></progress>
								<p v-if="streakEncouragement" :class="$style.streakEncouragement" data-testid="checkin-streak-encouragement">{{ streakEncouragement }}</p>
							</div>
						</div>
						<div :class="$style.exchangePanel">
							<p :class="$style.exchangeHint">{{ i18n.tsx._checkin.exchangeCost({ cost: status.makeupCardExchangeCost }) }}</p>
							<button type="button" class="_button" :class="$style.exchange" :disabled="loading || posting || statusStale || (!!exchangeBlockedReason && !exchangeRequestId)" data-testid="checkin-exchange" @click="exchangeCard()"><i class="ti ti-ticket" aria-hidden="true"></i><span>{{ pendingOperation === 'exchange' ? i18n.ts._checkin.exchangingCard : i18n.ts._checkin.exchangeCard }}</span></button>
							<p v-if="exchangeBlockedReason" :class="$style.exchangeBlocked" data-testid="checkin-exchange-unavailable">{{ exchangeBlockedReason }}</p>
						</div>
					</section>
				</div>
			</template>
		</div>
	</section>
	<section v-if="status" class="_panel _card" :class="$style.achievements">
		<header :class="$style.header"><div><h2>{{ i18n.ts._checkin.checkinAchievements }}</h2><p>{{ i18n.tsx._checkin.progress({ current: earned.size, target: milestones.length }) }}</p></div><MkA to="/my/achievements" class="_link">{{ i18n.ts._checkin.allAchievements }} <i class="ti ti-chevron-right" aria-hidden="true"></i></MkA></header>
		<div :class="$style.milestones">
			<article v-for="milestone in milestones" :key="milestone.name" :class="[$style.milestone, { [$style.streakMilestone]: milestone.metric === 'consecutiveDays', [$style.unlocked]: earned.has(milestone.name) }]">
				<MkAchievementBadge :name="milestone.name" :class="$style.medal"/>
				<div :class="$style.milestoneBody">
					<div :class="$style.milestoneHeading"><h3>{{ i18n.ts._achievements._types[`_${milestone.name}`].title }}</h3><span v-if="earned.has(milestone.name)" :class="$style.earned">{{ i18n.ts._checkin.earned }}</span></div>
					<p>{{ i18n.ts._achievements._types[`_${milestone.name}`].description }}</p>
					<template v-if="!earned.has(milestone.name)"><div :class="$style.milestoneProgress"><progress :max="milestone.target" :value="Math.min(status[milestone.metric], milestone.target)" :aria-label="i18n.ts._achievements._types[`_${milestone.name}`].title"></progress><span :class="$style.progress">{{ i18n.tsx._checkin.progress({ current: Math.min(status[milestone.metric], milestone.target), target: milestone.target }) }}</span></div></template>
				</div>
			</article>
		</div>
	</section>
</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import { versatileLang } from '@@/js/intl-const.js';
import MkAchievementBadge from '@/components/MkAchievementBadge.vue';
import { publishCheckinStatus, useCheckinStatus } from '@/composables/use-checkin-status.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { checkinCalendar, checkinDateInZone, checkinRewardForecast, shiftCheckinMonth } from '@/utility/checkin.js';
import { focusParent, isFocusable } from '@/utility/focus.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { definePage } from '@/page.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';

const $i = ensureSignin();
const MkCheckinSuccessDialog = defineAsyncComponent(() => import('@/components/MkCheckinSuccessDialog.vue'));
const checkinButton = useTemplateRef<HTMLButtonElement>('checkinButton');
const retryButton = useTemplateRef<HTMLButtonElement>('retryButton');
const exchangeFocusTarget = ref<HTMLElement>();
let successDialog: { dispose: () => void } | undefined;
let lastReward: { date: string; points: number; cards: number } | undefined;
const status = ref<entities.ICheckinStatusResponse | null>(null);
const statusStale = ref(true);
const selectedDate = ref('');
const calendarElement = useTemplateRef<HTMLElement>('calendarElement');
const loading = ref(false);
const posting = ref(false);
const pendingOperation = ref<'checkin' | 'makeup' | 'exchange' | null>(null);
const exchangeRequestId = ref<string>();
const error = ref('');
const retryExchange = ref(false);
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
const rewardDates = computed(() => new Set(status.value?.rewardDates));
const predictedRewardDates = computed(() => status.value && !statusStale.value ? checkinRewardForecast(status.value) : new Set<string>());
const dates = computed(() => status.value ? checkinCalendar(status.value.month) : []);
watch(() => status.value?.month, () => {
	selectedDate.value = status.value?.month === status.value?.today.slice(0, 7) ? status.value?.today ?? '' : dates.value.find((date): date is string => date !== null) ?? '';
});
const monthLabel = computed(() => status.value ? new Intl.DateTimeFormat(versatileLang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${status.value.month}-01T00:00:00Z`)) : '');
const todayLabel = computed(() => status.value ? new Intl.DateTimeFormat(versatileLang, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${status.value.today}T00:00:00Z`)) : '');
const todayWeekday = computed(() => status.value ? new Intl.DateTimeFormat(versatileLang, { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${status.value.today}T00:00:00Z`)) : '');
const weekdays = computed(() => Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(versatileLang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 8, 27 + day)))));
const exchangeBlockedReason = computed(() => {
	if (!status.value) return '';
	if (!status.value.makeupCardExchangeAvailable) return i18n.ts._checkin.monthlyExchangeLimit;
	if (status.value.makeupCards >= status.value.makeupCardLimit) return i18n.tsx._checkin.cardHoldingLimit({ limit: status.value.makeupCardLimit });
	return '';
});
const streakEncouragement = computed(() => {
	const days = status.value?.consecutiveDays ?? 0;
	return days >= 7 && days < 30 ? i18n.tsx._checkin.streakStageReached({ days, target: days < 14 ? 14 : 30 }) : '';
});

function dayState(date: string): string {
	return makeupDates.value.has(date) ? i18n.ts._checkin.madeUp : checkedDates.value.has(date) ? i18n.ts._checkin.signed : date < status.value!.registeredDate ? i18n.ts._checkin.beforeRegistration : date > status.value!.today ? i18n.ts._checkin.future : date < status.value!.makeupEarliestDate ? i18n.ts._checkin.makeupExpired : i18n.ts._checkin.notCheckedIn;
}

function dayLabel(date: string): string {
	const label = i18n.tsx._checkin.dateState({ date, state: dayState(date) });
	const reward = rewardDates.value.has(date) ? i18n.ts._checkin.calendarRewardReceived : predictedRewardDates.value.has(date) ? i18n.ts._checkin.calendarRewardExpected : checkedDates.value.has(date) && !makeupDates.value.has(date) ? i18n.tsx._checkin.pointsEarned({ n: 1 }) : '';
	return reward ? `${label}，${reward}` : label;
}

function calendarState(date: string): string {
	if (makeupDates.value.has(date)) return 'madeUp';
	if (checkedDates.value.has(date)) return 'completed';
	if (date < status.value!.registeredDate) return 'unavailable';
	if (date > status.value!.today) return 'future';
	if (date === status.value!.today) return 'pending';
	return canMakeup(date) ? 'missed' : 'expired';
}

function moveCalendarFocus(event: KeyboardEvent, date: string) {
	const days = dates.value.filter((day): day is string => day !== null);
	const index = days.indexOf(date);
	const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
	let target: number;
	if (event.key === 'Home') target = 0;
	else if (event.key === 'End') target = days.length - 1;
	else if (event.key in offsets) target = Math.min(days.length - 1, Math.max(0, index + offsets[event.key]));
	else return;
	event.preventDefault();
	selectedDate.value = days[target];
	calendarElement.value?.querySelector<HTMLButtonElement>(`[data-date-select="${days[target]}"]`)?.focus();
}

function canMakeup(date: string): boolean {
	return !!status.value && date >= status.value.registeredDate && date >= status.value.makeupEarliestDate && date < status.value.today && !checkedDates.value.has(date);
}

function applyStatus(result: entities.ICheckinStatusResponse, broadcast = false) {
	status.value = result;
	statusStale.value = false;
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
	statusStale.value = true;
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
	if (posting.value || loading.value || statusStale.value || !status.value) return;
	if (status.value.checkedInToday) {
		showSuccess(status.value);
		return;
	}
	posting.value = true;
	pendingOperation.value = 'checkin';
	error.value = '';
	retryExchange.value = false;
	const sequence = ++request;
	const requestedAt = new Date();
	try {
		const result = await misskeyApi('i/checkin', {});
		if (sequence !== request) return;
		applyMutationStatus(result, requestedAt);
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
	if (posting.value || loading.value || statusStale.value || !canMakeup(date) || !status.value) return;
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
		const requestedAt = new Date();
		const result = await misskeyApi('i/checkin-makeup', { date });
		if (sequence !== request) return;
		applyMutationStatus(result, requestedAt);
		let message = result.newlyCheckedIn ? i18n.tsx._checkin.makeupSuccess({ date }) : i18n.ts._checkin.alreadyMadeUp;
		if (result.earnedMakeupCards > 0) message += ` ${i18n.tsx._checkin.cardRewardReceived({ n: result.earnedMakeupCards })}`;
		os.toast(message, 'success');
	} catch (cause) {
		if (sequence !== request) return;
		const code = (cause as { code?: string } | null)?.code;
		error.value = code === 'NO_MAKEUP_CARDS' ? i18n.ts._checkin.noMakeupCards : code === 'INVALID_CHECKIN_DATE' ? i18n.ts._checkin.invalidMakeupDate : i18n.ts._checkin.makeupFailed;
	} finally {
		posting.value = false;
		pendingOperation.value = null;
		refreshIfNeeded();
	}
}

async function exchangeCard(fromMakeup = false) {
	if (posting.value || loading.value || statusStale.value || !status.value) return;
	const returnFocusTo = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : undefined;
	posting.value = true;
	pendingOperation.value = 'exchange';
	const sequence = ++request;
	try {
		const cost = status.value.makeupCardExchangeCost;
		if (!exchangeRequestId.value && exchangeBlockedReason.value) {
			await os.alert({ type: 'warning', title: fromMakeup ? i18n.ts._checkin.noMakeupCardsTitle : i18n.ts._checkin.exchangeCard, text: exchangeBlockedReason.value });
			return;
		}
		const { default: CheckinExchangeDialog } = await import('@/pages/checkin.exchange-dialog.vue');
		if (sequence !== request) return;
		const confirmed = await new Promise<boolean>(resolve => {
			const { dispose } = os.popup(CheckinExchangeDialog, {
				cost,
				points: status.value!.points,
				canConfirm: !!exchangeRequestId.value || status.value!.points >= cost,
				returnFocusTo,
			}, {
				done: resolve,
				closed: () => { dispose(); exchangeFocusTarget.value = returnFocusTo; resolve(false); },
			});
		});
		if (!confirmed || sequence !== request) return;
		error.value = '';
		exchangeRequestId.value ??= crypto.randomUUID();
		const result = await misskeyApi('i/checkin-exchange', { requestId: exchangeRequestId.value });
		if (sequence !== request) return;
		exchangeRequestId.value = undefined;
		retryExchange.value = false;
		// Reload the selected month so concurrent gifts and check-ins cannot leave stale balances.
		pendingBroadcast = true;
		refreshAfterLoad = true;
		status.value = { ...status.value, points: result.points, makeupCards: result.makeupCards, makeupCardExchangeAvailable: false };
		os.toast(i18n.ts._checkin.cardExchangeSuccess, 'success');
	} catch (cause) {
		if (sequence !== request) return;
		const code = (cause as { code?: string } | null)?.code;
		if (code === 'INSUFFICIENT_CHECKIN_POINTS' || code === 'MONTHLY_EXCHANGE_LIMIT' || code === 'CARD_LIMIT_EXCEEDED') {
			exchangeRequestId.value = undefined;
			retryExchange.value = false;
			error.value = code === 'MONTHLY_EXCHANGE_LIMIT' ? i18n.ts._checkin.monthlyExchangeLimit : code === 'CARD_LIMIT_EXCEEDED' ? i18n.tsx._checkin.cardHoldingLimit({ limit: status.value!.makeupCardLimit }) : i18n.tsx._checkin.noPointsForCard({ cost: status.value!.makeupCardExchangeCost, current: status.value!.makeupCardProgress, target: status.value!.makeupCardTarget });
			if (code === 'MONTHLY_EXCHANGE_LIMIT') status.value = { ...status.value!, makeupCardExchangeAvailable: false };
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
		i18n.tsx._checkin.cardRewardRule({ target: status.value?.makeupCardTarget ?? 30 }), i18n.tsx._checkin.exchangeCost({ cost: status.value?.makeupCardExchangeCost ?? 60 }),
		i18n.tsx._checkin.cardHoldingRule({ limit: status.value?.makeupCardLimit ?? 3 }),
	].join('\n\n') });
}

watch(sharedStatus, incoming => {
	if (publishing || !incoming) return;
	// A broadcast is only an invalidation signal, not a complete calendar snapshot.
	statusStale.value = true;
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

watch([exchangeFocusTarget, loading, posting], async ([target, isLoading, isPosting]) => {
	if (!target || isLoading || isPosting) return;
	exchangeFocusTarget.value = undefined;
	await nextTick();
	// 弹窗关闭和余额刷新都结束后恢复焦点，避免聚焦到禁用按钮。
	if (!active || !pageActive.value || window.document.activeElement !== window.document.body) return;
	focusParent([target, retryButton.value, checkinButton.value].find(isFocusable), true, false);
}, { flush: 'post' });

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

definePage(() => ({ title: i18n.ts._checkin.dailyCheckin, icon: 'ti ti-calendar-check' }));
</script>

<style lang="scss" module>
@use "../styles/community.scss";

.root {
	--checkin-accent: var(--MI_THEME-link, var(--MI_THEME-accent));
	--checkin-soft: color-mix(in srgb, var(--checkin-accent) 9%, var(--MI_THEME-panel));
	--checkin-muted: color-mix(in srgb, var(--MI_THEME-fg) 68%, var(--MI_THEME-panel));
	--checkin-streak: var(--MI_THEME-warn);
	--checkin-total: var(--MI_THEME-renote);
	--checkin-gold: var(--MI-rankingGold);
	max-width: var(--MI-pageWidth);
	margin-inline: auto;
}

.rules {
	display: grid;
	place-items: center;
	width: var(--MI-headerActionSize);
	height: var(--MI-pageHeaderHeight);
}

.panel {
	container-type: inline-size;
}

.loading {
	display: grid;
	place-items: center;
	min-height: 360px;
}

.error {
	@include community.error;

	padding: 24px 32px 0;
}

.dashboard {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: var(--MI-pageGap);
}

.calendarColumn {
	min-width: 0;
	padding: 24px;
}

.calendarHeader,
.monthControls,
.calendarToolbar,
.calendarLegend,
.todayHeader,
.balanceRow,
.header,
.milestoneHeading,
.milestoneProgress {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.calendarHeader {
	gap: 16px;
}

.monthTitle {
	min-width: 0;
}

.monthTitle h2 {
	margin: 0;
	color: var(--MI_THEME-fg);
	font-size: 1.5em;
	font-weight: 650;
	letter-spacing: -.035em;
	line-height: 1.35;
}

.monthControls {
	flex-shrink: 0;
	gap: 6px;
}

.monthButton {
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	border: var(--MI-divider);
	border-radius: var(--MI-radius);
	color: var(--checkin-muted);
	transition: background-color .15s, color .15s;
}

.calendarToolbar {
	flex-wrap: wrap;
	gap: 8px;
	min-height: 24px;
	margin-block: 8px;
}

.calendarLegend {
	justify-content: flex-start;
	flex-wrap: wrap;
	gap: 16px;
	color: var(--checkin-muted);
	font-size: .78em;
}

.calendarLegend span {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.legendSigned,
.legendUnsigned {
	width: 7px;
	height: 7px;
	box-sizing: border-box;
	border-radius: 50%;
}

.legendSigned {
	background: var(--checkin-accent);
}

.legendUnsigned {
	border: 1px solid currentColor;
}

.thisMonth {
	font-size: .78em;
}

.weekdays,
.calendar {
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
}

.weekdays {
	padding-block: 8px;
	border-block: var(--MI-divider);
}

.weekday {
	color: var(--checkin-muted);
	font-size: .8em;
	text-align: center;
}

.calendar {
	grid-auto-rows: minmax(60px, auto);
	gap: 8px;
	padding-top: 10px;
}

.day {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: stretch;
	min-width: 0;
	border: var(--MI-divider);
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-panelHighlight) 35%, var(--MI_THEME-panel));
	transition: background-color .15s, border-color .15s;
}

.daySelect {
	display: flex;
	align-items: flex-start;
	flex: 1;
	width: 100%;
	min-height: 32px;
	padding: 6px 10px 0;
	border-radius: var(--MI-radius);
}

.dayTop {
	position: relative;
	display: grid;
	place-items: center;
	min-width: 20px;
	height: 24px;
}

.dayNumber {
	font-size: 1.1em;
	font-variant-numeric: tabular-nums;
	font-weight: 550;
	line-height: 1;
}

.day.completed,
.day.madeUp {
	background: color-mix(in srgb, var(--checkin-total) 9%, var(--MI_THEME-panel));
	color: color-mix(in srgb, var(--checkin-total) 65%, var(--MI_THEME-fg));
}

.day.madeUp {
	background: color-mix(in srgb, var(--checkin-gold) 10%, var(--MI_THEME-panel));
	color: color-mix(in srgb, var(--checkin-gold) 65%, var(--MI_THEME-fg));
}

.day.future .dayNumber,
.day.unavailable .dayNumber {
	color: var(--checkin-muted);
}

.day.today {
	background: linear-gradient(135deg, color-mix(in srgb, var(--checkin-accent) 62%, var(--MI-ctaBg)), color-mix(in srgb, var(--checkin-accent) 80%, var(--MI-ctaBg)));
	box-shadow: 0 3px 10px color-mix(in srgb, var(--checkin-accent) 20%, transparent);
	color: var(--MI_THEME-fgOnAccent);
}

.day.selectedDay:not(.today) {
	outline: 1px solid var(--checkin-accent);
	outline-offset: -1px;
}

.stateIcon {
	position: absolute;
	right: -3px;
	bottom: -1px;
	display: grid;
	place-items: center;
	width: 13px;
	height: 13px;
	border: 2px solid var(--MI_THEME-panel);
	border-radius: 50%;
	background: var(--checkin-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 9px;
	font-weight: 700;
}

.dayReward,
.cardReward,
.dayStatus,
.dayAction {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 3px;
	align-self: flex-start;
	max-width: calc(100% - 16px);
	min-height: 22px;
	margin: 0 8px 6px;
	box-sizing: border-box;
	color: var(--checkin-accent);
	font-size: .72em;
	line-height: 1.3;
}

.dayReward {
	color: color-mix(in srgb, var(--checkin-total) 65%, var(--MI_THEME-fg));
	font-variant-numeric: tabular-nums;
}

.today .dayReward,
.today .dayAction {
	color: var(--MI_THEME-fgOnAccent);
}

.dayStatus {
	color: var(--checkin-muted);
}

.dayAction {
	padding: 2px 7px;
	border-radius: 999px;
}

.cardReward {
	flex-wrap: wrap;
	padding-inline: 2px;
	border-radius: 999px;
	background: var(--checkin-soft);
}

.predictedReward {
	background: color-mix(in srgb, var(--checkin-gold) 10%, var(--MI_THEME-panel));
	color: color-mix(in srgb, var(--checkin-gold) 65%, var(--MI_THEME-fg));
}

.rewardLabel {
	flex-shrink: 0;
	max-width: 100%;
	overflow-wrap: anywhere;
	text-align: center;
}

.stats {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12px;
	margin: 16px 0 0;
}

.stats > div {
	--stat-color: var(--checkin-accent);

	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
	min-width: 0;
	padding: 14px 16px;
	border-radius: var(--MI-cardRadius);
	background: color-mix(in srgb, var(--stat-color) 8%, var(--MI_THEME-panel));
}

.stats > div:first-child {
	--stat-color: var(--checkin-streak);
}

.stats > div:nth-child(2) {
	--stat-color: var(--checkin-total);
}

.stats dt {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	color: var(--checkin-muted);
	font-size: .78em;
	line-height: 1.5;
	text-align: center;
}

.stats dt > i {
	color: color-mix(in srgb, var(--stat-color) 65%, var(--MI_THEME-fg));
}

.stats dd {
	margin: 0;
	color: color-mix(in srgb, var(--stat-color) 65%, var(--MI_THEME-fg));
	font-size: 1.65em;
	font-variant-numeric: tabular-nums;
	font-weight: 650;
	line-height: 1;
}

.todayPanel {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 24px;
	min-width: 0;
	padding: 20px 24px;
	border-radius: var(--MI-cardRadius);
	background: linear-gradient(135deg, color-mix(in srgb, var(--checkin-accent) 62%, var(--MI-ctaBg)), color-mix(in srgb, var(--checkin-accent) 80%, var(--MI-ctaBg)));
	color: var(--MI_THEME-fgOnAccent);
	box-shadow: 0 6px 18px color-mix(in srgb, var(--checkin-accent) 15%, transparent);
}

.todayHeader {
	justify-content: flex-start;
	flex-wrap: wrap;
	gap: 12px;
	color: var(--MI_THEME-fgOnAccent);
}

.todayHeader h2 {
	margin: 0;
	font-size: 1.35em;
	font-weight: 650;
	line-height: 1.5;
}

.todayHeader > span {
	font-size: .82em;
}

.checkin,
.exchange {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	width: 100%;
	box-sizing: border-box;
	border-radius: var(--MI-radius);
	font-weight: 600;
	line-height: 1.5;
	transition: background-color .15s, color .15s;
}

.checkin {
	flex-shrink: 0;
	width: 180px;
	min-height: 44px;
	margin-top: 0;
	padding: 10px;
	background: var(--MI_THEME-fgOnAccent);
	color: color-mix(in srgb, var(--checkin-accent) 62%, var(--MI-ctaBg));
	font-size: .95em;
}

.checkin.checkedIn {
	background: color-mix(in srgb, var(--MI-ctaBg) 22%, transparent);
	color: var(--MI_THEME-fgOnAccent);
}

.checkin > i {
	font-size: 1.2em;
}

.rewardHint {
	display: flex;
	align-items: center;
	justify-content: flex-start;
	gap: 5px;
	margin: 6px 0 0;
	color: var(--MI_THEME-fgOnAccent);
	font-size: .73em;
	line-height: 1.6;
}

.walletPanel {
	min-width: 0;
	padding: 22px 24px;
	border: var(--MI-divider);
	border-radius: var(--MI-cardRadius);
	background: linear-gradient(145deg, color-mix(in srgb, var(--checkin-gold) 10%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
}

.walletSummary {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, .65fr) minmax(0, 1.5fr);
	align-items: center;
	gap: 24px;
}

.balanceRow {
	flex-direction: column;
	align-items: flex-start;
	gap: 6px;
	font-size: .85em;
}

.balanceRow > span {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	color: var(--checkin-muted);
}

.balanceRow i {
	color: color-mix(in srgb, var(--checkin-gold) 80%, var(--MI_THEME-fg));
	font-size: 1.2em;
}

.balanceRow strong {
	font-size: 1.6em;
	font-variant-numeric: tabular-nums;
	font-weight: 650;
	overflow-wrap: anywhere;
}

.progressSection {
	min-width: 0;
}

.progressHeading,
.streakEncouragement,
.exchangeHint,
.exchangeBlocked {
	margin: 0;
	color: var(--checkin-muted);
	font-size: .77em;
	line-height: 1.75;
}

.cardProgress,
.milestoneProgress progress {
	display: block;
	width: 100%;
	height: 4px;
	border: 0;
	border-radius: 999px;
	background: var(--checkin-soft);
	overflow: hidden;
	appearance: none;
}

.cardProgress {
	margin: 9px 0 0;
	background: color-mix(in srgb, var(--checkin-gold) 13%, var(--MI_THEME-panel));
}

.cardProgress::-webkit-progress-bar,
.milestoneProgress progress::-webkit-progress-bar {
	background: transparent;
}

.cardProgress::-webkit-progress-value,
.milestoneProgress progress::-webkit-progress-value {
	border-radius: 999px;
	background: var(--checkin-accent);
}

.cardProgress::-webkit-progress-value {
	background: var(--checkin-gold);
}

.cardProgress::-moz-progress-bar,
.milestoneProgress progress::-moz-progress-bar {
	border-radius: 999px;
	background: var(--checkin-accent);
}

.cardProgress::-moz-progress-bar {
	background: var(--checkin-gold);
}

.streakEncouragement {
	margin-top: 10px;
}

.exchangePanel {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 12px 24px;
	margin-top: 16px;
	padding-top: 16px;
	border-block-start: var(--MI-divider);
}

.exchangeHint {
	flex: 1;
}

.exchange {
	flex-shrink: 0;
	width: auto;
	min-width: 150px;
	min-height: 38px;
	margin: 0;
	padding: 8px;
	border: var(--MI-divider);
	background: var(--MI_THEME-panel);
	color: color-mix(in srgb, var(--checkin-gold) 68%, var(--MI_THEME-fg));
	font-size: .85em;
}

.exchangeBlocked {
	flex-basis: 100%;
	color: var(--MI_THEME-warn);
}

.achievements {
	margin-top: var(--MI-pageGap);
	padding: 24px;
}

.header {
	flex-wrap: wrap;
	gap: 12px 20px;
	margin-bottom: 20px;
}

.header > div {
	display: flex;
	align-items: baseline;
	flex-wrap: wrap;
	gap: 8px 12px;
}

.header h2 {
	margin: 0;
	font-size: 1.15em;
	font-weight: 650;
}

.header p {
	margin: 0;
	color: var(--checkin-muted);
	font-size: .78em;
}

.header > a {
	font-size: .82em;
}

.milestones {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 14px;
}

.milestone {
	--milestone-color: var(--checkin-total);

	display: flex;
	align-items: flex-start;
	gap: 12px;
	min-width: 0;
	padding: 16px;
	border-radius: var(--MI-cardRadius);
	background: color-mix(in srgb, var(--MI_THEME-panelHighlight) 65%, var(--MI_THEME-panel));
}

.milestone.streakMilestone {
	--milestone-color: var(--checkin-streak);
}

.milestone.unlocked {
	background: color-mix(in srgb, var(--checkin-gold) 8%, var(--MI_THEME-panel));
}

.medal {
	flex-shrink: 0;
	width: 44px;
	height: 44px;
	filter: grayscale(.2);
	opacity: .8;
}

.unlocked .medal {
	filter: none;
	opacity: 1;
}

.milestoneBody {
	flex: 1;
	min-width: 0;
}

.milestoneHeading {
	flex-wrap: wrap;
	gap: 4px 8px;
}

.milestone h3 {
	margin: 0;
	font-size: .9em;
	font-weight: 600;
	line-height: 1.5;
}

.milestone p {
	margin: 5px 0 10px;
	color: var(--checkin-muted);
	font-size: .77em;
	line-height: 1.65;
}

.milestoneProgress {
	gap: 8px;
}

.milestoneProgress progress {
	flex: 1;
	min-width: 0;
	margin: 0;
	background: color-mix(in srgb, var(--milestone-color) 12%, var(--MI_THEME-panel));
}

.milestoneProgress progress::-webkit-progress-value {
	background: var(--milestone-color);
}

.milestoneProgress progress::-moz-progress-bar {
	background: var(--milestone-color);
}

.progress {
	flex-shrink: 0;
	color: var(--checkin-muted);
	font-size: .7em;
	font-variant-numeric: tabular-nums;
}

.earned {
	color: color-mix(in srgb, var(--checkin-gold) 68%, var(--MI_THEME-fg));
	font-size: .7em;
}

.monthButton:disabled,
.checkin:disabled,
.dayAction:disabled,
.exchange:disabled {
	cursor: default;
	opacity: .45;
}

.monthButton:focus-visible,
.checkin:focus-visible,
.daySelect:focus-visible,
.dayAction:focus-visible,
.exchange:focus-visible {
	outline: 2px solid var(--MI_THEME-focus);
	outline-offset: 3px;
}

.spin {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	to { transform: rotate(1turn); }
}

@media (hover: hover) {
	.monthButton:enabled:hover,
	.dayAction:enabled:hover,
	.exchange:enabled:hover {
		background: var(--checkin-soft);
		color: var(--checkin-accent);
	}

	.daySelect:hover .dayTop {
		color: var(--checkin-accent);
	}

	.day.today .daySelect:hover .dayTop {
		color: var(--MI_THEME-fgOnAccent);
	}

	.checkin:enabled:hover {
		background: color-mix(in srgb, var(--MI_THEME-fgOnAccent) 90%, transparent);
	}

	.checkin.checkedIn:enabled:hover {
		background: color-mix(in srgb, var(--MI-ctaBg) 30%, transparent);
	}
}

@media (prefers-reduced-motion: reduce) {
	.monthButton,
	.day,
	.checkin,
	.exchange,
	.spin {
		transition: none;
		animation: none;
	}
}

@container (max-width: 800px) {
	.milestones {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@container (max-width: 600px) {
	.todayPanel {
		gap: 18px;
		padding: 20px;
	}

	.todayHeader h2 {
		font-size: 1.2em;
	}

	.checkin {
		width: 150px;
	}

	.calendarColumn,
	.walletPanel {
		padding: 20px;
	}

	.stats > div {
		padding-inline: 12px;
	}

	.stats dt > i {
		display: none;
	}

	.walletSummary {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
	}

	.progressSection {
		grid-column: 1 / -1;
	}
}

@container (max-width: 480px) {
	.todayPanel {
		gap: 12px;
		padding: 18px;
	}

	.todayPanel > div {
		min-width: 0;
	}

	.todayHeader {
		gap: 4px 8px;
	}

	.todayHeader h2 {
		font-size: 1.1em;
	}

	.checkin {
		width: 128px;
		font-size: .85em;
	}

	.calendarColumn,
	.walletPanel,
	.achievements {
		padding: 20px 18px;
	}

	.monthTitle h2 {
		font-size: 1.3em;
	}

	.monthControls {
		gap: 5px;
	}

	.monthButton {
		width: 32px;
		height: 32px;
	}

	.calendar {
		gap: 5px;
	}

	.daySelect {
		padding: 6px 5px 0;
	}

	.cardReward > i {
		display: none;
	}

	.cardReward {
		padding-inline: 0;
	}

	.dayReward,
	.cardReward,
	.dayStatus,
	.dayAction {
		max-width: calc(100% - 8px);
		margin-inline: 4px;
		font-size: .65em;
	}

	.stats {
		gap: 8px;
		margin-top: 14px;
	}

	.stats > div {
		flex-direction: column-reverse;
		padding: 12px 6px;
	}

	.stats dt {
		font-size: .72em;
	}

	.stats dd {
		font-size: 1.65em;
	}

	.exchangePanel {
		flex-direction: column;
		align-items: stretch;
		gap: 12px;
	}

	.exchange {
		width: 100%;
	}

	.milestones {
		grid-template-columns: minmax(0, 1fr);
		gap: 14px;
	}
}

@container (max-width: 340px) {
	.calendarColumn,
	.walletPanel {
		padding-inline: 14px;
	}

	.todayPanel {
		padding: 16px;
	}

	.todayHeader h2 {
		font-size: 1em;
	}

	.dayTop {
		min-width: 18px;
	}

	.weekday {
		font-size: .72em;
	}

	.stats dt {
		font-size: .68em;
	}
}
</style>
