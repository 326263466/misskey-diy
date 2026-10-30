<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<template #header-actions><MkButton small :disabled="loading" :wait="loading" @click="refresh">{{ i18n.ts.reload }}</MkButton></template>
	<div class="_gaps_m" :class="$style.root" :aria-busy="loading">
		<MkLoading v-if="loading && !wallet"/>
		<MkButton v-if="loadError" small :disabled="loading" @click="refresh">{{ i18n.ts.retry }}</MkButton>
		<dl v-if="wallet" :class="$style.balances">
			<div><dt>{{ i18n.ts._wallet.balance }}</dt><dd>{{ wallet.balance.toLocaleString() }}</dd></div>
			<div><dt>{{ i18n.ts._wallet.reservedBalance }}</dt><dd>{{ wallet.reservedBalance.toLocaleString() }}</dd></div>
			<div><dt>{{ i18n.ts._wallet.periodIncome }}</dt><dd :class="$style.income">{{ stats ? signedAmount(stats.income) : '-' }}</dd></div>
			<div><dt>{{ i18n.ts._wallet.periodExpense }}</dt><dd>{{ stats ? signedAmount(-stats.expense) : '-' }}</dd></div>
		</dl>
		<section v-if="wallet" class="_gaps_s">
			<div :class="$style.tabs" role="group" :aria-label="i18n.ts._wallet.flowTrend">
				<button v-for="days in ranges" :key="days" type="button" class="_button _tabUnderline" :class="[$style.tab, { [$style.selected]: range === days }]" :aria-pressed="range === days" @click="range = days">{{ i18n.ts._wallet._ranges[days] }}</button>
			</div>
			<XCharts v-if="stats" :stats="stats"/>
			<div v-else :class="$style.chartsPlaceholder">
				<MkLoading v-if="loading"/>
				<template v-else-if="statsError"><p :class="$style.caption">{{ i18n.ts._wallet.statsFailed }}</p><MkButton small @click="refresh">{{ i18n.ts.retry }}</MkButton></template>
			</div>
		</section>
		<section class="_gaps" :class="$style.activity">
			<div :class="$style.heading"><h2>{{ i18n.ts._wallet.recentActivity }}</h2><MkA to="/my/wallet/transactions">{{ i18n.ts._wallet.transactions }}</MkA></div>
			<ul v-if="transactions.length" :class="$style.list">
				<li v-for="entry in transactions" :key="entry.id">
					<span>{{ i18n.ts._wallet._types[entry.type] }}</span>
					<!-- 可用积分不变、只有冻结积分变化时，显示冻结变化而不是 0。 -->
					<strong v-if="entry.amount === 0 && entry.reservedAmount" v-tooltip="i18n.tsx._wallet.reservedChange({ amount: signedAmount(entry.reservedAmount) })" :class="$style.reserved">{{ i18n.tsx._wallet.reservedShort({ amount: signedAmount(entry.reservedAmount) }) }}</strong>
					<strong v-else :class="entry.amount > 0 ? $style.income : undefined">{{ signedAmount(entry.amount) }}</strong>
					<MkTime :time="entry.createdAt" mode="detail"/>
				</li>
			</ul>
			<p v-else-if="!loading && !loadError" :class="$style.caption">{{ i18n.ts._wallet.empty }}</p>
		</section>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, inject, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkA from '@/components/global/MkA.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { DI } from '@/di.js';

// 图表库较大，只在打开积分概览时加载；进入页面就和接口并行下载，数据回来时图表可以一起显示。
const chartsLoader = import('./wallet.overview.charts.vue').then(module => module.default);
const XCharts = defineAsyncComponent({ loader: () => chartsLoader, suspensible: false });

ensureSignin();
const ranges = [7, 30, 90] as const;
const range = ref<typeof ranges[number]>(30);
const wallet = ref<entities.IWalletResponse | null>(null);
const transactions = ref<entities.IWalletTransactionsResponse>([]);
const stats = ref<entities.IWalletStatsResponse | null>(null);
const loading = ref(false);
const loadError = ref(false);
const statsError = ref(false);
const pageActive = inject(DI.pageActive, ref(true));
let active = true;
let generation = 0;

function signedAmount(amount: number): string {
	return `${amount > 0 ? '+' : ''}${amount.toLocaleString()}`;
}

async function refresh() {
	if (!active || !pageActive.value) return;
	const request = ++generation;
	loading.value = true;
	loadError.value = false;
	statsError.value = false;
	// 统计失败不影响余额和流水显示。
	const statsRequest = misskeyApi('i/wallet/stats', { days: range.value, timezoneOffset: new Date().getTimezoneOffset() })
		.then(result => Array.isArray(result?.days) ? result : null, () => null);
	try {
		const [balance, history, summary] = await Promise.all([
			misskeyApi('i/wallet'),
			misskeyApi('i/wallet/transactions', { limit: 5 }),
			statsRequest,
			// 图表代码下载失败时由图表区域自己处理，不影响余额和流水。
			chartsLoader.catch(() => null),
		]);
		if (!active || request !== generation) return;
		wallet.value = balance;
		transactions.value = history;
		stats.value = summary;
		statsError.value = summary == null;
	} catch {
		if (active && request === generation) loadError.value = true;
	} finally {
		if (request === generation) loading.value = false;
	}
}

function invalidate() { generation++; loading.value = false; }

function deactivate() { active = false; invalidate(); }

const onRefresh = () => { void refresh(); };
watch(pageActive, value => { if (value) onRefresh(); else invalidate(); });
watch(range, () => { stats.value = null; onRefresh(); });
onMounted(() => {
	window.addEventListener('focus', onRefresh);
	window.addEventListener('online', onRefresh);
});
onActivated(() => { const wasInactive = !active; active = true; if (wasInactive) onRefresh(); });
onDeactivated(deactivate);
onBeforeUnmount(() => {
	deactivate();
	window.removeEventListener('focus', onRefresh);
	window.removeEventListener('online', onRefresh);
});
void refresh();
definePage(() => ({ title: i18n.ts._wallet.overview, icon: 'ti ti-wallet' }));
</script>

<style lang="scss" module>
.root { min-width: 0; container-type: inline-size; }
.root h2, .root p { margin: 0; }
.heading { display: flex; align-items: center; justify-content: space-between; gap: var(--MI-margin); flex-wrap: wrap; }
.heading h2 { font-size: 1.1em; }
.caption { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; line-height: 1.7; }
.balances { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--MI-margin); margin: 0; }
.balances dt { color: var(--MI_THEME-fgTransparentWeak); }
.balances dd { margin: var(--MI-marginHalf) 0 0; font-size: 1.8em; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.tabs { display: flex; flex-wrap: wrap; border-bottom: var(--MI-divider); }
.tab { --MI-tabPaddingInline: 8px; padding: 10px var(--MI-tabPaddingInline); font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
.selected { --MI-tabUnderlineOpacity: 1; color: var(--MI_THEME-accent); }
// 与图表区域高度一致，加载完成时不跳动。
.chartsPlaceholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--MI-marginHalf); min-height: 520px; }
@container (max-width: 700px) {
	.balances { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.balances dd { font-size: 1.5em; }
}
.activity { padding-top: var(--MI-margin); border-top: var(--MI-divider); }
.list { margin: 0; padding: 0; list-style: none; }
.list li { display: flex; align-items: center; gap: var(--MI-marginHalf); padding: 8px 0; border-top: var(--MI-divider); white-space: nowrap; }
.list li:first-child { border-top: 0; }
.list li > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.reserved { color: var(--MI_THEME-warn); font-weight: normal; }
.list time { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.income { color: var(--MI_THEME-success); }
// 窄屏下时间另起一行，避免被截断。
@container (max-width: 500px) {
	.list li { flex-wrap: wrap; row-gap: 2px; }
	.list time { flex-basis: 100%; }
}
</style>
