<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard hideHeader>
	<section class="_gaps" :class="$style.root">
		<h1>{{ i18n.ts._benefits.title }}</h1>
		<form :class="$style.redeemForm" :aria-busy="redeeming" novalidate @submit.prevent="redeem">
			<MkInput v-model="code" :class="$style.codeInput" :disabled="redeeming" :maxLength="64" autocomplete="off" autocapitalize="characters" :spellcheck="false" required>
			<template #label>{{ i18n.ts._benefits.codeEntry }}</template>
			</MkInput>
			<MkButton type="submit" primary :wait="redeeming">{{ i18n.ts._benefits.redeem }}</MkButton>
		</form>
		<div v-if="loadError" role="alert" class="_gaps_s">
			<MkInfo warn>{{ i18n.ts._checkin.loadFailed }}</MkInfo>
			<MkButton small :disabled="loading || redeeming" @click="loadBalance">{{ i18n.ts.retry }}</MkButton>
		</div>
		<section class="_gaps" :aria-label="i18n.ts._checkin._history.title">
			<div :class="$style.historyHead">
				<h2>{{ i18n.ts._checkin._history.title }}</h2>
				<MkA to="/my/checkin" class="_link">{{ i18n.ts._checkin.dailyCheckin }}</MkA>
			</div>
			<div :class="$style.filters" role="group" :aria-label="i18n.ts.filter">
				<button v-for="tab in historyTabs" :key="tab.key" type="button" class="_button _tabUnderline" :class="[$style.filterTab, { [$style.filterTabActive]: historyType === tab.key }]" :aria-pressed="historyType === tab.key" @click="selectHistory(tab.key)">{{ tab.label }}</button>
			</div>
			<MkLoading v-if="historyLoading"/>
			<div v-else-if="historyError" class="_gaps_s" role="alert">
				<MkInfo warn>{{ i18n.ts._checkin._history.loadFailed }}</MkInfo>
				<MkButton @click="loadHistory">{{ i18n.ts.retry }}</MkButton>
			</div>
			<p v-else-if="history.length === 0" :class="$style.empty">{{ i18n.ts._checkin._history.empty }}</p>
			<ul v-else :class="$style.history" data-testid="benefits-history">
				<li v-for="entry in history" :key="entry.id" :class="$style.record">
					<div :class="$style.recordHeading">
						<strong>{{ historyType === 'use' ? i18n.tsx._checkin.makeupDate({ date: entry.date ?? '' }) : sourceLabel(entry.source) }}</strong>
						<span :class="[$style.amount, { [$style.amountIn]: historyType !== 'use' }]">{{ historyType === 'use' ? '-' : '+' }}{{ entry.amount.toLocaleString() }}</span>
					</div>
					<div :class="$style.recordDetail">
						<MkTime :time="entry.createdAt" mode="detail"/>
						<span v-if="entry.pointsSpent != null">{{ i18n.ts._checkin._history.pointsSpent }}: {{ entry.pointsSpent.toLocaleString() }}</span>
					</div>
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
import * as os from '@/os.js';

const account = ensureSignin();
const loading = ref(false);
const loadError = ref(false);
const code = ref('');
const normalizedCode = computed(() => code.value.trim().toUpperCase());
const validCode = computed(() => /^[A-F0-9]{32}$/.test(normalizedCode.value));
const redeeming = ref(false);
const historyType = ref<'earned' | 'exchange' | 'use'>('earned');
const historyTabs = computed(() => [
	{ key: 'earned', label: i18n.ts._checkin._history.earned },
	{ key: 'use', label: i18n.ts._checkin._history.use },
	{ key: 'exchange', label: i18n.ts._checkin._history.sourceExchange },
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
	if (!validCode.value) {
		os.toast(i18n.ts._benefits.invalidCodeFormat, 'error');
		return;
	}
	redeeming.value = true;
	++balanceRequest;
	loading.value = false;
	try {
		const result = await misskeyApi('i/checkin-redeem', { code: normalizedCode.value });
		if (!mounted) return;
		loadError.value = false;
		os.toast(result.newlyRedeemed ? i18n.tsx._benefits.redeemSucceeded({ amount: result.amount }) : i18n.ts._benefits.alreadyRedeemed, 'success');
		code.value = '';
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
		os.toast((errorCode && errors[errorCode]) || i18n.ts._benefits.redeemFailed, 'error');
	} finally {
		redeeming.value = false;
	}
}

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
definePage(() => ({ title: i18n.ts._benefits.title, icon: 'ti ti-gift' }));
</script>

<style lang="scss" module>
.root {
	min-width: 0;

	h1, h2, p { margin: 0; }
	h1 { font-size: 1.35em; }
	h2 { font-size: 1.05em; }
}

.description {
	line-height: 1.7;
	font-size: .83em;
	color: var(--MI_THEME-fgTransparentWeak);
}

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

.recordDetail { margin-top: 4px; color: var(--MI_THEME-fgTransparentWeak); font-size: .78em; }

.amount { font-variant-numeric: tabular-nums; font-size: 1.15em; font-weight: bold; }
.amountIn { color: var(--MI_THEME-accent); }

.recordStats {
	display: flex;
	flex-wrap: wrap;
	gap: var(--MI-margin);
	margin: var(--MI-marginHalf) 0 0;
	font-size: .78em;

	div { display: flex; gap: 6px; }
	dt { color: var(--MI_THEME-fgTransparentWeak); }
	dd { margin: 0; }
}

.empty {
	padding: var(--MI-margin) 0;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.pagination {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: var(--MI-marginHalf);
	font-size: .85em;
}
</style>
