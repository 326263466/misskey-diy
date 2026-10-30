<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<section class="_gaps" :class="$style.root">
		<form :class="$style.redeemForm" :aria-busy="redeeming" novalidate @submit.prevent="redeem">
			<MkInput v-model="code" :class="$style.codeInput" :disabled="redeeming" :maxLength="64" autocomplete="off" autocapitalize="characters" :spellcheck="false" required>
			<template #label>{{ i18n.ts._benefits.codeEntry }}</template>
			</MkInput>
			<MkButton type="submit" primary :wait="redeeming">{{ i18n.ts._benefits.redeem }}</MkButton>
		</form>
		<p v-if="redemptionMessage" role="status">{{ redemptionMessage }}</p>
		<p v-if="redeemError" :class="$style.redeemError" role="alert">{{ redeemError }}</p>
		<div v-if="loadError" role="alert" class="_gaps_s">
			<MkInfo warn>{{ i18n.ts._checkin.loadFailed }}</MkInfo>
			<MkButton small :disabled="loading || redeeming" @click="loadBalance">{{ i18n.ts.retry }}</MkButton>
		</div>
		<section class="_gaps" :aria-label="i18n.ts._benefits.history">
			<div :class="$style.historyHead">
				<h2>{{ i18n.ts._benefits.history }}</h2>
				<MkA to="/my/checkin" class="_link">{{ i18n.ts._checkin.dailyCheckin }}</MkA>
			</div>
			<div :class="$style.filters" role="group" :aria-label="i18n.ts.filter">
				<button v-for="tab in historyTabs" :key="tab.key" type="button" class="_button _tabUnderline" :class="[$style.filterTab, { [$style.filterTabActive]: historyType === tab.key }]" :aria-pressed="historyType === tab.key" @click="selectHistory(tab.key)">{{ tab.label }}</button>
			</div>
			<MkLoading v-if="historyLoading && !history.length"/>
			<div v-if="historyError" class="_gaps_s" role="alert">
				<MkInfo warn>{{ i18n.ts._checkin._history.loadFailed }}</MkInfo>
				<MkButton @click="historyList.retry">{{ i18n.ts.retry }}</MkButton>
			</div>
			<MkResult v-if="!historyLoading && !historyError && history.length === 0" type="empty" :text="i18n.ts._checkin._history.empty"/>
			<ul v-if="history.length" :class="$style.history" data-testid="benefits-history">
				<li v-for="entry in history" :key="entry.id" :class="$style.record">
					<div :class="$style.recordHeading">
						<strong v-if="entry.kind === 'redemption'">{{ i18n.ts._checkin._history.sourceRedemption }}</strong>
						<strong v-else>{{ historyType === 'use' ? i18n.tsx._checkin.makeupDate({ date: entry.date ?? '' }) : sourceLabel(entry.source) }}</strong>
						<span :class="[$style.amount, { [$style.amountIn]: historyType !== 'use' }]">{{ entry.kind === 'redemption' ? benefitRewardLabel(entry.rewardType, entry.amount) : `${historyType === 'use' ? '-' : '+'}${entry.amount.toLocaleString()}` }}</span>
					</div>
					<div :class="$style.recordDetail">
						<MkTime :time="entry.createdAt" mode="detail"/>
						<span v-if="entry.kind === 'card' && entry.pointsSpent != null">{{ i18n.ts._checkin._history.pointsSpent }}: {{ entry.pointsSpent.toLocaleString() }}</span>
					</div>
					<dl v-if="entry.kind === 'card' && historyType === 'earned'" :class="$style.recordStats">
						<div><dt>{{ i18n.ts._checkin._history.remaining }}</dt><dd>{{ entry.remaining?.toLocaleString() ?? i18n.ts.unknown }}</dd></div>
						<div><dt>{{ i18n.ts._checkin._history.used }}</dt><dd>{{ entry.used?.toLocaleString() ?? i18n.ts.unknown }}</dd></div>
						<div v-if="entry.revoked"><dt>{{ i18n.ts._checkin._history.revoked }}</dt><dd>{{ entry.revoked.toLocaleString() }}</dd></div>
					</dl>
				</li>
			</ul>
			<p v-if="!historyLoading && !historyError && history.some(entry => entry.kind === 'card' && entry.source === 'legacy')" :class="$style.description">{{ i18n.ts._checkin._history.legacyDescription }}</p>
			<MkLoading v-if="historyLoading && history.length"/>
			<div v-if="historyList.canLoad.value && historyList.hasMore.value && !historyLoading && !historyError && !redeeming" v-appear="historyList.loadMore" :class="$style.sentinel" aria-hidden="true"></div>
		</section>
	</section>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import { DI } from '@/di.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { publishCheckinStatus } from '@/composables/use-checkin-status.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useInfiniteList } from '@/composables/use-infinite-list.js';
import { usePageHistoryRestore } from '@/composables/use-page-history-restore.js';
import { benefitRewardLabel } from '@/utility/benefits.js';

type HistoryEntry =
	| ({ kind: 'redemption' } & entities.IBenefitsHistoryResponse['items'][number])
	| ({ kind: 'card' } & entities.ICheckinHistoryResponse['items'][number]);

const account = ensureSignin();
const loading = ref(false);
const loadError = ref(false);
const code = ref('');
const normalizedCode = computed(() => code.value.trim().toUpperCase());
const validCode = computed(() => /^[A-F0-9]{32}$/.test(normalizedCode.value));
const redeeming = ref(false);
const redemptionMessage = ref('');
const redeemError = ref('');
const historyType = ref<'redemption' | 'earned' | 'exchange' | 'use'>('redemption');
const historyTabs = computed(() => [
	{ key: 'redemption', label: i18n.ts._benefits.redemptionHistory },
	{ key: 'earned', label: i18n.ts._benefits.cardsEarned },
	{ key: 'use', label: i18n.ts._benefits.cardsUsed },
	{ key: 'exchange', label: i18n.ts._benefits.pointsExchange },
] as const);
const pageSize = 10;
const historyList = useInfiniteList<HistoryEntry, number>(async (cursor, signal) => {
	const offset = cursor ?? 0;
	if (historyType.value === 'redemption') {
		const result = await misskeyApi('i/benefits/history', { limit: pageSize, offset }, undefined, signal);
		const next = offset + result.items.length;
		return { items: result.items.map(entry => ({ kind: 'redemption' as const, ...entry })), next: result.items.length > 0 && next < result.total && next <= 100000 ? next : null };
	}
	const result = await misskeyApi('i/checkin-history', { type: historyType.value, limit: pageSize, offset }, undefined, signal);
	const next = offset + result.items.length;
	return { items: result.items.map(entry => ({ kind: 'card' as const, ...entry })), next: result.items.length > 0 && next < result.total && next <= 100000 ? next : null };
});
const { items: history, loading: historyLoading, error: historyError } = historyList;
const pageActive = inject(DI.pageActive, ref(true));
const historyRestoring = usePageHistoryRestore();
let active = true;
let mounted = false;
let balanceRequest = 0;

function sourceLabel(source: entities.ICheckinHistoryResponse['items'][number]['source']) {
	const labels = {
		exchange: i18n.ts._checkin._history.sourceExchange,
		reward: i18n.ts._checkin._history.sourceReward,
		redemption: i18n.ts._checkin._history.sourceRedemption,
		legacy: i18n.ts._checkin._history.sourceLegacy,
	};
	return source ? labels[source] : i18n.ts._checkin._history.sourceUnknown;
}

async function loadBalance() {
	const request = ++balanceRequest;
	loading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('i/checkin-status', {});
		if (!mounted || request !== balanceRequest) return;
		publishCheckinStatus(account.id, result);
	} catch {
		if (mounted && request === balanceRequest) loadError.value = true;
	} finally {
		if (mounted && request === balanceRequest) loading.value = false;
	}
}

function loadHistory() { return historyList.refresh(); }

async function redeem() {
	if (!mounted || redeeming.value) return;
	redemptionMessage.value = '';
	redeemError.value = '';
	if (!validCode.value) {
		redeemError.value = i18n.ts._benefits.invalidCodeFormat;
		return;
	}
	redeeming.value = true;
	++balanceRequest;
	loading.value = false;
	try {
		const result = await misskeyApi('i/benefits/redeem', { code: normalizedCode.value });
		if (!mounted) return;
		loadError.value = false;
		redemptionMessage.value = result.newlyRedeemed ? i18n.tsx._benefits.redeemSucceeded({ reward: benefitRewardLabel(result.rewardType, result.amount) }) : i18n.ts._benefits.alreadyRedeemed;
		code.value = '';
		historyType.value = 'redemption';
		void historyList.reset();
		void loadBalance();
	} catch (cause) {
		if (!mounted) return;
		const errorCode = (cause as { code?: string } | null)?.code;
		const errors: Record<string, string> = {
			NO_SUCH_REDEMPTION_CODE: i18n.ts._benefits.invalidCode,
			REDEMPTION_CODE_DISABLED: i18n.ts._benefits.codeUnavailable,
			REDEMPTION_CODE_EXPIRED: i18n.ts._benefits.codeExpired,
			REDEMPTION_CODE_EXHAUSTED: i18n.ts._benefits.codeExhausted,
			BENEFIT_NOT_ALLOWED: i18n.ts._benefits.redeemNotAllowed,
			CARD_LIMIT_EXCEEDED: i18n.ts._checkin.cardLimitExceeded,
			BALANCE_LIMIT_EXCEEDED: i18n.ts._wallet.balanceLimit,
		};
		redeemError.value = (errorCode && errors[errorCode]) || i18n.ts._benefits.redeemFailed;
	} finally {
		redeeming.value = false;
	}
}

function selectHistory(type: typeof historyType.value) {
	if (historyType.value === type) return;
	historyType.value = type;
	void historyList.reset();
}

function refreshPage(preserveHistory: boolean) {
	if (!mounted || !active || !pageActive.value || redeeming.value || window.document.visibilityState === 'hidden') return;
	void loadBalance();
	if (preserveHistory && history.value.length > 0) {
		if (historyError.value && !historyLoading.value) void historyList.retry();
	} else if (!preserveHistory || !historyLoading.value) {
		void loadHistory();
	}
}

function refresh() { refreshPage(false); }

function refreshOnActivation() { refreshPage(historyRestoring.value); }

watch(pageActive, value => { if (value) refreshOnActivation(); });
onMounted(() => {
	mounted = true;
	refresh();
	window.addEventListener('focus', refresh);
	window.addEventListener('online', refresh);
});
onActivated(() => { const wasInactive = !active; active = true; if (wasInactive) refreshOnActivation(); });
onDeactivated(() => { active = false; });
onUnmounted(() => {
	mounted = false;
	balanceRequest++;
	window.removeEventListener('focus', refresh);
	window.removeEventListener('online', refresh);
});
definePage(() => ({ title: i18n.ts._benefits.title, icon: 'ti ti-ticket' }));
</script>

<style lang="scss" module>
.root {
	min-width: 0;

	h2, p { margin: 0; }
	h2 { font-size: 1.05em; }
}

.description {
	line-height: 1.7;
	font-size: .83em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.redeemError { color: var(--MI_THEME-error); }

.redeemForm {
	display: flex;
	align-items: flex-end;
	flex-wrap: wrap;
	gap: var(--MI-marginHalf);
	padding-bottom: var(--MI-margin);
	border-bottom: var(--MI-divider);
}

.codeInput {
	flex: 1 1 240px;
	min-width: 0;
}

.historyHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: var(--MI-marginHalf);
}

.filters {
	display: flex;
	flex-wrap: wrap;
	gap: var(--MI-margin);
	border-bottom: var(--MI-divider);
}

.filterTab {
	padding: var(--MI-marginHalf) 0;
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover { color: var(--MI_THEME-fg); }
}

.filterTabActive {
	--MI-tabUnderlineOpacity: 1;
	color: var(--MI_THEME-accent);
	font-weight: bold;
}

.history { margin: 0; padding: 0; list-style: none; }

.record {
	padding: var(--MI-margin) 0;
	border-bottom: var(--MI-divider);

	&:last-child { border-bottom: 0; }
}

.recordHeading, .recordDetail {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: var(--MI-marginHalf);
}

.recordHeading {
	font-size: .9em;

	strong { overflow-wrap: anywhere; }
}

.recordDetail { margin-top: 4px; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }

.amount { font-variant-numeric: tabular-nums; font-size: 1.15em; font-weight: bold; }
.amountIn { color: var(--MI_THEME-accent); }

.recordStats {
	display: flex;
	flex-wrap: wrap;
	gap: var(--MI-margin);
	margin: var(--MI-marginHalf) 0 0;
	font-size: .85em;

	div { display: flex; gap: 6px; }
	dt { color: var(--MI_THEME-fgTransparentWeak); }
	dd { margin: 0; }
}

.sentinel { height: 1px; }
</style>
