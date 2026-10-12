<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader class="_standalonePage" contentCard hideHeader>
	<div class="_pageBody _gaps_m" :class="$style.root" :aria-busy="loading">
		<nav :class="$style.navigation" :aria-label="i18n.ts._marketplace.title">
			<MkA :to="userPage(account, 'management')"><i class="ti ti-arrow-left" aria-hidden="true"></i> {{ i18n.ts._management.title }}</MkA>
			<MkA to="/products/new" :class="$style.publish"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts._marketplace.publishProduct }}</MkA>
		</nav>
		<div :class="$style.heading"><h1>{{ i18n.ts._marketplace.myProducts }}</h1><MkButton small :disabled="loading" :wait="loading" @click="load">{{ i18n.ts.reload }}</MkButton></div>
		<p v-if="loading && !products.length" role="status">{{ i18n.ts.loading }}</p>
		<div v-if="loadError" role="alert" class="_gaps_s"><p>{{ i18n.ts._marketplace.myProductsLoadFailed }}</p><MkButton small @click="load">{{ i18n.ts.retry }}</MkButton></div>
		<p v-else-if="!loading && !products.length">{{ i18n.ts._marketplace.myProductsEmpty }}</p>
		<ul v-else :class="$style.products">
			<li v-for="product in products" :key="product.id" :class="$style.product">
				<div :class="$style.image"><img v-if="product.imageUrl && !failedImages[product.id]" :src="product.imageUrl" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failedImages[product.id] = true"><i v-else :class="product.type === 'physical' ? 'ti ti-package' : 'ti ti-gift'" aria-hidden="true"></i></div>
				<div :class="$style.summary">
					<MkA :to="`/products/${encodeURIComponent(product.id)}/edit`" :class="$style.name">{{ product.name }}</MkA>
					<div :class="$style.meta"><span :class="{ [$style.onSale]: product.enabled }">{{ product.enabled ? i18n.ts._marketplace.onSale : i18n.ts._marketplace.offSale }}</span><span>{{ product.price.toLocaleString() }} {{ i18n.ts._marketplace.pointUnit }} / {{ product.unit }}</span></div>
					<span :class="$style.limit">{{ product.perUserLimit > 0 ? i18n.tsx._marketplace.cumulativeLimit({ count: product.perUserLimit.toLocaleString(), unit: product.unit }) : i18n.ts._marketplace.noPurchaseLimit }}</span>
				</div>
				<MkA :to="`/products/${encodeURIComponent(product.id)}/edit`">{{ i18n.ts.edit }}</MkA>
				<MkA :to="`/products/${encodeURIComponent(product.id)}`">{{ i18n.ts.details }}</MkA>
			</li>
		</ul>
	</div>
</PageWithHeader>
</template>

<script setup lang="ts">
import { inject, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkA from '@/components/global/MkA.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { DI } from '@/di.js';
import { userPage } from '@@/js/user.js';

const account = ensureSignin();
const pageActive = inject(DI.pageActive, ref(true));
const products = ref<entities.ProductsMineResponse>([]);
const failedImages = ref<Record<string, boolean>>(Object.create(null));
const loading = ref(false);
const loadError = ref(false);
let active = true;
let generation = 0;

async function load() {
	if (!active || !pageActive.value) return;
	const request = ++generation;
	loading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('products/mine', { limit: 100 });
		if (active && request === generation) products.value = result;
	} catch {
		if (active && request === generation) loadError.value = true;
	} finally {
		if (request === generation) loading.value = false;
	}
}

function invalidate() { generation++; loading.value = false; }

function deactivate() { active = false; invalidate(); }

watch(pageActive, value => { if (value) void load(); else invalidate(); });
onActivated(() => { const inactive = !active; active = true; if (inactive) void load(); });
onDeactivated(deactivate);
onBeforeUnmount(deactivate);
void load();
definePage(() => ({ title: i18n.ts._marketplace.myProducts, icon: 'ti ti-package' }));
</script>

<style lang="scss" module>
.root { container-type: inline-size; }
.navigation, .heading { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; }
.navigation { padding-bottom: 16px; border-bottom: var(--MI-divider); }
.navigation a { padding-block: 6px; }
.publish { margin-left: auto; color: var(--MI_THEME-accent); font-weight: 600; }
.heading { justify-content: space-between; }
.heading h1 { margin: 0; font-size: 1.35em; }
.products { margin: 0; padding: 0; list-style: none; }
.product { display: flex; align-items: center; gap: 12px; padding-block: 20px; border-top: var(--MI-divider); }
.product:first-child { padding-top: 0; border-top: 0; }
.product > a { flex-shrink: 0; }
.image { display: grid; place-items: center; flex-shrink: 0; width: 80px; height: 64px; border-radius: var(--MI-radius); overflow: hidden; background: var(--MI_THEME-panelHighlight); }
.image img { width: 100%; height: 100%; object-fit: cover; }
.image i { color: var(--MI_THEME-accent); font-size: 28px; }
.summary { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 6px; overflow-wrap: anywhere; }
.name { font-weight: 600; color: inherit; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 12px; font-variant-numeric: tabular-nums; }
.meta, .limit { font-size: .85em; color: var(--MI_THEME-fgTransparent); }
.onSale { color: var(--MI_THEME-success); }
@container (max-width: 480px) { .product { flex-wrap: wrap; } .summary { flex-basis: calc(100% - 100px); } .product > a:first-of-type { margin-left: auto; } }
</style>
