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
									<button v-if="status.month !== status.today.slice(0, 7)" type="button" class="_textButton" :class="$style.thisMonth" :disabled="loading || posting || statusStale" @click="load()">{{ i18n.ts._checkin.currentMonth }}</button>
								</div>
								<div :class="$style.cardCount">
									<i class="ti ti-ticket" aria-hidden="true"></i>
									<I18n :src="i18n.ts._checkin.makeupCardsCount"><template #n><span :class="$style.cardAmount" data-testid="checkin-makeup-cards">{{ status.makeupCards }}</span></template></I18n>
								</div>
							</div>
							<div :class="$style.calendarLegend" :aria-label="i18n.ts._checkin.calendarStates">
								<span><i :class="$style.legendToday"></i>{{ i18n.ts._checkin.todayLabel }}</span>
									<span><i :class="$style.legendSigned"></i>{{ i18n.ts._checkin.signed }}</span>
									<span><i :class="$style.legendMakeup"></i>{{ i18n.ts._checkin.madeUp }}</span>
									<span><i :class="$style.legendMissed"></i>{{ i18n.ts._checkin.notCheckedIn }}</span>
							</div>
							<div ref="calendarElement" :class="$style.calendar" data-testid="checkin-calendar">
								<div v-for="weekday in weekdays" :key="weekday" :class="$style.weekday">{{ weekday }}</div>
								<template v-for="(date, index) in dates" :key="date ?? `empty-${index}`">
									<div v-if="date" role="group" :class="[$style.day, $style[calendarState(date)], { [$style.today]: date === status.today, [$style.selectedDay]: date === selectedDate }]" :aria-label="i18n.tsx._checkin.dateState({ date, state: dayState(date) })" :aria-current="date === status.today ? 'date' : undefined" :data-checkin-date="date" :data-day-state="calendarState(date)">
										<button type="button" class="_button" :class="$style.daySelect" :aria-label="i18n.tsx._checkin.dateState({ date, state: dayState(date) })" :aria-pressed="date === selectedDate" :tabindex="date === selectedDate ? 0 : -1" :data-date-select="date" @click="selectedDate = date" @keydown="moveCalendarFocus($event, date)">
											<span :class="$style.dayTop"><time :datetime="date" :class="$style.dayNumber">{{ Number(date.slice(-2)) }}</time><i :class="['ti', dayIcon(date), $style.stateIcon]" aria-hidden="true"></i></span>
										</button>
										<span v-if="rewardDates.has(date) || predictedRewardDates.has(date)" :class="[$style.cardReward, { [$style.predictedReward]: !rewardDates.has(date) }]" :title="rewardDates.has(date) ? i18n.ts._checkin.calendarRewardReceived : i18n.ts._checkin.calendarRewardExpected" :aria-label="rewardDates.has(date) ? i18n.ts._checkin.calendarRewardReceived : i18n.ts._checkin.calendarRewardExpected" :data-card-reward="rewardDates.has(date) ? 'received' : 'expected'"><i :class="rewardDates.has(date) ? 'ti ti-ticket' : 'ti ti-gift'" aria-hidden="true"></i>{{ rewardDates.has(date) ? i18n.ts._checkin.earned : i18n.ts._checkin.rewardPreview }}</span>
										<button v-else-if="date === status.today && !status.checkedInToday" type="button" class="_button" :class="$style.dayAction" :aria-label="i18n.ts._checkin.checkIn" :disabled="loading || posting || statusStale" @click="checkIn()"><i class="ti ti-plus" aria-hidden="true"></i>{{ i18n.ts._checkin.checkIn }}</button>
										<button v-else-if="canMakeup(date)" type="button" class="_button" :class="[$style.dayAction, $style.makeup]" :aria-label="i18n.tsx._checkin.makeupDate({ date })" :disabled="loading || posting || statusStale" @click="selectedDate = date; makeUp(date)">{{ i18n.ts._checkin.pendingMakeup }}</button>
										<span v-else-if="checkedDates.has(date) && !makeupDates.has(date)" :class="$style.dayReward" :aria-label="i18n.tsx._checkin.pointsEarned({ n: 1 })"><i class="ti ti-diamond-filled" aria-hidden="true"></i>+1</span>
									</div>
									<div v-else aria-hidden="true"></div>
								</template>
							</div>
							<div v-if="selectedDate" :class="$style.dayDetails" data-testid="checkin-day-details" aria-live="polite">
								<i :class="['ti', dayIcon(selectedDate), $style.detailIcon]" aria-hidden="true"></i>
								<div><strong>{{ selectedDateLabel }}</strong><p>{{ dayState(selectedDate) }}<template v-if="rewardDates.has(selectedDate)"> · {{ i18n.ts._checkin.calendarRewardReceived }}</template><template v-else-if="predictedRewardDates.has(selectedDate)"> · {{ i18n.ts._checkin.calendarRewardExpected }}</template><template v-else-if="makeupDates.has(selectedDate)"> · {{ i18n.ts._checkin.makeupNoPoints }}</template></p></div>
							</div>
							<p :class="$style.rewardLegend"><i class="ti ti-ticket" aria-hidden="true"></i> {{ i18n.ts._checkin.calendarRewardLegend }}</p>
						</section>
					</template>
				</div>
				<div :class="$style.actionColumn">
					<time v-if="status" :datetime="status.today" :class="$style.todayDate">{{ i18n.ts.today }} · {{ todayLabel }}</time>
					<button ref="checkinButton" type="button" class="_button" :class="[$style.checkin, { [$style.checkedIn]: status?.checkedInToday }]" :disabled="!status || loading || posting || statusStale" data-testid="checkin-submit" @click="checkIn">
						{{ pendingOperation === 'checkin' ? i18n.ts._checkin.checkingIn : status?.checkedInToday ? i18n.ts._checkin.checkedIn : i18n.ts._checkin.checkIn }}
					</button>
					<div v-if="status" :class="$style.rewards">
						<p :class="$style.rewardHint">{{ i18n.ts._checkin.dailyReward }}</p>
						<dl :class="$style.balances">
							<div><dt><i class="ti ti-coin" aria-hidden="true"></i> {{ i18n.ts._checkin.points }}</dt><dd data-testid="checkin-points">{{ status.points }}</dd></div>
						</dl>
						<p data-testid="checkin-card-progress">{{ i18n.tsx._checkin.cardRewardProgress({ current: status.makeupCardProgress, target: status.makeupCardTarget }) }}</p>
						<progress :class="$style.cardProgress" :value="status.makeupCardProgress" :max="status.makeupCardTarget" :aria-label="i18n.tsx._checkin.cardRewardProgress({ current: status.makeupCardProgress, target: status.makeupCardTarget })"></progress>
						<p v-if="streakEncouragement" data-testid="checkin-streak-encouragement">{{ streakEncouragement }}</p>
						<p>{{ i18n.tsx._checkin.exchangeCost({ cost: status.makeupCardExchangeCost }) }}</p>
						<button type="button" class="_button" :class="$style.exchange" :disabled="loading || posting || statusStale || (!!exchangeBlockedReason && !exchangeRequestId)" data-testid="checkin-exchange" @click="exchangeCard()"><i class="ti ti-ticket" aria-hidden="true"></i> {{ pendingOperation === 'exchange' ? i18n.ts._checkin.exchangingCard : i18n.ts._checkin.exchangeCard }}</button>
						<p v-if="exchangeBlockedReason" data-testid="checkin-exchange-unavailable">{{ exchangeBlockedReason }}</p>
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
import { checkinCalendar, checkinDateInZone, checkinRewardForecast, shiftCheckinMonth } from '@/utility/checkin.js';
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
const statusStale = ref(true);
const selectedDate = ref('');
const calendarElement = useTemplateRef<HTMLElement>('calendarElement');
const loading = ref(false);
const posting = ref(false);
const pendingOperation = ref<'checkin' | 'makeup' | 'exchange' | null>(null);
const exchangeRequestId = ref<string>();
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
const rewardDates = computed(() => new Set(status.value?.rewardDates));
const predictedRewardDates = computed(() => status.value && !statusStale.value ? checkinRewardForecast(status.value) : new Set<string>());
const dates = computed(() => status.value ? checkinCalendar(status.value.month) : []);
const selectedDateLabel = computed(() => selectedDate.value ? new Intl.DateTimeFormat(versatileLang, { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${selectedDate.value}T00:00:00Z`)) : '');
watch(() => status.value?.month, () => {
	selectedDate.value = status.value?.month === status.value?.today.slice(0, 7) ? status.value?.today ?? '' : dates.value.find((date): date is string => date !== null) ?? '';
});
const monthLabel = computed(() => status.value ? new Intl.DateTimeFormat(versatileLang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${status.value.month}-01T00:00:00Z`)) : '');
const todayLabel = computed(() => status.value ? new Intl.DateTimeFormat(versatileLang, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${status.value.today}T00:00:00Z`)) : '');
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

function calendarState(date: string): string {
	if (makeupDates.value.has(date)) return 'madeUp';
	if (checkedDates.value.has(date)) return 'completed';
	if (date < status.value!.registeredDate) return 'unavailable';
	if (date > status.value!.today) return 'future';
	if (date === status.value!.today) return 'pending';
	return canMakeup(date) ? 'missed' : 'expired';
}

function dayIcon(date: string): string {
	switch (calendarState(date)) {
		case 'completed': return 'ti-circle-check-filled';
		case 'madeUp': return 'ti-history';
		case 'pending': return 'ti-sun';
		case 'missed': return 'ti-circle-dashed';
		case 'expired': return 'ti-circle-minus';
		case 'unavailable': return 'ti-lock';
		default: return 'ti-point';
	}
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
		notice.value = '';
		const requestedAt = new Date();
		const result = await misskeyApi('i/checkin-makeup', { date });
		if (sequence !== request) return;
		applyMutationStatus(result, requestedAt);
		notice.value = result.newlyCheckedIn ? i18n.tsx._checkin.makeupSuccess({ date }) : i18n.ts._checkin.alreadyMadeUp;
		if (result.earnedMakeupCards > 0) notice.value += ` ${i18n.tsx._checkin.cardRewardReceived({ n: result.earnedMakeupCards })}`;
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
	posting.value = true;
	pendingOperation.value = 'exchange';
	const sequence = ++request;
	try {
		const cost = status.value.makeupCardExchangeCost;
		if (!exchangeRequestId.value && exchangeBlockedReason.value) {
			await os.alert({ type: 'warning', title: fromMakeup ? i18n.ts._checkin.noMakeupCardsTitle : i18n.ts._checkin.exchangeCard, text: exchangeBlockedReason.value });
			return;
		}
		if (!exchangeRequestId.value && status.value.points < cost) {
			await os.alert({
				type: 'warning',
				title: fromMakeup ? i18n.ts._checkin.noMakeupCardsTitle : i18n.ts._checkin.exchangeCard,
				text: i18n.tsx._checkin.noPointsForCardShort({ cost, target: status.value.makeupCardTarget }),
				progress: {
					value: status.value.makeupCardProgress,
					max: status.value.makeupCardTarget,
					label: i18n.tsx._checkin.cardRewardProgress({ current: status.value.makeupCardProgress, target: status.value.makeupCardTarget }),
				},
			});
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
		exchangeRequestId.value ??= crypto.randomUUID();
		const result = await misskeyApi('i/checkin-exchange', { requestId: exchangeRequestId.value });
		if (sequence !== request) return;
		exchangeRequestId.value = undefined;
		retryExchange.value = false;
		// Reload the selected month so concurrent gifts and check-ins cannot leave stale balances.
		pendingBroadcast = true;
		refreshAfterLoad = true;
		status.value = { ...status.value, points: result.points, makeupCards: result.makeupCards, makeupCardExchangeAvailable: false };
		notice.value = i18n.ts._checkin.cardExchangeSuccess;
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
.header { @include page-header.surface; --MI-pageHeaderRadius: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: var(--height); padding: 0 var(--MI-cardPadding); }
.header h1, .header h2 { margin: 0; font-size: 1em; }
.body { padding: var(--MI-cardPadding); }
.dashboard { display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 27%); align-items: start; gap: 28px; }
.calendarColumn, .actionColumn { min-width: 0; }
.actionColumn { display: flex; flex-direction: column; gap: 12px; }
.checkin { display: inline-flex; justify-content: center; align-items: center; gap: 8px; width: 100%; min-height: 48px; box-sizing: border-box; padding: 16px; border-radius: calc(var(--MI-radius) / 2); font-size: 1.05em; font-weight: bold; color: var(--MI_THEME-fgOnAccent); background: var(--MI_THEME-link, var(--MI_THEME-accent)); }
.checkin.checkedIn { color: var(--MI_THEME-link, var(--MI_THEME-accent)); background: color-mix(in srgb, var(--MI_THEME-link, var(--MI_THEME-accent)) 10%, var(--MI_THEME-panel)); }
.checkin:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 3px; }
.checkin:disabled { opacity: .65; cursor: default; }
.error { @include community.error; }
.notice { margin: 0 0 12px; color: var(--MI_THEME-accent); line-height: 1.7; }
.rewards { padding: var(--MI-cardPadding); border-radius: calc(var(--MI-radius) / 2); background: var(--MI_THEME-accentedBg); }
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
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; padding: var(--MI-cardPadding); background: color-mix(in srgb, var(--MI_THEME-fg) 4%, var(--MI_THEME-panel)); border-radius: calc(var(--MI-radius) / 2); }
.stats > div { display: flex; flex-direction: column-reverse; align-items: center; gap: 6px; text-align: center; }
.stats dt { font-size: .8em; color: var(--MI_THEME-fgTransparentWeak); }
.stats dd { font-size: 1.6em; font-weight: bold; margin: 0; font-variant-numeric: tabular-nums; }
.stats > div:first-child dd { color: var(--MI_THEME-accent); }
.monthNav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 20px 0 12px; }
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
.calendarLegend { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 0 0 20px; color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; }
.calendarLegend span { display: inline-flex; align-items: center; gap: 6px; }
.calendarLegend i { width: 8px; height: 8px; border-radius: 50%; box-sizing: border-box; }
.legendToday { background: var(--MI_THEME-link); }
.legendSigned { background: var(--MI_THEME-accent); }
.legendMakeup { background: var(--MI_THEME-warn); }
.legendMissed { border: 1px dashed var(--MI_THEME-fgTransparentWeak); }
.calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.weekday { padding: 0 0 8px; text-align: center; color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; }
.day { --dayColor: var(--MI_THEME-fgTransparentWeak); position: relative; display: flex; min-width: 0; min-height: 72px; align-items: stretch; flex-direction: column; gap: 4px; padding: 5px; border: 1px solid transparent; border-radius: calc(var(--MI-radius) / 1.5); background: color-mix(in srgb, var(--MI_THEME-fg) 3%, var(--MI_THEME-panel)); box-sizing: border-box; transition: border-color .18s, background .18s, box-shadow .18s, transform .18s; }
.daySelect { display: flex; flex: 1; flex-direction: column; gap: 8px; padding: 5px; min-width: 0; text-align: left; border-radius: calc(var(--MI-radius) / 2); }
.dayTop { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 2px; }
.dayNumber { font-size: 1em; font-weight: 650; line-height: 1.2; font-variant-numeric: tabular-nums; }
.stateIcon { color: var(--dayColor); font-size: .95em; }
.dayReward, .cardReward, .dayAction { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 3px; min-height: 23px; border-radius: calc(var(--MI-radius) / 3); font-size: .65em; line-height: 1.4; box-sizing: border-box; }
.dayReward { color: var(--MI_THEME-accent); }
.dayReward > i { font-size: 1.1em; }
.dayAction { width: 100%; color: var(--dayColor); background: color-mix(in srgb, var(--dayColor) 9%, var(--MI_THEME-panel)); overflow-wrap: anywhere; }
.dayAction:disabled { opacity: .5; cursor: wait; }
.cardReward { color: var(--MI_THEME-warn); background: color-mix(in srgb, var(--MI_THEME-warn) 12%, var(--MI_THEME-panel)); padding: 1px 2px; overflow-wrap: anywhere; }
.predictedReward { background: transparent; border: 1px dashed color-mix(in srgb, var(--MI_THEME-warn) 55%, transparent); }
.day.completed { --dayColor: var(--MI_THEME-accent); background: color-mix(in srgb, var(--MI_THEME-accent) 9%, var(--MI_THEME-panel)); }
.day.madeUp { --dayColor: var(--MI_THEME-warn); background: color-mix(in srgb, var(--MI_THEME-warn) 8%, var(--MI_THEME-panel)); }
.day.missed { border-color: var(--MI_THEME-divider); border-style: dashed; }
.day.expired, .day.unavailable { background: transparent; }
.day.expired .dayNumber, .day.unavailable .dayNumber, .day.future .dayNumber { color: var(--MI_THEME-fgTransparentWeak); }
.day.today { border-color: var(--MI_THEME-link); box-shadow: 0 0 0 2px color-mix(in srgb, var(--MI_THEME-link) 12%, transparent); }
.day.pending { --dayColor: var(--MI_THEME-link); background: linear-gradient(145deg, color-mix(in srgb, var(--MI_THEME-link) 12%, var(--MI_THEME-panel)), var(--MI_THEME-panel)); }
.day.pending .dayNumber { color: var(--MI_THEME-link); }
.day.selectedDay { box-shadow: inset 0 -3px var(--dayColor); }
.day:focus-within { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.daySelect:focus-visible { outline: none; }
.dayAction:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
@media (hover: hover) {
	.day:hover { transform: translateY(-2px); border-color: var(--dayColor); box-shadow: 0 5px 14px color-mix(in srgb, var(--dayColor) 12%, transparent); }
	.dayAction:enabled:hover { background: color-mix(in srgb, var(--dayColor) 18%, var(--MI_THEME-panel)); }
}
.dayDetails { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: var(--MI-cardPadding); margin-top: 12px; border-radius: calc(var(--MI-radius) / 1.5); background: color-mix(in srgb, var(--MI_THEME-link) 5%, var(--MI_THEME-panel)); border: 1px solid color-mix(in srgb, var(--MI_THEME-link) 15%, transparent); box-sizing: border-box; }
.detailIcon { color: var(--MI_THEME-link); font-size: 1.4em; }
.dayDetails > div { min-width: 0; flex: 1; }
.dayDetails strong { font-size: .85em; }
.dayDetails p { margin: 5px 0 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; line-height: 1.6; overflow-wrap: anywhere; }
.rewardLegend { margin: 12px 0 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; line-height: 1.7; }
@media (prefers-reduced-motion: reduce) { .day { transition: none; } .day:hover { transform: none; } }
.todayDate { color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; line-height: 1.5; }
.achievements { margin-top: 20px; }
.milestones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: var(--MI-cardPadding); }
.milestone { display: flex; align-items: center; gap: 14px; padding: var(--MI-cardPadding); border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); }
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
	.checkin { min-height: 48px; padding: 12px 16px; }}
@container (max-width: 480px) {
	.stats { gap: 6px; }
	.stats dd { font-size: 1.4em; }
	.monthNav { gap: 8px; }
	.monthNav h2 { font-size: 1.1em; }
	.cardCount { font-size: .75em; }
	.calendar { gap: 4px; }
	.day { min-height: 64px; padding: 3px; }
	.daySelect { padding: 3px 0; gap: 6px; }
	.dayNumber { font-size: 1.1em; }
	.stateIcon { font-size: .7em; }
	.dayAction, .cardReward, .dayReward { font-size: .6em; }
	.dayDetails { gap: 8px; flex-wrap: wrap; }
	.calendarLegend { gap: 8px 12px; font-size: .7em; }
}
@media (max-width: 600px) {
	.milestones { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 360px) {
	.dayTop { flex-direction: column; gap: 3px; }
	.daySelect { align-items: center; text-align: center; }
}
</style>
