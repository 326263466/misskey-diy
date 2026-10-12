<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="420" :height="720" autoHeight :closeButtonRight="true" headerIcon="ti ti-receipt" @close="dialogEl?.close()" @closed="emit('closed')">
	<template #header>{{ i18n.ts._wallet.viewDetail }}</template>
	<div :class="$style.receipt">
		<div :class="$style.top">
			<strong :class="$style.bigName">{{ i18n.ts._wallet._receipt.title }}</strong>
			<MkTime :time="entry.createdAt" mode="absolute" :class="$style.topDate"/>
		</div>
		<div :class="$style.divider"></div>
		<div :class="$style.total">
			<span :class="$style.totalLabel">{{ i18n.ts._wallet._receipt.totalCredits }}</span>
			<span :class="[$style.totalValue, entry.amount > 0 ? $style.income : undefined]">{{ amountDisplay }}</span>
		</div>
		<div :class="$style.divider"></div>
		<dl :class="$style.rows">
			<div><dt>{{ i18n.ts._wallet._receipt.number }}</dt><dd :class="$style.mono">{{ entry.id }}</dd></div>
			<div v-if="entry.relatedId"><dt>{{ i18n.ts._wallet.columnRelatedId }}</dt><dd :class="$style.mono">{{ entry.relatedId }}</dd></div>
			<div><dt>{{ i18n.ts._wallet._receipt.type }}</dt><dd>{{ i18n.ts._wallet._types[entry.type] }}</dd></div>
			<div><dt>{{ i18n.ts._wallet.columnStatus }}</dt><dd>{{ i18n.ts._wallet.statusRecorded }}</dd></div>
			<div><dt>{{ i18n.ts._wallet.columnBalance }}</dt><dd>{{ entry.balance.toLocaleString() }}</dd></div>
			<div v-if="entry.reservedAmount"><dt>{{ i18n.ts._wallet.columnReserved }}</dt><dd>{{ entry.reservedAmount > 0 ? '+' : '' }}{{ entry.reservedAmount.toLocaleString() }}</dd></div>
			<div v-if="entry.reservedAmount || entry.reservedBalance"><dt>{{ i18n.ts._wallet.columnReservedBalance }}</dt><dd>{{ entry.reservedBalance.toLocaleString() }}</dd></div>
			<div><dt>{{ i18n.ts._wallet._receipt.consumer }}</dt><dd :class="$style.flowValue">{{ flowName(entry.flow?.from, entry.flow?.fromUser) }}</dd></div>
			<div><dt>{{ i18n.ts._wallet._receipt.provider }}</dt><dd :class="$style.flowValue">{{ flowName(entry.flow?.to, entry.flow?.toUser) }}</dd></div>
			<div><dt>{{ i18n.ts._wallet._receipt.remark }}</dt><dd>{{ entry.description || i18n.ts._wallet._receipt.noRemark }}</dd></div>
			<div><dt>{{ i18n.ts._wallet._receipt.time }}</dt><dd><MkTime :time="entry.createdAt" mode="absolute"/></dd></div>
		</dl>
		<div :class="$style.divider"></div>
		<div :class="$style.barcode" aria-hidden="true"></div>
		<div :class="$style.brand">{{ i18n.tsx._wallet._receipt.brand({ name: brandName }) }}</div>
	</div>
</MkModalWindow>
</template>
<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import type { entities } from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';

type WalletTransaction = entities.IWalletTransactionsResponse[number];
type FlowKind = 'user' | 'system' | 'redPacket' | 'reserved' | 'unknown';
type WalletFlow = { from: FlowKind; to: FlowKind; fromUser: entities.UserLite | null; toUser: entities.UserLite | null };
type TransactionEntry = WalletTransaction & { flow?: WalletFlow };

const props = defineProps<{ entry: TransactionEntry }>();
const emit = defineEmits<{ (event: 'closed'): void }>();

const dialogEl = useTemplateRef('dialogEl');
const amountDisplay = computed(() => `${props.entry.amount > 0 ? '+' : ''}${props.entry.amount.toFixed(2)}`);
const brandName = instance.name || 'Misskey';

function flowName(kind: FlowKind | undefined, user: entities.UserLite | null | undefined): string {
	if (kind === 'user' && user) return user.name || user.username;
	if (kind === 'system') return i18n.ts._wallet._categories.system;
	if (kind === 'redPacket') return i18n.ts._wallet._categories.redPacket;
	if (kind === 'reserved') return i18n.ts._wallet.reservedBalance;
	return i18n.ts._wallet.unknownUser;
}
</script>

<style lang="scss" module>
.receipt { padding: 20px 22px 24px; display: flex; flex-direction: column; gap: 14px; }
.top { text-align: center; display: flex; flex-direction: column; gap: 4px; }
.bigName { font-size: 1.5em; font-weight: 700; overflow-wrap: anywhere; }
.topDate { color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; letter-spacing: .04em; }
.divider { border-top: var(--MI-divider); }
.total { text-align: center; display: flex; flex-direction: column; gap: 4px; }
.totalLabel { color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; letter-spacing: .12em; }
.totalValue { font-size: 2.4em; font-weight: 700; line-height: 1.1; }
.income { color: var(--MI_THEME-success); }
.rows { margin: 0; display: flex; flex-direction: column; gap: 10px; }
.rows > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--MI-margin); }
.rows dt { margin: 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; white-space: nowrap; }
.rows dd { min-width: 0; margin: 0; text-align: right; white-space: pre-wrap; overflow-wrap: anywhere; }
.flowValue { font-weight: 600; }
.mono { font-family: var(--MI-fontMonospace, monospace); font-size: .9em; }
.barcode { width: 60%; height: 36px; align-self: center; opacity: .4; background: repeating-linear-gradient(to right, var(--MI_THEME-fg) 0 1px, transparent 1px 4px, var(--MI_THEME-fg) 4px 6px, transparent 6px 9px); }
.brand { text-align: center; color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; letter-spacing: .18em; text-transform: uppercase; }
</style>
