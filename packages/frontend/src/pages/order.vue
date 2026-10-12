<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<article :class="[$style.order, { [$style.embedded]: embedded }]" :aria-labelledby="headingId">
	<header :class="$style.heading">
		<h2 :id="headingId">{{ order.name }}</h2>
		<time v-if="order.createdAt" :datetime="order.createdAt">{{ new Date(order.createdAt).toLocaleString() }}</time>
	</header>
	<dl :class="$style.facts">
		<div><dt>{{ i18n.ts._marketplace.quantity }}</dt><dd>{{ order.quantity.toLocaleString() }} {{ order.unit }}</dd></div>
		<div><dt>{{ sales ? i18n.ts._payments.orderTotal : i18n.ts._marketplace.pointsRedemption }}</dt><dd>{{ order.total.toLocaleString() }} {{ i18n.ts._marketplace.pointUnit }}</dd></div>
		<div v-if="sales && order.platformFee != null"><dt>{{ i18n.ts._payments.platformFee }}<template v-if="order.feeRateBps != null"> ({{ (order.feeRateBps / 100).toLocaleString() }}%)</template></dt><dd>{{ order.platformFee.toLocaleString() }} {{ i18n.ts._marketplace.pointUnit }}</dd></div>
		<div v-if="sales && order.sellerAmount != null"><dt>{{ i18n.ts._payments.sellerAmount }}</dt><dd :class="$style.income">{{ order.sellerAmount.toLocaleString() }} {{ i18n.ts._marketplace.pointUnit }}</dd></div>
		<div><dt>{{ i18n.ts._marketplace.orderNumber }}</dt><dd class="_selectable"><MkA :to="`/my/${sales ? 'sales' : 'orders'}/${encodeURIComponent(order.id)}`">{{ order.id }}</MkA></dd></div>
		<div v-if="counterparty"><dt>{{ sales ? i18n.ts._marketplace.buyer : i18n.ts._marketplace.seller }}</dt><dd><MkA :to="userPage(counterparty)"><MkUserName :user="counterparty"/><span :class="$style.account">@{{ acct(counterparty) }}</span></MkA></dd></div>
	</dl>
	<section v-if="order.redemptionCode" :class="$style.codes">
		<h3>{{ i18n.ts._marketplace.redemptionCode }}</h3>
		<div :class="$style.code"><code class="_selectable _monospace">{{ order.redemptionCode }}</code><MkButton small @click="copyToClipboard(order.redemptionCode)"><i class="ti ti-copy" aria-hidden="true"></i> {{ i18n.ts._marketplace.copyCode }}</MkButton></div>
		<p>{{ i18n.ts._marketplace.redemptionCodeHint }}</p>
	</section>
	<div :class="$style.delivery">
		<div :class="$style.heading">
			<h3>{{ order.type === 'virtual' ? i18n.ts._marketplace.deliveredContent : i18n.ts._marketplace.physicalDelivery }}</h3>
			<MkButton v-if="order.deliveryText" @click="copyToClipboard(order.deliveryText)"><i class="ti ti-copy" aria-hidden="true"></i> {{ i18n.ts.copyContent }}</MkButton>
		</div>
		<p v-if="order.deliveryText" class="_selectable" :class="$style.content">{{ order.deliveryText }}</p>
		<p v-else>{{ i18n.ts._marketplace.deliveryUnavailable }}</p>
	</div>
</article>
</template>

<script lang="ts" setup>
import { computed, useId } from 'vue';
import type { entities } from 'misskey-js';
import MkA from '@/components/global/MkA.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { acct, userPage } from '@@/js/user.js';

type Order = entities.OrdersListResponse[number];
const props = defineProps<{
	order: Pick<Order, 'id' | 'name' | 'type' | 'quantity' | 'unit' | 'total' | 'deliveryText' | 'redemptionCode'> & Partial<Pick<Order, 'createdAt' | 'seller' | 'buyer' | 'feeRateBps' | 'platformFee' | 'sellerAmount'>>;
	embedded?: boolean;
	sales?: boolean;
}>();
const headingId = useId();
const counterparty = computed(() => props.sales ? props.order.buyer : props.order.seller);
</script>

<style lang="scss" module>
.order {
	min-width: 0;
	padding: var(--MI-cardPadding);
	border: var(--MI-divider);
	border-radius: var(--MI-cardRadius);
	background: var(--MI_THEME-panel);
	line-height: 1.6;
	overflow-wrap: anywhere;
}

.embedded {
	padding: var(--MI-margin) 0;
	border: 0;
	border-top: var(--MI-divider);
	border-radius: 0;
	background: none;

	.content { padding: 0; border-radius: 0; background: none; }
}

.heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 12px;

	h2, h3 { margin: 0; font-weight: 600; }
	h2 { font-size: 1.15em; }
	h3 { font-size: 1em; }
	time { color: var(--MI_THEME-fgTransparent); }
}

.facts {
	display: flex;
	flex-wrap: wrap;
	gap: 12px 24px;
	margin: 16px 0;

	dt { color: var(--MI_THEME-fgTransparent); }
	dd { margin: 2px 0 0; font-variant-numeric: tabular-nums; }
}

.account { margin-left: 6px; color: var(--MI_THEME-fgTransparent); font-size: .85em; }
.income { color: var(--MI_THEME-success); font-weight: 600; }
.codes { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; padding-top: 16px; border-top: var(--MI-divider); }
.codes h3, .codes p { margin: 0; }
.codes h3 { font-size: 1em; }
.codes p { color: var(--MI_THEME-fgTransparent); font-size: .85em; }
.code { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.code > code { font-size: 1.05em; letter-spacing: .05em; overflow-wrap: anywhere; }

.delivery {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-top: 16px;
	border-top: var(--MI-divider);

	p { margin: 0; }
}

.content {
	padding: 12px 16px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panelHighlight);
	white-space: pre-wrap;
}
</style>
