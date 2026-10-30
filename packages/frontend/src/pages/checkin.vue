<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<template #header-actions><button type="button" class="_button _iconButton" :class="$style.rules" :aria-label="i18n.ts._checkin.rules" @click="showRules"><i class="ti ti-help-circle" aria-hidden="true"></i></button></template>
<div class="_pageBody" :class="$style.root">
	<section class="_panel _card" :class="$style.panel" :aria-busy="loading || posting">
		<div :class="$style.body">
			<div v-if="error" role="alert" :class="$style.error">{{ error }} <button v-if="!posting" class="_textButton" @click="retry">{{ i18n.ts.retry }}</button></div>
			<div :class="$style.dashboard">
				<div :class="$style.calendarColumn">
					<MkLoading v-if="!status && loading"/>
					<template v-if="status">
						<dl :class="$style.stats">
							<div><i class="ti ti-flame" :class="$style.statWatermark" aria-hidden="true"></i><dt>{{ i18n.ts._checkin.consecutiveDays }}</dt><dd>{{ status.consecutiveDays }}</dd></div>
							<div><i class="ti ti-sparkles" :class="$style.statWatermark" aria-hidden="true"></i><dt>{{ i18n.ts._checkin.totalDays }}</dt><dd>{{ status.totalDays }}</dd></div>
							<div><i class="ti ti-calendar-check" :class="$style.statWatermark" aria-hidden="true"></i><dt>{{ i18n.ts._checkin.monthlyDays }}</dt><dd>{{ status.monthlyDays }}</dd></div>
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
								<span><i class="ti ti-circle-check-filled" :class="$style.legendSigned" aria-hidden="true"></i>{{ i18n.ts._checkin.signed }}</span>
								<span><i class="ti ti-circle-dashed" :class="$style.legendUnsigned" aria-hidden="true"></i>{{ i18n.ts._checkin.notCheckedIn }}</span>
							</div>
							<div ref="calendarElement" :class="$style.calendar" data-testid="checkin-calendar">
								<div v-for="weekday in weekdays" :key="weekday" :class="$style.weekday">{{ weekday }}</div>
								<template v-for="(date, index) in dates" :key="date ?? `empty-${index}`">
									<div v-if="date" role="group" :class="[$style.day, $style[calendarState(date)], { [$style.today]: date === status.today, [$style.selectedDay]: date === selectedDate }]" :aria-label="i18n.tsx._checkin.dateState({ date, state: dayState(date) })" :aria-current="date === status.today ? 'date' : undefined" :data-checkin-date="date" :data-day-state="calendarState(date)">
										<button type="button" class="_button" :class="$style.daySelect" :aria-label="dayLabel(date)" :aria-pressed="date === selectedDate" :tabindex="date === selectedDate ? 0 : -1" :data-date-select="date" :title="dayLabel(date)" @click="selectedDate = date" @keydown="moveCalendarFocus($event, date)">
											<span :class="$style.dayTop"><time :datetime="date" :class="$style.dayNumber">{{ Number(date.slice(-2)) }}</time><i v-if="checkedDates.has(date) || makeupDates.has(date) || date === status.today" :class="['ti', dayIcon(date), $style.stateIcon]" aria-hidden="true"></i></span>
											<span v-if="calendarState(date) === 'expired'" :class="$style.dayStatus">{{ i18n.ts._checkin.notCheckedIn }}</span>
										</button>
										<span v-if="rewardDates.has(date) || predictedRewardDates.has(date)" :class="[$style.cardReward, { [$style.predictedReward]: !rewardDates.has(date) }]" :title="rewardDates.has(date) ? i18n.ts._checkin.calendarRewardReceived : i18n.ts._checkin.calendarRewardExpected" :aria-label="rewardDates.has(date) ? i18n.ts._checkin.calendarRewardReceived : i18n.ts._checkin.calendarRewardExpected" :data-card-reward="rewardDates.has(date) ? 'received' : 'expected'"><i :class="rewardDates.has(date) ? 'ti ti-ticket' : 'ti ti-gift'" aria-hidden="true"></i><span :class="$style.rewardLabel">{{ rewardDates.has(date) ? i18n.ts._checkin.earned : i18n.ts._checkin.rewardPreview }}</span></span>
										<button v-else-if="date === status.today && !status.checkedInToday" type="button" class="_button" :class="$style.dayAction" :aria-label="i18n.ts._checkin.checkIn" :disabled="loading || posting || statusStale" @click="checkIn()"><i class="ti ti-plus" aria-hidden="true"></i>{{ i18n.ts._checkin.checkIn }}</button>
										<button v-else-if="canMakeup(date)" type="button" class="_button" :class="[$style.dayAction, $style.makeup]" :aria-label="i18n.tsx._checkin.makeupDate({ date })" :disabled="loading || posting || statusStale" @click="selectedDate = date; makeUp(date)">{{ i18n.ts._checkin.makeup }}</button>
										<span v-else-if="checkedDates.has(date) && !makeupDates.has(date)" :class="$style.dayReward" :aria-label="i18n.tsx._checkin.pointsEarned({ n: 1 })"><i class="ti ti-coins" aria-hidden="true"></i>+1</span>
										<span v-else-if="makeupDates.has(date)" :class="$style.dayStatus">{{ i18n.ts._checkin.madeUp }}</span>
									</div>
									<div v-else aria-hidden="true"></div>
								</template>
							</div>
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
							<div><dt><i class="ti ti-coins" aria-hidden="true"></i> {{ i18n.ts._checkin.points }}</dt><dd data-testid="checkin-points">{{ status.points }}</dd></div>
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
	<section v-if="status" class="_panel _card" :class="$style.achievements">
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
</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, onActivated, onDeactivated, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import { versatileLang } from '@@/js/intl-const.js';
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

.root { max-width: var(--MI-pageWidth); margin-inline: auto; }
.rules { display: grid; place-items: center; width: var(--MI-headerActionSize); height: var(--MI-pageHeaderHeight); }
.panel, .achievements { overflow: hidden; }
.panel { container-type: inline-size; }
.body { padding: var(--MI-cardPadding); }
.dashboard { display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 27%); align-items: start; gap: 28px; }
.calendarColumn, .actionColumn { min-width: 0; }
.actionColumn { display: flex; flex-direction: column; gap: 12px; }
.checkin { display: inline-flex; justify-content: center; align-items: center; gap: 8px; width: 100%; min-height: 48px; box-sizing: border-box; padding: 16px; border-radius: calc(var(--MI-radius) / 2); font-size: 1.05em; font-weight: bold; color: var(--MI_THEME-fgOnAccent); background: var(--MI_THEME-link, var(--MI_THEME-accent)); }
.checkin.checkedIn { color: var(--MI_THEME-link, var(--MI_THEME-accent)); background: color-mix(in srgb, var(--MI_THEME-link, var(--MI_THEME-accent)) 10%, var(--MI_THEME-panel)); }
.checkin:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 3px; }
.checkin:disabled { opacity: .65; cursor: default; }
.error { @include community.error; }
.rewards { padding: var(--MI-cardPadding); border-radius: calc(var(--MI-radius) / 2); background: var(--MI_THEME-accentedBg); }
.rewards p { margin: 12px 0 0; font-size: .8em; line-height: 1.6; color: var(--MI_THEME-fgTransparentWeak); }
.rewards .rewardHint { margin: 0 0 16px; color: var(--MI_THEME-accent); font-weight: bold; }
.balances { margin: 0; display: flex; flex-direction: column; gap: 12px; }
.balances > div { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.balances dt { font-size: .85em; }
.balances dd { margin: 0; font-weight: bold; font-variant-numeric: tabular-nums; }
.cardProgress { margin-top: 8px; }
.exchange { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px; width: 100%; margin-top: 16px; padding: 10px; border-radius: calc(var(--MI-radius) / 2); color: var(--MI_THEME-accent); background: var(--MI_THEME-panel); box-sizing: border-box; }
.exchange:disabled { opacity: .5; cursor: default; }
.makeup { max-width: 100%; min-height: 24px; padding: 0 2px; color: var(--MI_THEME-link, var(--MI_THEME-accent)); font-size: .8em; line-height: 1.35; overflow-wrap: anywhere; }
.makeup:enabled:hover { text-decoration: underline; }
.makeup:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; border-radius: calc(var(--MI-radius) / 4); }
.makeup:disabled { opacity: .5; cursor: default; }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; padding: var(--MI-cardPadding); border: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panel)); background: linear-gradient(110deg, color-mix(in srgb, var(--MI_THEME-accent) 6%, var(--MI_THEME-panel)), var(--MI_THEME-panel)); border-radius: var(--MI-radius); overflow: hidden; }
.stats > div { position: relative; display: flex; flex-direction: column-reverse; align-items: center; gap: 6px; text-align: center; }
.statWatermark { position: absolute; right: 0; bottom: -12px; color: color-mix(in srgb, var(--MI_THEME-accent) 7%, transparent); font-size: 4.5em; pointer-events: none; }
.stats dt, .stats dd { position: relative; }
.stats dt { font-size: .8em; color: var(--MI_THEME-fgTransparent); }
.stats dd { font-size: 1.8em; font-weight: 650; margin: 0; font-variant-numeric: tabular-nums; }
.stats > div:first-child dd { color: var(--MI_THEME-accent); }
.monthNav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 20px 0 12px; }
.monthControls { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; min-width: 0; }
.monthNav h2 { margin: 0; padding-inline: 4px; font-size: 1.2em; font-weight: 650; line-height: 1.5; }
.monthButton { display: grid; place-items: center; width: 24px; height: 30px; flex-shrink: 0; color: var(--MI_THEME-fgTransparentWeak); border-radius: calc(var(--MI-radius) / 4); font-size: .8em; }
.monthButton:enabled:hover { background: var(--MI_THEME-buttonHoverBg); }
.monthButton:disabled { opacity: .3; }
.monthButton:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.thisMonth { margin-left: 8px; font-size: .85em; }
.cardCount { display: flex; align-items: center; gap: 6px; margin-left: auto; padding: 6px 9px; border-radius: var(--MI-radius); color: var(--MI_THEME-fgTransparent); background: color-mix(in srgb, var(--MI_THEME-accent) 4%, var(--MI_THEME-panel)); font-size: .8em; white-space: nowrap; }
.cardCount > i { font-size: 1.35em; }
.cardAmount { font-variant-numeric: tabular-nums; }
.calendarLegend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 0 0 18px; color: var(--MI_THEME-fgTransparent); font-size: .8em; }
.calendarLegend span { display: inline-flex; align-items: center; gap: 6px; }
.calendarLegend i { flex-shrink: 0; font-size: 1.1em; }
.legendSigned { color: var(--MI_THEME-accent); }
.legendUnsigned { color: var(--MI_THEME-fg); }
.calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.weekday { padding: 0 0 8px; text-align: center; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.day {
	--dayColor: var(--MI_THEME-fg);
	--daySurface: color-mix(in srgb, var(--MI_THEME-accent) 2%, var(--MI_THEME-panel));
	--dayBorder: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	position: relative;
	display: flex;
	min-width: 0;
	min-height: 72px;
	align-items: stretch;
	flex-direction: column;
	gap: 4px;
	padding: 6px;
	border: 1px solid var(--dayBorder);
	border-radius: var(--MI-radius);
	background-color: var(--daySurface);
	box-sizing: border-box;
	transition: border-color .15s ease, background-color .15s ease;
}
.daySelect { display: flex; flex: 1; flex-direction: column; gap: 8px; padding: 5px 0; min-width: 0; text-align: center; }
.dayTop { position: relative; display: grid; place-items: center; min-height: 22px; width: 100%; }
.dayNumber { color: var(--dayColor); font-size: 1.15em; font-weight: 650; line-height: 1.2; font-variant-numeric: tabular-nums; }
.stateIcon { position: absolute; top: -6px; right: -2px; color: var(--MI_THEME-accent); font-size: .8em; }
.dayStatus { display: block; margin-top: auto; padding-block: 3px; color: var(--dayColor); text-align: center; font-size: .75em; line-height: 1.4; overflow-wrap: anywhere; }
.dayReward, .cardReward, .dayAction { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 3px; min-height: 23px; border-radius: calc(var(--MI-radius) / 3); font-size: .85em; line-height: 1.4; box-sizing: border-box; }
.dayReward { color: var(--dayColor); }
.dayReward > i { color: var(--MI_THEME-accent); font-size: 1.1em; }
.dayAction { width: 100%; color: var(--dayColor); background: transparent; overflow-wrap: anywhere; }
.dayAction:disabled { opacity: .5; cursor: wait; }
.cardReward { color: var(--dayColor); padding: 1px 2px; overflow-wrap: anywhere; }
.predictedReward { border: 1px dashed color-mix(in srgb, var(--dayColor) 30%, transparent); }
.day.completed, .day.madeUp { --daySurface: color-mix(in srgb, var(--MI_THEME-accent) 18%, var(--MI_THEME-panel)); --dayBorder: color-mix(in srgb, var(--MI_THEME-accent) 22%, transparent); }
.day.missed { border-style: dashed; }
.day.today { border-color: var(--MI_THEME-accent); }
.day.selectedDay { border-color: var(--MI_THEME-accent); border-style: solid; }
.day:has(:focus-visible) { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.daySelect:focus-visible { outline: none; }
.dayAction:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
@media (hover: hover) {
	.day:hover:not(.selectedDay, .today) { border-color: color-mix(in srgb, var(--dayColor) 40%, transparent); background-color: color-mix(in srgb, var(--dayColor) 5%, var(--daySurface)); }
	.dayAction:enabled:hover { background: color-mix(in srgb, var(--dayColor) 18%, var(--MI_THEME-panel)); }
}
@media (prefers-reduced-motion: reduce) { .day { transition: none; } }
.todayDate { color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; line-height: 1.5; }
.achievements { margin-top: 20px; }
.milestones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: var(--MI-cardPadding); }
.milestone { display: flex; align-items: center; gap: 14px; padding: var(--MI-cardPadding); border: var(--MI-divider); border-radius: var(--MI-radius); }
.milestone.unlocked { border-color: color-mix(in srgb, var(--MI_THEME-accent) 30%, var(--MI-dividerColor)); background: color-mix(in srgb, var(--MI_THEME-accent) 4%, var(--MI_THEME-panel)); }
.medal { flex-shrink: 0; }
.milestoneBody { min-width: 0; flex: 1; }
.milestone h3 { font-size: .9em; margin: 0; }
.milestone p { font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); margin: 6px 0 10px; line-height: 1.5; }
.milestone progress { margin-bottom: 8px; }
.progress, .earned { font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
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
	.cardCount { font-size: .85em; }
	.calendar { gap: 4px; }
	.day { min-height: 68px; padding: 3px; }
	.daySelect { padding: 3px 0; gap: 6px; }
	.dayNumber { font-size: 1.1em; }
	.stateIcon { font-size: .7em; }
	.dayStatus { font-size: .7em; }
	.dayAction, .cardReward, .dayReward { font-size: .75em; }
	.calendarLegend { gap: 8px 12px; }
}
@media (max-width: 600px) {
	.milestones { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 360px) {
	.day { padding-inline: 2px; }
	.dayNumber { font-size: .95em; }
	.stateIcon { font-size: .6em; }
	.dayStatus { font-size: .65em; }
	.rewardLabel { display: none; }
}
</style>
