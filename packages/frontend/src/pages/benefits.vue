<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCommunityHub active="benefits">
	<div class="_gaps_m">
		<header :class="$style.heading">
			<div><h1>{{ i18n.ts._benefits.title }}</h1><p>{{ i18n.ts._benefits.myDescription }}</p></div>
			<MkButton small :disabled="loading || redeeming || historyLoading" @click="refresh">{{ i18n.ts.reload }}</MkButton>
		</header>
		<div :class="$style.overview">
			<section class="_panel _juejinCard _gaps" :class="$style.wallet" :aria-label="i18n.ts._benefits.myCards" :aria-busy="loading">
				<div :class="$style.cardHeading"><i class="ti ti-ticket" :class="$style.cardIcon" aria-hidden="true"></i><div><p>{{ i18n.ts._benefits.myCards }}</p><h2>{{ i18n.ts._benefits.checkinCard }}</h2></div></div>
				<MkLoading v-if="loading && !balance"/>
				<div v-if="balance" :class="$style.balance" aria-live="polite"><strong data-testid="benefits-balance">{{ balance.makeupCards.toLocaleString() }}</strong><span>{{ i18n.ts._benefits.availableCards }}</span></div>
				<div v-if="loadError" role="alert" class="_gaps_s"><MkInfo warn>{{ i18n.ts._checkin.loadFailed }}</MkInfo><MkButton small :disabled="loading || redeeming" @click="loadBalance">{{ i18n.ts.retry }}</MkButton></div>
				<p :class="$style.description">{{ i18n.ts._benefits.cardDescription }}</p>
				<p v-if="balance?.makeupCards === 0" :class="$style.description">{{ i18n.ts._benefits.noCards }}</p>
				<MkA to="/checkin" :class="$style.useLink"><i class="ti ti-calendar-check" aria-hidden="true"></i> {{ balance?.makeupCards === 0 ? i18n.ts._benefits.earnCards : i18n.ts._benefits.useCards }} <i class="ti ti-arrow-right" aria-hidden="true"></i></MkA>
				<div :class="$style.earning">
					<div :class="$style.earningHeading"><h3>{{ i18n.ts._benefits.earnCards }}</h3><span v-if="balance" :class="$style.points"><i class="ti ti-coin" aria-hidden="true"></i> {{ i18n.ts._checkin.points }} <strong data-testid="benefits-points">{{ balance.points.toLocaleString() }}</strong></span></div>
					<p :class="$style.description">{{ i18n.ts._benefits.earnDescription }}</p>
					<MkA to="/checkin" class="_link">{{ i18n.ts._benefits.goCheckin }} <i class="ti ti-arrow-right" aria-hidden="true"></i></MkA>
				</div>
			</section>
			<section class="_panel _juejinCard _gaps" :class="$style.section" :aria-label="i18n.ts._benefits.codeEntry">
				<h2><i class="ti ti-gift" aria-hidden="true"></i> {{ i18n.ts._benefits.codeEntry }}</h2>
				<p :class="$style.description">{{ i18n.ts._benefits.redeemDescription }}</p>
				<form class="_gaps" :aria-busy="redeeming" novalidate @submit.prevent="redeem">
					<MkInput v-model="code" :disabled="redeeming" :maxLength="64" autocomplete="off" autocapitalize="characters" :spellcheck="false" required @focusout="codeTouched = normalizedCode.length > 0">
						<template #label>{{ i18n.ts._checkin._codes.code }}</template>
						<template #caption><span v-if="codeTouched && !validCode" role="alert" :class="$style.error">{{ i18n.ts._benefits.invalidCodeFormat }}</span><span v-else>{{ i18n.ts._benefits.codeFormat }}</span></template>
					</MkInput>
					<MkButton type="submit" primary :wait="redeeming">{{ i18n.ts._benefits.redeem }}</MkButton>
				</form>
				<p v-if="redeemError" role="alert" :class="$style.error">{{ redeemError }}</p>
				<p v-if="notice" role="status" :class="$style.notice">{{ notice }}</p>
			</section>
		</div>
		<section class="_panel _juejinCard _gaps" :class="$style.section" :aria-label="i18n.ts._checkin._history.title">
			<h2>{{ i18n.ts._checkin._history.title }}</h2>
			<div :class="$style.filters" role="group" :aria-label="i18n.ts.filter">
				<MkButton v-for="tab in historyTabs" :key="tab.key" small :active="historyType === tab.key" :aria-pressed="historyType === tab.key" @click="selectHistory(tab.key)">{{ tab.label }}</MkButton>
			</div>
			<p :class="$style.description">{{ historyTabs.find(tab => tab.key === historyType)?.description }}</p>
			<MkLoading v-if="historyLoading"/>
			<div v-else-if="historyError" class="_gaps_s" role="alert"><MkInfo warn>{{ i18n.ts._checkin._history.loadFailed }}</MkInfo><MkButton @click="loadHistory">{{ i18n.ts.retry }}</MkButton></div>
			<div v-else-if="history.length === 0" :class="$style.empty"><i class="ti ti-receipt" aria-hidden="true"></i><p>{{ i18n.ts._checkin._history.empty }}</p></div>
			<ul v-else :class="$style.history" data-testid="benefits-history">
				<li v-for="entry in history" :key="entry.id" :class="$style.record">
					<div :class="$style.recordHeading"><strong>{{ historyType === 'use' ? i18n.tsx._checkin.makeupDate({ date: entry.date ?? '' }) : sourceLabel(entry.source) }}</strong><span :class="$style.amount">{{ historyType === 'use' ? '−' : '+' }}{{ entry.amount.toLocaleString() }}</span></div>
					<div :class="$style.recordDetail"><MkTime :time="entry.createdAt" mode="detail"/><span v-if="entry.pointsSpent != null">{{ i18n.ts._checkin._history.pointsSpent }}: {{ entry.pointsSpent.toLocaleString() }}</span></div>
					<dl v-if="historyType === 'earned'" :class="$style.recordStats">
						<div><dt>{{ i18n.ts._checkin._history.remaining }}</dt><dd>{{ entry.remaining?.toLocaleString() ?? i18n.ts.unknown }}</dd></div>
						<div><dt>{{ i18n.ts._checkin._history.used }}</dt><dd>{{ entry.used?.toLocaleString() ?? i18n.ts.unknown }}</dd></div>
						<div v-if="entry.revoked"><dt>{{ i18n.ts._checkin._history.revoked }}</dt><dd>{{ entry.revoked.toLocaleString() }}</dd></div>
					</dl>
				</li>
			</ul>
			<p v-if="!historyLoading && !historyError && history.some(entry => entry.source === 'legacy')" :class="$style.description">{{ i18n.ts._checkin._history.legacyDescription }}</p>
			<div v-if="total > pageSize || page > 0" :class="$style.pagination">
				<MkButton small :disabled="historyLoading || page === 0" @click="changePage(-1)">{{ i18n.ts._checkin.grantPreviousPage }}</MkButton>
				<span aria-live="polite">{{ i18n.tsx._checkin._history.page({ current: page + 1, total: Math.max(1, Math.ceil(total / pageSize)) }) }}</span>
				<MkButton small :disabled="historyLoading || historyError || (page + 1) * pageSize >= total || (page + 1) * pageSize > 100000" @click="changePage(1)">{{ i18n.ts._checkin.grantNextPage }}</MkButton>
			</div>
		</section>
	</div>
</MkCommunityHub>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkCommunityHub from '@/components/MkCommunityHub.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import { DI } from '@/di.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { publishCheckinStatus } from '@/composables/use-checkin-status.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const account = ensureSignin();
const balance = ref<Pick<entities.ICheckinStatusResponse, 'makeupCards' | 'points'> | null>(null);
const loading = ref(false);
const loadError = ref(false);
const code = ref('');
const normalizedCode = computed(() => code.value.trim().toUpperCase());
const validCode = computed(() => /^[A-F0-9]{32}$/.test(normalizedCode.value));
const codeTouched = ref(false);
const redeeming = ref(false);
const redeemError = ref('');
const notice = ref('');
const historyType = ref<'earned' | 'exchange' | 'use'>('earned');
const historyTabs = computed(() => [
	{ key: 'earned', label: i18n.ts._checkin._history.earned, description: i18n.ts._benefits.earnedHistoryDescription },
	{ key: 'use', label: i18n.ts._checkin._history.use, description: i18n.ts._benefits.useHistoryDescription },
	{ key: 'exchange', label: i18n.ts._checkin._history.sourceExchange, description: i18n.ts._benefits.exchangeHistoryDescription },
] as const);
const history = ref<entities.ICheckinHistoryResponse['items']>([]);
const historyLoading = ref(false);
const historyError = ref(false);
const page = ref(0);
const total = ref(0);
const pageSize = 10;
const pageActive = inject(DI.pageActive, ref(true));
let active = true;
let mounted = false;
let balanceRequest = 0;
let historyRequest = 0;

function sourceLabel(source: entities.ICheckinHistoryResponse['items'][number]['source']) {
	const labels = {
		admin: i18n.ts._checkin._history.sourceAdmin,
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
		balance.value = result;
		publishCheckinStatus(account.id, result);
	} catch {
		if (mounted && request === balanceRequest) loadError.value = true;
	} finally {
		if (mounted && request === balanceRequest) loading.value = false;
	}
}

async function loadHistory(): Promise<void> {
	const request = ++historyRequest;
	historyLoading.value = true;
	historyError.value = false;
	try {
		const result = await misskeyApi('i/checkin-history', { type: historyType.value, limit: pageSize, offset: page.value * pageSize });
		if (!mounted || request !== historyRequest) return;
		if (page.value > 0 && result.total <= page.value * pageSize) {
			page.value = Math.max(0, Math.ceil(result.total / pageSize) - 1);
			if (result.total > 0) {
				await loadHistory();
				return;
			}
		}
		history.value = result.items;
		total.value = result.total;
	} catch {
		if (mounted && request === historyRequest) historyError.value = true;
	} finally {
		if (mounted && request === historyRequest) historyLoading.value = false;
	}
}

async function redeem() {
	if (!mounted || redeeming.value) return;
	codeTouched.value = true;
	if (!validCode.value) return;
	redeeming.value = true;
	redeemError.value = '';
	notice.value = '';
	++balanceRequest;
	loading.value = false;
	try {
		const result = await misskeyApi('i/checkin-redeem', { code: normalizedCode.value });
		if (!mounted) return;
		balance.value = { makeupCards: result.makeupCards, points: result.points };
		loadError.value = false;
		notice.value = result.newlyRedeemed ? i18n.tsx._benefits.redeemSucceeded({ amount: result.amount }) : i18n.ts._benefits.alreadyRedeemed;
		code.value = '';
		codeTouched.value = false;
		page.value = 0;
		historyType.value = 'earned';
		void loadHistory();
		void loadBalance();
	} catch (cause) {
		if (!mounted) return;
		const errorCode = (cause as { code?: string } | null)?.code;
		const errors: Record<string, string> = {
			NO_SUCH_REDEMPTION_CODE: i18n.ts._benefits.invalidCode,
			REDEMPTION_CODE_DISABLED: i18n.ts._benefits.codeUnavailable,
			REDEMPTION_CODE_EXPIRED: i18n.ts._benefits.codeExpired,
			REDEMPTION_CODE_EXHAUSTED: i18n.ts._benefits.codeExhausted,
			CHECKIN_NOT_ALLOWED: i18n.ts._benefits.redeemNotAllowed,
			CARD_LIMIT_EXCEEDED: i18n.ts._checkin.cardLimitExceeded,
		};
		redeemError.value = (errorCode && errors[errorCode]) || i18n.ts._benefits.redeemFailed;
	} finally {
		redeeming.value = false;
	}
}

watch(code, () => {
	redeemError.value = '';
	if (code.value !== '') notice.value = '';
});

function selectHistory(type: typeof historyType.value) {
	if (historyType.value === type) return;
	historyType.value = type;
	page.value = 0;
	void loadHistory();
}

function changePage(direction: number) {
	const next = page.value + direction;
	if (historyLoading.value || next < 0 || next * pageSize >= total.value || next * pageSize > 100000) return;
	page.value = next;
	void loadHistory();
}

function refresh() {
	if (!mounted || !active || !pageActive.value || redeeming.value || window.document.visibilityState === 'hidden') return;
	void loadBalance();
	void loadHistory();
}

watch(pageActive, value => { if (value) refresh(); });
onMounted(() => {
	mounted = true;
	refresh();
	window.addEventListener('focus', refresh);
	window.addEventListener('online', refresh);
});
onActivated(() => { const wasInactive = !active; active = true; if (wasInactive) refresh(); });
onDeactivated(() => { active = false; });
onUnmounted(() => {
	mounted = false;
	balanceRequest++;
	historyRequest++;
	window.removeEventListener('focus', refresh);
	window.removeEventListener('online', refresh);
});
definePage(() => ({ title: i18n.ts._benefits.title, icon: 'ti ti-gift', needWideArea: true }));
</script>

<style lang="scss" module>
.heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--MI-margin); padding: var(--MI-marginHalf) 0; h1 { margin: 0; font-size: 1.4em; } p { margin: 8px 0 0; line-height: 1.7; color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; } }
.overview { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); align-items: start; gap: var(--MI-margin); }
.section, .wallet { min-width: 0; padding: 24px; h2 { margin: 0; font-size: 1.05em; } }
.wallet { background: linear-gradient(135deg, var(--MI_THEME-accentedBg), var(--MI_THEME-panel) 80%); }
.cardHeading { display: flex; align-items: center; gap: 14px; p { margin: 0 0 6px; font-size: .8em; color: var(--MI_THEME-fgTransparentWeak); } }
.cardIcon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: var(--MI-radius); background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 1.7em; }
.balance { display: flex; align-items: baseline; gap: 12px; strong { font-size: 3em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; } span { font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); } }
.description { margin: 0; line-height: 1.7; font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
.useLink { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 12px 16px; border-radius: calc(var(--MI-radius) / 2); color: var(--MI_THEME-fgOnAccent); background: var(--MI_THEME-accent); font-size: .9em; font-weight: bold; text-decoration: none; &:hover { background: color-mix(in srgb, var(--MI_THEME-accent), var(--MI_THEME-fg) 12%); text-decoration: none; } &:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 3px; } }
.earning { display: grid; gap: 12px; margin-top: 8px; padding-top: 20px; border-top: 1px solid var(--MI_THEME-divider); > a { font-size: .85em; } }
.earningHeading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; h3 { margin: 0; font-size: .9em; } }
.points { display: flex; align-items: center; gap: 6px; font-size: .8em; color: var(--MI_THEME-fgTransparentWeak); strong { color: var(--MI_THEME-fg); font-variant-numeric: tabular-nums; } }
.filters, .pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pagination { justify-content: center; font-size: .85em; }
.history { margin: 0; padding: 0; list-style: none; }
.record { padding: 16px 0; border-bottom: 1px solid var(--MI_THEME-divider); &:last-child { border-bottom: 0; } }
.recordHeading, .recordDetail { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.recordHeading { font-size: .9em; strong { overflow-wrap: anywhere; } }
.recordDetail { margin-top: 8px; color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; }
.amount { font-variant-numeric: tabular-nums; font-size: 1.15em; font-weight: bold; }
.recordStats { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0 0; font-size: .8em; div { display: flex; gap: 6px; } dt { color: var(--MI_THEME-fgTransparentWeak); } dd { margin: 0; } }
.empty { padding: 32px 12px; text-align: center; color: var(--MI_THEME-fgTransparentWeak); i { font-size: 2em; } p { font-size: .9em; } }
.error, .notice { margin: 0; font-size: .85em; line-height: 1.7; }
.error { color: var(--MI_THEME-error); }
.notice { color: var(--MI_THEME-accent); }
@container (max-width: 620px) { .overview { grid-template-columns: minmax(0, 1fr); } .section, .wallet { padding: 20px; } }
@media (max-width: 480px) { .overview { grid-template-columns: minmax(0, 1fr); } .section, .wallet { padding: var(--MI-margin); } }
</style>
