<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m" :class="$style.root" :aria-busy="loading">
	<div :class="$style.heading">
		<h1>{{ i18n.ts._wallet.overview }}</h1>
		<MkButton small :disabled="loading" :wait="loading" @click="refresh">{{ i18n.ts.reload }}</MkButton>
	</div>
	<MkLoading v-if="loading && !wallet"/>
	<MkButton v-if="loadError" small :disabled="loading" @click="refresh">{{ i18n.ts.retry }}</MkButton>
	<dl v-if="wallet" :class="$style.balances">
		<div><dt>{{ i18n.ts._wallet.balance }}</dt><dd data-testid="wallet-balance">{{ wallet.balance.toLocaleString() }}</dd></div>
		<div><dt>{{ i18n.ts._wallet.reservedBalance }}</dt><dd>{{ wallet.reservedBalance.toLocaleString() }}</dd></div>
	</dl>
	<section class="_gaps" :class="$style.activity">
		<div :class="$style.heading"><h2>{{ i18n.ts._wallet.recentActivity }}</h2><MkA to="/wallet/transactions">{{ i18n.ts._wallet.transactions }}</MkA></div>
		<ul v-if="transactions.length" :class="$style.list">
			<li v-for="entry in transactions" :key="entry.id">
				<span>{{ i18n.ts._wallet._types[entry.type] }}</span>
				<strong :class="entry.amount > 0 ? $style.income : undefined">{{ entry.amount > 0 ? '+' : '' }}{{ entry.amount.toLocaleString() }}</strong>
				<MkTime :time="entry.createdAt" mode="detail"/>
			</li>
		</ul>
		<p v-else-if="!loading && !loadError" :class="$style.caption">{{ i18n.ts._wallet.empty }}</p>
	</section>
</div>
</template>

<script lang="ts" setup>
import { inject, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkA from '@/components/global/MkA.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { DI } from '@/di.js';

ensureSignin();
const wallet = ref<entities.IWalletResponse | null>(null);
const transactions = ref<entities.IWalletTransactionsResponse>([]);
const loading = ref(false);
const loadError = ref(false);
const pageActive = inject(DI.pageActive, ref(true));
let active = true;
let generation = 0;

async function refresh() {
	if (!active || !pageActive.value) return;
	const request = ++generation;
	loading.value = true;
	loadError.value = false;
	try {
		const [balance, history] = await Promise.all([
			misskeyApi('i/wallet'),
			misskeyApi('i/wallet/transactions', { limit: 5 }),
		]);
		if (!active || request !== generation) return;
		wallet.value = balance;
		transactions.value = history;
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
.root { min-width: 0; }
.root h1, .root h2, .root p { margin: 0; }
.heading { display: flex; align-items: center; justify-content: space-between; gap: var(--MI-margin); flex-wrap: wrap; }
.heading h1 { font-size: 1.35em; }
.heading h2 { font-size: 1.1em; }
.caption { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; line-height: 1.7; }
.balances { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--MI-margin); margin: 0; }
.balances dt { color: var(--MI_THEME-fgTransparentWeak); }
.balances dd { margin: var(--MI-marginHalf) 0 0; font-size: 1.8em; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.activity { padding-top: var(--MI-margin); border-top: var(--MI-divider); }
.list { margin: 0; padding: 0; list-style: none; }
.list li { display: flex; align-items: center; flex-wrap: wrap; gap: var(--MI-marginHalf); padding: var(--MI-marginHalf) 0; border-top: var(--MI-divider); }
.list li:first-child { border-top: 0; }
.list li > span { flex: 1; }
.list time { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.income { color: var(--MI_THEME-success); }
</style>
