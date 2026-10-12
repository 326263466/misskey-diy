<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.detail">
	<section :class="$style.overview">
		<div :class="$style.columns">
			<div :class="$style.cover">
				<img v-if="product.imageUrl && !imageFailed" :src="product.imageUrl" :alt="product.name" referrerpolicy="no-referrer" @error="imageFailed = true">
				<i v-else :class="icon" aria-hidden="true"></i>
				<span :class="$style.typeBadge"><i :class="icon" aria-hidden="true"></i>{{ typeName }}</span>
			</div>
			<div :class="$style.info">
				<h1>{{ product.name }}</h1>
				<div :class="$style.seller">
					<MkAvatar v-if="product.seller" :user="product.seller" :class="$style.avatar"/>
					<i v-else class="ti ti-building-store" :class="$style.systemAvatar" aria-hidden="true"></i>
					<div :class="$style.sellerIdentity">
						<span :class="$style.label">{{ i18n.ts._marketplace.seller }}</span>
						<MkA v-if="product.seller" :to="userPage(product.seller)"><MkUserName :user="product.seller"/><small>@{{ acct(product.seller) }}</small></MkA>
						<strong v-else>{{ i18n.ts._marketplace.unavailableSeller }}</strong>
					</div>
				</div>
				<div :class="$style.chips">
					<span :class="$style.chip"><i :class="product.type === 'physical' ? 'ti ti-truck-delivery' : 'ti ti-bolt'" aria-hidden="true"></i>{{ deliveryText }}</span>
					<span :class="$style.chip"><i class="ti ti-package" aria-hidden="true"></i>{{ stockText }}</span>
					<span :class="$style.chip"><i class="ti ti-lock" aria-hidden="true"></i>{{ limitText }}</span>
					<span v-if="product.remainingAllowance != null" :class="$style.chip"><i class="ti ti-shopping-cart" aria-hidden="true"></i>{{ allowanceText }}</span>
				</div>
				<div :class="$style.buyBox">
					<div :class="$style.price">
						<strong>{{ product.price.toLocaleString() }}</strong><span>{{ i18n.ts._marketplace.pointUnit }} / {{ product.unit }}</span>
						<span v-if="quantity > 1" :class="$style.total">{{ i18n.tsx._marketplace.total({ amount: (product.price * quantity).toLocaleString() }) }} {{ i18n.ts._marketplace.pointUnit }}</span>
					</div>
					<div :class="$style.quantityRow">
						<span>{{ i18n.ts._marketplace.quantity }}</span>
						<div :class="$style.stepper">
							<button type="button" class="_button" :aria-label="i18n.ts._marketplace.decrease" :disabled="locked || quantity <= 1" @click="emit('quantityChange', quantity - 1)"><i class="ti ti-minus" aria-hidden="true"></i></button>
							<input :value="quantity" type="number" min="1" :max="Math.max(1, product.maxQuantity)" :disabled="locked" :aria-label="i18n.ts._marketplace.quantity" @change="emit('quantityChange', $event)">
							<button type="button" class="_button" :aria-label="i18n.ts._marketplace.increase" :disabled="locked || quantity >= product.maxQuantity" @click="emit('quantityChange', quantity + 1)"><i class="ti ti-plus" aria-hidden="true"></i></button>
						</div>
					</div>
					<MkButton primary full :disabled="!canPurchase" :wait="purchasing" @click="emit('purchase')">{{ purchaseLabel }}</MkButton>
				</div>
			</div>
		</div>
	</section>
	<MkContainer v-if="product.description" :class="$style.description">
		<template #icon><i class="ti ti-notes" aria-hidden="true"></i></template>
		<template #header>{{ i18n.ts._marketplace.productDescription }}</template>
		<p class="_selectable">{{ product.description }}</p>
	</MkContainer>
</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkContainer from '@/components/MkContainer.vue';
import MkA from '@/components/global/MkA.vue';
import { acct, userPage } from '@@/js/user.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	product: entities.ProductsListResponse['products'][number];
	quantity: number;
	purchasing: boolean;
	pending: boolean;
	canPurchase: boolean;
	purchaseLabel: string;
	typeName: string;
	icon: string;
}>();
const emit = defineEmits<{
	(ev: 'quantityChange', value: number | Event): void;
	(ev: 'purchase'): void;
}>();
const imageFailed = ref(false);
watch(() => props.product.imageUrl, () => { imageFailed.value = false; });
const locked = computed(() => props.purchasing || props.pending || props.product.isOwner || props.product.maxQuantity === 0);
const stockText = computed(() => props.product.remainingStock == null ? i18n.ts._marketplace.unlimitedStock : `${props.product.remainingStock.toLocaleString()} ${props.product.unit}`);
const limitText = computed(() => props.product.perUserLimit > 0 ? i18n.tsx._marketplace.cumulativeLimit({ count: props.product.perUserLimit.toLocaleString(), unit: props.product.unit }) : i18n.ts._marketplace.noPurchaseLimit);
const allowanceText = computed(() => props.product.remainingAllowance == null ? '' : `${props.product.remainingAllowance.toLocaleString()} ${props.product.unit}`);
const deliveryText = computed(() => props.product.type === 'physical' ? i18n.ts._marketplace.physicalDelivery : i18n.ts._marketplace.automaticDelivery);
</script>

<style lang="scss" module>
.detail { display: flex; flex-direction: column; gap: var(--MI-margin); container-type: inline-size; }

// 通栏封面 + 右侧信息栏的商品卡：封面占满左列，购买操作收进带边框的操作盒。
.overview { padding: 0; background: var(--MI_THEME-panel); border-radius: var(--MI-cardRadius); overflow: clip; }
.columns { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 4fr); align-items: stretch; }

.cover { position: relative; display: grid; place-items: center; min-height: 300px; background: linear-gradient(135deg, var(--MI_THEME-accentedBg), var(--MI_THEME-panelHighlight)); overflow: hidden; }
.cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cover > i { font-size: 76px; color: var(--MI_THEME-accent); opacity: .5; }

.info { min-width: 0; display: flex; flex-direction: column; gap: 14px; padding: var(--MI-cardPadding); }
.info h1 { margin: 0; font-size: 1.4em; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }

.typeBadge { position: absolute; inset-block-start: 12px; inset-inline-start: 12px; display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; font-size: .82em; font-weight: 600; color: var(--MI_THEME-fg); background: color-mix(in srgb, var(--MI_THEME-panel) 62%, transparent); border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent); backdrop-filter: blur(14px) saturate(1.4); -webkit-backdrop-filter: blur(14px) saturate(1.4); box-shadow: 0 2px 8px color-mix(in srgb, var(--MI_THEME-fg) 12%, transparent); }
.typeBadge > i { color: var(--MI_THEME-accent); }

.seller { display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: var(--MI-divider); }
.avatar, .systemAvatar { flex-shrink: 0; width: 36px; height: 36px; }
.systemAvatar { display: grid; place-items: center; font-size: 20px; color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); border-radius: 50%; }
.sellerIdentity { min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
.sellerIdentity a { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.sellerIdentity small, .label { color: var(--MI_THEME-fgTransparent); font-size: .85em; }

.buyBox { margin-top: auto; display: flex; flex-direction: column; gap: 14px; padding: 16px; border: var(--MI-divider); border-radius: var(--MI-radius); }
.price { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; color: var(--MI_THEME-accent); }
.price strong { font-size: 1.75em; font-weight: 700; font-variant-numeric: tabular-nums; }
.price > span { color: var(--MI_THEME-fgTransparent); font-size: .9em; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: calc(var(--MI-radius) / 3); font-size: .82em; color: var(--MI_THEME-fgTransparent); background: var(--MI_THEME-panelHighlight); }
.quantityRow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.stepper { display: flex; align-items: center; border: var(--MI-divider); border-radius: var(--MI-radius); overflow: hidden; }
.stepper > button { width: 38px; height: 38px; color: var(--MI_THEME-accent); }
.stepper > button:disabled { color: var(--MI_THEME-fgTransparentWeak); cursor: not-allowed; }
.stepper > input { box-sizing: border-box; width: 82px; height: 38px; border: 0; border-inline: var(--MI-divider); color: inherit; background: transparent; font: inherit; text-align: center; appearance: textfield; -moz-appearance: textfield; }
.stepper input::-webkit-outer-spin-button, .stepper input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.stepper > :focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
.total { margin-left: auto; color: var(--MI_THEME-fg); font-weight: 600; font-variant-numeric: tabular-nums; }

.description { --MI-containerHeaderBg: var(--MI_THEME-panel); border-radius: var(--MI-cardRadius); }
.description p { margin: 0; padding: 0 var(--MI-cardPadding) var(--MI-cardPadding); line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }

@container (max-width: 640px) {
	.columns { grid-template-columns: 1fr; }
	.cover { min-height: 0; aspect-ratio: 16 / 9; }
}
</style>
