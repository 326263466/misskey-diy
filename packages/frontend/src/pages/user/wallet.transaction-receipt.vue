<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal preferType="dialog" @opened="receiptEl?.focus({ preventScroll: true })" @closed="emit('closed')">
	<div ref="receiptEl" class="_panel _selectable" :class="$style.receipt" role="dialog" aria-modal="true" :aria-label="i18n.ts._wallet._receipt.title" tabindex="-1">
		<div :class="$style.top">
			<strong :class="$style.bigName">{{ entry.businessName || i18n.ts._wallet._receipt.title }}</strong>
			<MkTime :time="entry.createdAt" mode="absolute" :class="$style.topDate"/>
		</div>
		<div :class="$style.divider"></div>
		<div :class="$style.total">
			<span :class="$style.totalLabel">{{ i18n.ts._wallet._receipt.totalCredits }}</span>
			<span :class="[$style.totalValue, { [$style.income]: entry.amount > 0, [$style.expense]: entry.amount < 0 }]">{{ amountDisplay }}</span>
		</div>
		<div :class="$style.divider"></div>
		<dl :class="$style.rows">
			<div><dt>{{ i18n.ts._wallet._receipt.number }}</dt><dd :class="$style.number">{{ entry.number }}</dd></div>
			<div v-if="entry.businessNumber"><dt>{{ i18n.ts._wallet.columnRelatedId }}</dt><dd :class="$style.number">{{ entry.businessNumber }}</dd></div>
			<div><dt>{{ i18n.ts._wallet._receipt.type }}</dt><dd>{{ i18n.ts._wallet._types[entry.type] }}</dd></div>
			<div v-if="walletFlowName(entry.flow?.from, entry.flow?.fromUser)"><dt>{{ i18n.ts._wallet._receipt.consumer }}</dt><dd>{{ walletFlowName(entry.flow?.from, entry.flow?.fromUser) }}</dd></div>
			<div v-if="walletFlowName(entry.flow?.to, entry.flow?.toUser)"><dt>{{ i18n.ts._wallet._receipt.provider }}</dt><dd>{{ walletFlowName(entry.flow?.to, entry.flow?.toUser) }}</dd></div>
			<div><dt>{{ i18n.ts._wallet._receipt.remark }}</dt><dd>{{ entry.description || i18n.ts._wallet._receipt.noRemark }}</dd></div>
			<div><dt>{{ i18n.ts._wallet._receipt.time }}</dt><dd><MkTime :time="entry.createdAt" mode="absolute"/></dd></div>
		</dl>
		<div :class="$style.divider"></div>
		<div :class="[$style.barcode, { [$style.animated]: prefer.s.animation }]" aria-hidden="true">
			<span v-for="(bar, index) in bars" :key="index" :style="{ height: `${bar.height}%`, '--low': bar.low, animationDuration: `${bar.duration}ms`, animationDelay: `-${bar.delay}ms` }"></span>
		</div>
		<div :class="$style.brand">{{ i18n.tsx._wallet._receipt.brand({ name: brandName }) }}</div>
	</div>
</MkModal>
</template>
<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { host } from '@@/js/config.js';
import { prefer } from '@/preferences.js';
import { walletFlowName } from '@/utility/wallet.js';
import type { WalletTransaction } from '@/utility/wallet.js';

const props = defineProps<{ entry: WalletTransaction }>();
const emit = defineEmits<{ (event: 'closed'): void }>();
const receiptEl = useTemplateRef('receiptEl');

const amountDisplay = computed(() => `${props.entry.amount > 0 ? '+' : ''}${props.entry.amount.toFixed(2)}`);
const brandName = instance.name || host;
const bars = computed(() => {
	// 每张凭证按自己的流水号生成线条；同一订单的买卖双方也不相同，重复打开保持一致。
	const number = props.entry.number;
	let seed = 0x811c9dc5;
	for (let index = 0; index < number.length; index++) {
		seed = Math.imul(seed ^ number.charCodeAt(index), 0x01000193) >>> 0;
	}
	seed ||= 0x9e3779b9;
	const next = (range: number) => {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		seed >>>= 0;
		return seed % range;
	};
	// 伸缩幅度较小，动画中仍能看出每张凭证的高低轮廓。
	return Array.from({ length: 30 }, () => ({
		height: 25 + next(76),
		low: (72 + next(19)) / 100,
		duration: 1000 + next(1000),
		delay: next(2000),
	}));
});
</script>

<style lang="scss" module>
.receipt { box-sizing: border-box; margin: auto; flex: 0 0 auto; width: min(390px, calc(100vw - 40px)); max-height: calc(100dvh - 64px); overflow-y: auto; padding: 26px 28px 22px; display: flex; flex-direction: column; gap: 12px; font-size: .94em; border-radius: var(--MI-dialogRadius); }
.top { text-align: center; display: flex; flex-direction: column; gap: 5px; }
.bigName { font-size: 1.75em; font-weight: 700; line-height: 1.25; letter-spacing: .06em; overflow-wrap: anywhere; }
.topDate { color: var(--MI_THEME-fgTransparentWeak); font-family: Consolas, Menlo, monospace; font-size: .8em; letter-spacing: .08em; font-variant-numeric: tabular-nums; }
.divider { flex-shrink: 0; border-top: var(--MI-dividerWidth) dashed var(--MI_THEME-divider); } // divider-exempt: receipt perforation line
.total { text-align: center; display: flex; flex-direction: column; gap: 5px; padding-block: 3px; }
.totalLabel { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; letter-spacing: .18em; }
.totalValue { font-size: 2.2em; font-weight: 700; line-height: 1.25; letter-spacing: -.01em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.income { color: var(--MI_THEME-success); }
.expense { color: var(--MI_THEME-error); }
.rows { margin: 0; display: flex; flex-direction: column; }
.rows > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--MI-margin); padding-block: 6px; }
.rows > div + div { border-top: var(--MI-dividerWidth) dashed color-mix(in srgb, var(--MI_THEME-divider) 50%, transparent); } // divider-exempt: receipt row separator
.rows dt { margin: 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; white-space: nowrap; }
.rows dd { min-width: 0; margin: 0; text-align: right; white-space: pre-wrap; overflow-wrap: anywhere; }
.number { font-variant-numeric: tabular-nums; font-size: .9em; }
// 线条底端对齐，各自按不同节奏上下伸缩。
.barcode { display: flex; align-items: end; gap: 6px; height: 36px; flex: 0 0 36px; align-self: center; margin-top: 8px; opacity: .45; }
.barcode > span { flex: 0 0 2px; width: 2px; background: var(--MI_THEME-fg); transform-origin: bottom; }
.animated > span { animation: receipt-bar ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) { .animated > span { animation: none; } }
@keyframes receipt-bar { from { transform: scaleY(1); } to { transform: scaleY(var(--low)); } }
.brand { text-align: center; color: var(--MI_THEME-fgTransparentWeak); font-family: Consolas, Menlo, monospace; font-size: .8em; letter-spacing: .08em; }
</style>
