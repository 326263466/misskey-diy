<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section class="_gaps" :class="$style.root" :aria-busy="loading">
	<div :class="$style.heading">
		<h1>{{ i18n.ts._wallet.transactions }}</h1>
		<MkButton small :disabled="loading" :wait="loading" @click="refresh()">{{ i18n.ts.reload }}</MkButton>
	</div>
	<div :class="$style.tabs" role="group" :aria-label="i18n.ts._wallet.transactions">
		<button v-for="item in categories" :key="item.key" type="button" class="_button _tabUnderline" :class="[$style.tab, { [$style.selected]: category === item.key }]" :aria-pressed="category === item.key" @click="category = item.key">{{ item.title }}</button>
	</div>
	<div v-if="!transactions.length" :class="$style.empty">
		<MkLoading v-if="loading"/>
		<MkButton v-else-if="loadError" small @click="loadHistory(requestedPage)">{{ i18n.ts.retry }}</MkButton>
		<p v-else>{{ i18n.ts._wallet.empty }}</p>
	</div>
	<table v-else :class="$style.table">
		<thead>
			<tr>
				<th scope="col">{{ i18n.ts._wallet.columnName }}</th>
				<th scope="col" :class="$style.pointsColumn">{{ i18n.ts._wallet.columnPoints }}</th>
				<th scope="col" :class="$style.secondaryColumn">{{ i18n.ts._wallet.columnType }}</th>
				<th scope="col" :class="$style.secondaryColumn">{{ i18n.ts._wallet.columnStatus }}</th>
				<th scope="col" :class="$style.flowColumn">{{ i18n.ts._wallet.columnFlow }}</th>
				<th scope="col" :class="$style.appColumn">{{ i18n.ts._wallet.columnApp }}</th>
				<th scope="col" :class="$style.numberColumn">{{ i18n.ts._wallet.columnNumber }}</th>
				<th scope="col" :class="$style.businessColumn">{{ i18n.ts._wallet.columnRelatedId }}</th>
				<th scope="col" :class="$style.operationColumn">{{ i18n.ts._wallet.columnOperation }}</th>
			</tr>
		</thead>
		<tbody>
			<tr v-for="entry in transactions" :key="entry.id">
				<td><span :class="$style.name" :title="entry.description || i18n.ts._wallet._types[entry.type]">{{ entry.description || i18n.ts._wallet._types[entry.type] }}</span></td>
				<td :class="$style.amount"><strong :class="entry.amount > 0 ? $style.income : undefined">{{ signedAmount(entry.amount) }}</strong><span v-if="entry.reservedAmount" :class="$style.reserved">{{ i18n.tsx._wallet.reservedChange({ amount: signedAmount(entry.reservedAmount) }) }}</span></td>
				<td :class="$style.secondaryColumn"><span :class="[$style.badge, $style[`badge${badgeTone(entry)}`]]">{{ i18n.ts._wallet._categories[transactionCategory(entry)] }}</span></td>
				<td :class="$style.secondaryColumn"><span :class="[$style.badge, $style.recorded]">{{ i18n.ts._wallet.statusRecorded }}</span></td>
				<td :class="[$style.flowColumn, $style.flowCell]" :aria-label="flowDescription(entry)">
					<div v-if="entry.flow" :class="$style.flow" :title="flowDescription(entry)">
						<span :class="$style.flowNode" :title="flowLabel(entry.flow.from, entry.flow.fromUser)">
							<MkAvatar v-if="entry.flow.fromUser" :user="entry.flow.fromUser" :link="false" :preview="false" :class="$style.flowAvatar"/>
							<i v-else :class="['ti', flowIcon(entry.flow.from), $style.flowIcon]" aria-hidden="true"></i>
						</span>
						<i class="ti ti-arrow-narrow-right" :class="$style.flowArrow" aria-hidden="true"></i>
						<span :class="$style.flowNode" :title="flowLabel(entry.flow.to, entry.flow.toUser)">
							<MkAvatar v-if="entry.flow.toUser" :user="entry.flow.toUser" :link="false" :preview="false" :class="$style.flowAvatar"/>
							<i v-else :class="['ti', flowIcon(entry.flow.to), $style.flowIcon]" aria-hidden="true"></i>
						</span>
					</div>
					<span v-else :class="$style.unavailable">-</span>
				</td>
				<td :class="[$style.unavailable, $style.appColumn]">-</td>
				<td class="_selectable" :class="[$style.number, $style.numberColumn]" :title="entry.id">{{ entry.id }}</td>
				<td class="_selectable" :class="[$style.number, $style.businessColumn]" :title="entry.relatedId || undefined">{{ entry.relatedId || '-' }}</td>
				<td><button type="button" class="_button" :class="$style.detail" :disabled="receiptOpen" :title="i18n.ts._wallet.viewDetail" :aria-label="i18n.ts._wallet.viewDetail" aria-haspopup="dialog" @click="showReceipt(entry)"><i class="ti ti-receipt" aria-hidden="true"></i></button></td>
			</tr>
		</tbody>
	</table>
	<MkButton v-if="loadError && transactions.length" small :disabled="loading" @click="loadHistory(requestedPage)">{{ i18n.ts.retry }}</MkButton>
	<nav v-if="hasMore || currentPage > 1" :class="$style.pagination" :aria-label="i18n.ts._wallet.history">
		<MkButton small :disabled="loading || currentPage === 1" @click="loadHistory(currentPage - 1)">{{ i18n.ts._wallet.previousPage }}</MkButton>
		<span aria-live="polite">{{ i18n.tsx._wallet.historyPage({ page: currentPage }) }}</span>
		<MkButton small :disabled="loading || loadError || !hasMore" @click="loadHistory(currentPage + 1)">{{ i18n.ts._wallet.nextPage }}</MkButton>
	</nav>
</section>
</template>

<script lang="ts" setup>
import { inject, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import { DI } from '@/di.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';

ensureSignin();
type WalletTransaction = entities.IWalletTransactionsResponse[number];
type Category = NonNullable<entities.IWalletTransactionsRequest['category']>;
type FlowKind = 'user' | 'system' | 'redPacket' | 'reserved' | 'unknown';
type WalletFlow = {
	from: FlowKind;
	to: FlowKind;
	fromUser: entities.UserLite | null;
	toUser: entities.UserLite | null;
};
type TransactionEntry = WalletTransaction & { flow?: WalletFlow };

const transactions = ref<TransactionEntry[]>([]);
const category = ref<Category>('all');
const categories = (['income', 'expense', 'transfer', 'online', 'all'] as const).map(key => ({ key, title: i18n.ts._wallet._filters[key] }));
const loading = ref(false);
const loadError = ref(false);
const hasMore = ref(false);
const pageSize = 5;
const currentPage = ref(1);
const pageActive = inject(DI.pageActive, ref(true));
const receiptOpen = ref(false);
let disposeReceipt: (() => void) | undefined;
let receiptGeneration = 0;
let requestedPage = 1;
let cursors: (string | undefined)[] = [undefined];
let active = true;
let generation = 0;

function signedAmount(amount: number): string {
	const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
	return `${sign}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function transactionCategory(entry: WalletTransaction): keyof typeof i18n.ts._wallet._categories {
	if (entry.type.startsWith('redPacket')) return 'redPacket';
	if (entry.type.startsWith('transfer')) return 'transfer';
	if (entry.type.startsWith('tip')) return 'tip';
	if (entry.type.startsWith('checkin')) return 'checkin';
	if (entry.type === 'orderPayment' || entry.type === 'orderIncome') return 'order';
	if (entry.type === 'adminAdjustment') return 'admin';
	return 'system';
}

function badgeTone(entry: WalletTransaction): 'Income' | 'Expense' | 'Transfer' | 'Online' {
	if (entry.type.startsWith('redPacket') || entry.amount > 0) return 'Income';
	if (entry.type.startsWith('transfer')) return 'Transfer';
	if (entry.type.startsWith('tip')) return 'Online';
	return 'Expense';
}

function flowLabel(kind: FlowKind, user: entities.UserLite | null): string {
	if (kind === 'user' && user) return user.name || user.username;
	if (kind === 'system') return i18n.ts._wallet._categories.system;
	if (kind === 'redPacket') return i18n.ts._wallet._categories.redPacket;
	if (kind === 'reserved') return i18n.ts._wallet.reservedBalance;
	return i18n.ts._wallet.unknownUser;
}

function flowDescription(entry: TransactionEntry): string {
	if (!entry.flow) return i18n.ts._wallet.unknownUser;
	return `${flowLabel(entry.flow.from, entry.flow.fromUser)} → ${flowLabel(entry.flow.to, entry.flow.toUser)}`;
}

function flowIcon(kind: FlowKind): string {
	if (kind === 'system') return 'ti-adjustments-horizontal';
	if (kind === 'redPacket') return 'ti-gift';
	if (kind === 'reserved') return 'ti-lock';
	return 'ti-help-circle';
}

async function loadHistory(page = 1) {
	if (!active || !pageActive.value || loading.value || page < 1 || (page > 1 && cursors[page - 1] == null)) return;
	const request = ++generation;
	const selectedCategory = category.value;
	requestedPage = page;
	loading.value = true;
	loadError.value = false;
	try {
		let result: TransactionEntry[];
		do {
			result = await misskeyApi('i/wallet/transactions', { category: selectedCategory, limit: pageSize + 1, untilId: cursors[page - 1] }) as unknown as TransactionEntry[];
			if (!active || request !== generation) return;
			if (result.length > 0 || page === 1) break;
			page--;
		} while (page >= 1);
		transactions.value = result.slice(0, pageSize);
		hasMore.value = result.length > pageSize;
		currentPage.value = page;
		cursors = cursors.slice(0, page);
		cursors[page] = transactions.value.at(-1)?.id;
	} catch {
		if (active && request === generation) loadError.value = true;
	} finally {
		if (request === generation) loading.value = false;
	}
}

function refresh(clear = false) {
	generation++;
	loading.value = false;
	if (clear) {
		transactions.value = [];
		hasMore.value = false;
		currentPage.value = 1;
		cursors = [undefined];
	}
	void loadHistory();
}

async function showReceipt(entry: TransactionEntry) {
	if (!active || !pageActive.value || receiptOpen.value) return;
	receiptOpen.value = true;
	const request = ++receiptGeneration;
	try {
		const { dispose } = await os.popupAsyncWithDialog(import('./wallet.transaction-receipt.vue').then(module => module.default), { entry }, {
			closed: () => {
				if (request === receiptGeneration) { receiptOpen.value = false; disposeReceipt = undefined; }
				dispose();
			},
		});
		if (!active || !pageActive.value || request !== receiptGeneration) dispose();
		else disposeReceipt = dispose;
	} catch {
		if (request === receiptGeneration) receiptOpen.value = false;
	}
}

function invalidate() {
	generation++;
	loading.value = false;
	receiptGeneration++;
	disposeReceipt?.();
	disposeReceipt = undefined;
	receiptOpen.value = false;
}

function deactivate() { active = false; invalidate(); }

watch(category, () => refresh(true));
watch(pageActive, value => { if (value) refresh(); else invalidate(); });
onActivated(() => { const wasInactive = !active; active = true; if (wasInactive) refresh(); });
onDeactivated(deactivate);
onBeforeUnmount(deactivate);
void loadHistory();
definePage(() => ({ title: i18n.ts._wallet.transactions, icon: 'ti ti-list-details' }));
</script>

<style lang="scss" module>
.root { min-width: 0; container-type: inline-size; }
.root h1, .root p { margin: 0; }
.root h1 { font-size: 1.35em; }
.heading { display: flex; align-items: center; justify-content: space-between; gap: var(--MI-margin); flex-wrap: wrap; }
.tabs { display: flex; flex-wrap: wrap; border-bottom: var(--MI-divider); }
.tab { --MI-tabPaddingInline: 8px; padding: 10px var(--MI-tabPaddingInline); font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
.selected { --MI-tabUnderlineOpacity: 1; color: var(--MI_THEME-accent); }
.table { width: 100%; table-layout: fixed; border-collapse: collapse; text-align: left; font-size: 14px; }
.table th, .table td { padding: var(--MI-marginHalf); border-bottom: var(--MI-divider); vertical-align: middle; }
.table th { font-weight: 600; overflow-wrap: anywhere; }
.table th:first-child, .table td:first-child { padding-left: 0; }
.table th:last-child, .table td:last-child { padding-right: 0; }
.pointsColumn { width: 9%; text-align: right; }
.secondaryColumn { width: 8%; text-align: center; }
.flowColumn { width: 12%; text-align: center; }
.appColumn { width: 8%; text-align: center; }
.numberColumn { width: 14%; }
.businessColumn { width: 14%; }
.operationColumn { width: 3em; text-align: center; }
.amount { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.amount > * { display: block; }
.amount { text-align: right; }
.name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { display: inline-block; max-width: 100%; box-sizing: border-box; padding: 3px 7px; border-radius: var(--MI-radius); background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); overflow-wrap: anywhere; font-size: .9em; }
.badgeIncome { color: var(--MI_THEME-success); background: color-mix(in srgb, var(--MI_THEME-success) 16%, transparent); }
.badgeExpense { color: var(--MI_THEME-error); background: color-mix(in srgb, var(--MI_THEME-error) 16%, transparent); }
.badgeTransfer { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.badgeOnline { color: var(--MI_THEME-infoFg); background: var(--MI_THEME-infoBg); }
.recorded { color: var(--MI_THEME-success); background: color-mix(in srgb, var(--MI_THEME-success) 12%, transparent); }
.unavailable { color: var(--MI_THEME-fgTransparentWeak); text-align: center; }
.flowCell { text-align: center; }
.flow { display: inline-flex; max-width: 100%; align-items: center; justify-content: center; gap: 3px; vertical-align: middle; }
.flowArrow { flex: 0 0 auto; color: var(--MI_THEME-fgTransparentWeak); }
.flowAvatar { width: 20px; height: 20px; }
.flowNode { display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; overflow: hidden; }
.flowIcon { font-size: 18px; color: var(--MI_THEME-fgTransparentWeak); }
.reserved { margin-top: 4px; color: var(--MI_THEME-warn); font-size: .85em; white-space: normal; }
.income { color: var(--MI_THEME-success); }
.detail { display: grid; width: 32px; height: 32px; place-items: center; border-radius: var(--MI-radius); }
.detail:hover { background: var(--MI_THEME-buttonHoverBg); }
.empty { display: grid; min-height: 160px; place-items: center; color: var(--MI_THEME-fgTransparentWeak); }
.pagination { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--MI-marginHalf); font-size: .85em; }

@container (max-width: 560px) {
	.table th, .table td { padding-inline: 4px; }
	.secondaryColumn { display: none; }
	.appColumn, .numberColumn, .businessColumn { display: none; }
	.flowColumn { width: 24%; }
	.pointsColumn { width: 24%; }
}
</style>
