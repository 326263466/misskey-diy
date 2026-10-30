<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<template #header-actions><MkButton small :disabled="loading" :wait="loading" @click="refresh()">{{ i18n.ts.reload }}</MkButton></template>
	<section class="_gaps" :class="$style.root" :aria-busy="loading">
		<div :class="$style.tabs" role="group" :aria-label="i18n.ts._wallet.transactions">
			<button v-for="item in categories" :key="item.key" type="button" class="_button _tabUnderline" :class="[$style.tab, { [$style.selected]: category === item.key }]" :aria-pressed="category === item.key" @click="category = item.key">{{ item.title }}</button>
		</div>
		<div v-if="!transactions.length" :class="$style.empty">
			<MkLoading v-if="loading"/>
			<MkButton v-else-if="loadError" small @click="loadHistory(appendFailed)">{{ i18n.ts.retry }}</MkButton>
			<p v-else>{{ i18n.ts._wallet.empty }}</p>
		</div>
		<div v-else :class="$style.tableScroller" tabindex="0" role="region" :aria-label="i18n.ts._wallet.history">
			<table :class="$style.table">
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
						<th scope="col">{{ i18n.ts._wallet.columnCreatedAt }}</th>
						<th scope="col">{{ i18n.ts._wallet.columnTransactedAt }}</th>
						<th scope="col">{{ i18n.ts._wallet.columnExpiresAt }}</th>
						<th scope="col">{{ i18n.ts._wallet._receipt.remark }}</th>
						<th scope="col" :class="$style.operationColumn">{{ i18n.ts._wallet.columnOperation }}</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="entry in transactions" :key="entry.id">
						<td><span :class="$style.name" :title="entry.description || i18n.ts._wallet._types[entry.type]">{{ entry.description || i18n.ts._wallet._types[entry.type] }}</span></td>
						<td :class="$style.amount">
							<strong :class="entry.amount > 0 ? $style.income : undefined">{{ signedAmount(entry.amount) }}</strong>
						</td>
						<td :class="$style.secondaryColumn"><span :class="[$style.badge, $style[`badge${badgeTone(entry)}`]]">{{ i18n.ts._wallet._categories[transactionCategory(entry)] }}</span></td>
						<td :class="$style.secondaryColumn"><span :class="[$style.badge, $style.recorded]">{{ i18n.ts._wallet.statusRecorded }}</span></td>
						<td :class="$style.flowColumn">
							<span v-if="entry.flow" v-tooltip.top.mfm.noDelay="walletFlowDescription(entry.flow)" :class="$style.flow" tabindex="0" role="img" :aria-label="walletFlowDescription(entry.flow)">
								<span :class="$style.flowNode">
									<MkAvatar v-if="entry.flow.fromUser" :user="entry.flow.fromUser" :link="false" :preview="false" imageOnly :class="$style.flowAvatar" title=""/>
									<span v-else :class="[$style.flowBadge, $style[`flow_${entry.flow.from}`]]"><i :class="['ti', flowIcon(entry.flow.from)]" aria-hidden="true"></i></span>
								</span>
								<i class="ti ti-arrow-narrow-right" :class="$style.flowArrow" aria-hidden="true"></i>
								<span :class="$style.flowNode">
									<MkAvatar v-if="entry.flow.toUser" :user="entry.flow.toUser" :link="false" :preview="false" imageOnly :class="$style.flowAvatar" title=""/>
									<span v-else :class="[$style.flowBadge, $style[`flow_${entry.flow.to}`]]"><i :class="['ti', flowIcon(entry.flow.to)]" aria-hidden="true"></i></span>
								</span>
							</span>
							<span v-else :class="$style.unavailable">-</span>
						</td>
						<td :class="[$style.appColumn, { [$style.unavailable]: !entry.businessName }]"><span :class="$style.name" :title="entry.businessName || undefined">{{ entry.businessName || '-' }}</span></td>
						<td class="_selectable" :class="$style.numberColumn">{{ entry.number }}</td>
						<td class="_selectable" :class="$style.businessColumn">{{ entry.businessNumber || '-' }}</td>
						<td><MkTime :time="entry.businessCreatedAt || entry.createdAt" mode="absolute"/></td>
						<td><MkTime :time="entry.createdAt" mode="absolute"/></td>
						<td><MkTime v-if="entry.businessExpiresAt" :time="entry.businessExpiresAt" mode="absolute"/><span v-else>-</span></td>
						<td><span :class="$style.remark" :title="entry.description || undefined">{{ entry.description || '-' }}</span></td>
						<td :class="$style.operationColumn"><button v-tooltip.top="i18n.ts._wallet.viewDetail" type="button" class="_button" :class="$style.detail" :disabled="receiptOpen" :aria-label="i18n.ts._wallet.viewDetail" aria-haspopup="dialog" @click="showReceipt(entry, $event)"><i class="ti ti-ticket" aria-hidden="true"></i></button></td>
					</tr>
				</tbody>
			</table>
			<div :class="$style.loadMore">
				<MkLoading v-if="loading"/>
				<MkButton v-else-if="loadError" small @click="loadHistory(appendFailed)">{{ i18n.ts.retry }}</MkButton>
				<div v-else-if="hasMore && pageActive" :key="nextId" v-appear="loadMore" :class="$style.sentinel" aria-hidden="true"></div>
			</div>
		</div>
	</section>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { inject, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import { DI } from '@/di.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { walletFlowDescription } from '@/utility/wallet.js';
import type { WalletTransaction, WalletFlow } from '@/utility/wallet.js';
import { appearDirective as vAppear } from '@/directives/appear.js';
import { usePageHistoryRestore } from '@/composables/use-page-history-restore.js';

ensureSignin();
type Category = NonNullable<entities.IWalletTransactionsRequest['category']>;

const transactions = ref<WalletTransaction[]>([]);
const category = ref<Category>('all');
const categories = (['income', 'expense', 'transfer', 'online', 'all'] as const).map(key => ({ key, title: i18n.ts._wallet._filters[key] }));
const loading = ref(false);
const loadError = ref(false);
const hasMore = ref(false);
const nextId = ref<string>();
const pageSize = 30;
const pageActive = inject(DI.pageActive, ref(true));
const historyRestoring = usePageHistoryRestore();
const receiptOpen = ref(false);
let disposeReceipt: (() => void) | undefined;
let receiptGeneration = 0;
let appendFailed = false;
let active = true;
let generation = 0;
let interrupted = false;

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

function badgeTone(entry: WalletTransaction): 'Income' | 'Transfer' | 'Online' | 'Order' | 'Neutral' {
	const type = transactionCategory(entry);
	if (type === 'redPacket' || type === 'checkin') return 'Income';
	if (type === 'transfer') return 'Transfer';
	if (type === 'tip') return 'Online';
	if (type === 'order') return 'Order';
	return 'Neutral';
}

function flowIcon(kind: WalletFlow['from']): string {
	if (kind === 'system') return 'ti-building-bank';
	if (kind === 'redPacket') return 'ti-gift-filled';
	if (kind === 'reserved') return 'ti-hourglass';
	if (kind === 'user') return 'ti-coins';
	return 'ti-help-circle';
}

async function loadHistory(append = false) {
	if (!active || !pageActive.value || loading.value || (append && !hasMore.value)) return;
	const request = ++generation;
	interrupted = false;
	const selectedCategory = category.value;
	const untilId = append ? nextId.value : undefined;
	appendFailed = append;
	loading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('i/wallet/transactions', { category: selectedCategory, limit: pageSize + 1, untilId });
		if (!active || !pageActive.value || request !== generation) return;
		const page = result.slice(0, pageSize);
		transactions.value = [...new Map([...(append ? transactions.value : []), ...page].map(entry => [entry.id, entry])).values()];
		nextId.value = page.at(-1)?.id;
		hasMore.value = result.length > pageSize && nextId.value !== untilId;
	} catch {
		if (active && pageActive.value && request === generation) loadError.value = true;
	} finally {
		if (request === generation) loading.value = false;
	}
}

function loadMore() { return loadHistory(true); }

function refresh(clear = false) {
	generation++;
	loading.value = false;
	if (clear) {
		transactions.value = [];
		hasMore.value = false;
	}
	void loadHistory();
}

async function showReceipt(entry: WalletTransaction, event: MouseEvent) {
	if (!active || !pageActive.value || receiptOpen.value) return;
	const trigger = event.currentTarget;
	receiptOpen.value = true;
	const request = ++receiptGeneration;
	try {
		const { default: ReceiptDialog } = await import('./wallet.transaction-receipt.vue');
		if (!active || !pageActive.value || request !== receiptGeneration) return;
		const { dispose } = os.popup(ReceiptDialog, { entry }, {
			closed: () => {
				if (request === receiptGeneration) {
					receiptOpen.value = false;
					disposeReceipt = undefined;
					void nextTick(() => {
						if (active && pageActive.value && request === receiptGeneration && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
					});
				}
				dispose();
			},
		});
		disposeReceipt = dispose;
	} catch {
		if (request === receiptGeneration) {
			receiptOpen.value = false;
			if (active && pageActive.value) os.toast(i18n.ts.somethingHappened, 'error');
		}
	}
}

function invalidate() {
	interrupted ||= loading.value;
	generation++;
	loading.value = false;
	receiptGeneration++;
	disposeReceipt?.();
	disposeReceipt = undefined;
	receiptOpen.value = false;
}

function deactivate() { active = false; invalidate(); }

function refreshOnActivation() {
	if (historyRestoring.value && transactions.value.length > 0) {
		if (loadError.value || interrupted) void loadHistory(appendFailed);
		return;
	}
	refresh();
}

watch(category, () => refresh(true));
watch(pageActive, value => { if (value) refreshOnActivation(); else invalidate(); }, { flush: 'sync' });
onActivated(() => { const wasInactive = !active; active = true; if (wasInactive) refreshOnActivation(); });
onDeactivated(deactivate);
onBeforeUnmount(deactivate);
void loadHistory();
definePage(() => ({ title: i18n.ts._wallet.transactions, icon: 'ti ti-list-details' }));
</script>

<style lang="scss" module>
.root { min-width: 0; container-type: inline-size; }
.root p { margin: 0; }
.tabs { display: flex; flex-wrap: wrap; border-bottom: var(--MI-divider); }
.tab { --MI-tabPaddingInline: 8px; padding: 10px var(--MI-tabPaddingInline); font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
.selected { --MI-tabUnderlineOpacity: 1; color: var(--MI_THEME-accent); }
// 每行单行显示；列宽不够时横向滚动，不压缩或折行。
.tableScroller { max-height: min(68dvh, 760px); overflow: auto; scrollbar-gutter: stable; }
.tableScroller:focus-visible, .flow:focus-visible, .detail:focus-visible { outline: 2px solid var(--MI_THEME-accent); outline-offset: -2px; }
.table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; line-height: 20px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.table th, .table td { padding: 4px 8px; border-bottom: var(--MI-divider); vertical-align: middle; }
.table td { border-bottom-style: dashed; }
.table th { position: sticky; top: 0; z-index: 1; height: 24px; background: var(--MI_THEME-panel); color: var(--MI_THEME-fgTransparentWeak); font-weight: 500; }
.table th:first-child, .table td:first-child { padding-left: 0; }
.table th:last-child, .table td:last-child { padding-right: 0; }
.pointsColumn { text-align: right; }
.secondaryColumn { text-align: center; }
.flowColumn { text-align: center; }
.appColumn { text-align: center; }
.table .operationColumn { position: sticky; right: 0; background: var(--MI_THEME-panel); text-align: center; padding-inline: 8px; }
.table th.operationColumn { z-index: 2; }
.amount { font-variant-numeric: tabular-nums; text-align: right; }
.name { display: block; max-width: 12em; overflow: hidden; text-overflow: ellipsis; }
.badge { display: inline-flex; align-items: center; box-sizing: border-box; padding: 0 4px; border-radius: 999px; font-size: 12px; line-height: 18px; vertical-align: middle; }
.badgeIncome, .recorded { color: var(--MI_THEME-success); background: color-mix(in srgb, var(--MI_THEME-success) 12%, transparent); }
.badgeTransfer { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.badgeOnline { color: var(--MI_THEME-infoFg); background: var(--MI_THEME-infoBg); }
.badgeOrder { color: var(--MI_THEME-infoWarnFg); background: var(--MI_THEME-infoWarnBg); }
.badgeNeutral { color: var(--MI_THEME-fgTransparentWeak); background: var(--MI_THEME-buttonBg); }
.unavailable { color: var(--MI_THEME-fgTransparentWeak); text-align: center; }
// 积分动向是辅助信息：箭头用副色、间距紧凑，不加底色，悬停只显示说明。
.flow { display: inline-flex; max-width: 100%; align-items: center; justify-content: center; gap: 0; border-radius: 999px; vertical-align: middle; cursor: pointer; }
.flow:focus-visible { outline-offset: 2px; }
.flowArrow { flex: 0 0 auto; font-size: 10px; color: var(--MI_THEME-fgTransparentWeak); }
.flowAvatar { width: 16px; height: 16px; }
.flowNode { display: inline-flex; width: 16px; height: 16px; align-items: center; justify-content: center; pointer-events: none; }
// 非用户一方与头像同尺寸，用彩色圆形区分平台、红包、冻结和未知。
.flowBadge { display: grid; width: 100%; height: 100%; place-items: center; border-radius: 50%; color: var(--MI_THEME-fgOnAccent); font-size: 10px; background-image: linear-gradient(140deg, color-mix(in srgb, var(--flowColor) 70%, var(--MI_THEME-panel)), var(--flowColor)); }
.flow_system { --flowColor: var(--MI_THEME-link); }
.flow_redPacket { --flowColor: var(--MI_THEME-error); }
.flow_reserved { --flowColor: var(--MI_THEME-warn); }
.flow_user { --flowColor: var(--MI_THEME-success); }
.flow_unknown { --flowColor: var(--MI_THEME-fgTransparentWeak); }
.income { color: var(--MI_THEME-success); }
.detail { display: grid; width: 24px; height: 24px; margin-inline: auto; place-items: center; color: var(--MI_THEME-fgTransparentWeak); font-size: 14px; }
.detail:not(:disabled):is(:hover, :focus-visible) { color: var(--MI_THEME-accent); }
.empty { display: grid; min-height: 160px; place-items: center; color: var(--MI_THEME-fgTransparentWeak); }
.numberColumn, .businessColumn { font-variant-numeric: tabular-nums; }
.remark { display: block; max-width: 26em; overflow: hidden; text-overflow: ellipsis; }
.loadMore { position: sticky; left: 0; display: grid; justify-items: center; padding-block: 12px; }
.loadMore:empty { display: none; }
.sentinel { width: 1px; height: 1px; }
</style>
