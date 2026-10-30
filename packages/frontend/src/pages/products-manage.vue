<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<template #header-actions>
		<MkButton type="routerLink" to="/my/products/new" primary small :class="$style.publish" :aria-label="i18n.ts._marketplace.publishProduct"><i class="ti ti-plus" aria-hidden="true"></i> <span :class="$style.publishLabel">{{ i18n.ts._marketplace.publishProduct }}</span></MkButton>
		<MkButton small transparent iconOnly :disabled="loading" :wait="loading" :aria-label="i18n.ts.reload" @click="load"><i class="ti ti-refresh" aria-hidden="true"></i></MkButton>
	</template>
	<div class="_pageBody _gaps_m" :class="$style.root" :aria-busy="loading">
		<p v-if="loading && !products.length" role="status">{{ i18n.ts.loading }}</p>
		<div v-if="loadError" role="alert" class="_gaps_s"><p>{{ i18n.ts._marketplace.myProductsLoadFailed }}</p><MkButton small @click="load">{{ i18n.ts.retry }}</MkButton></div>
		<MkResult v-else-if="!loading && !products.length" type="empty" :text="i18n.ts._marketplace.myProductsEmpty"/>
		<ul v-if="products.length" :class="$style.products">
			<li v-for="product in products" :key="product.id" :class="$style.product">
				<div :class="$style.image"><img v-if="product.imageUrl && !failedImages[product.id]" :src="product.imageUrl" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failedImages[product.id] = true"><i v-else :class="product.type === 'physical' ? 'ti ti-package' : 'ti ti-gift'" aria-hidden="true"></i></div>
				<div :class="$style.summary">
					<MkA :to="`/my/products/${encodeURIComponent(product.id)}/edit`" :class="$style.name">{{ product.name }}</MkA>
					<div :class="$style.meta"><span :class="{ [$style.onSale]: product.enabled }">{{ product.enabled ? i18n.ts._marketplace.onSale : i18n.ts._marketplace.offSale }}</span><span>{{ product.price.toLocaleString() }} {{ i18n.ts._marketplace.pointUnit }}</span></div>
					<span :class="$style.limit">{{ product.perUserLimit > 0 ? i18n.tsx._marketplace.cumulativeLimit({ count: product.perUserLimit.toLocaleString() }) : i18n.ts._marketplace.noPurchaseLimit }}</span>
				</div>
				<MkA :to="`/my/products/${encodeURIComponent(product.id)}/edit`">{{ i18n.ts.edit }}</MkA>
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
import { usePageHistoryRestore } from '@/composables/use-page-history-restore.js';

ensureSignin();
const pageActive = inject(DI.pageActive, ref(true));
const historyRestoring = usePageHistoryRestore();
const products = ref<entities.ProductsMineResponse>([]);
const failedImages = ref<Record<string, boolean>>(Object.create(null));
const loading = ref(false);
const loadError = ref(false);
let active = true;
let generation = 0;

function load() { return loadProducts(false); }

async function loadProducts(preserveOrder: boolean) {
	if (!active || !pageActive.value) return;
	const request = ++generation;
	loading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('products/mine', { limit: 100 });
		if (active && request === generation) {
			if (preserveOrder) {
				const updates = new Map(result.map(product => [product.id, product]));
				const previousIds = new Set(products.value.map(product => product.id));
				products.value = [...products.value.flatMap(product => updates.get(product.id) ?? []), ...result.filter(product => !previousIds.has(product.id))];
			} else {
				products.value = result;
			}
		}
	} catch {
		if (active && request === generation) loadError.value = true;
	} finally {
		if (request === generation) loading.value = false;
	}
}

function invalidate() { generation++; loading.value = false; }

function deactivate() { active = false; invalidate(); }

function refreshOnActivation() {
	if (loading.value) return;
	void loadProducts(historyRestoring.value && products.value.length > 0);
}

watch(pageActive, value => { if (value) refreshOnActivation(); else invalidate(); });
onActivated(() => { const inactive = !active; active = true; if (inactive) refreshOnActivation(); });
onDeactivated(deactivate);
onBeforeUnmount(deactivate);
void load();
definePage(() => ({ title: i18n.ts._marketplace.myProducts, icon: 'ti ti-package' }));
</script>

<style lang="scss" module>
.root { container-type: inline-size; }
.publishLabel { @media (max-width: 500px) { display: none; } }
.publish { @media (max-width: 500px) { min-width: var(--MI-mobileTouchTarget); padding-inline: 0; } }
.products { margin: 0; padding: 0; list-style: none; }
.product { display: flex; align-items: center; gap: 12px; padding-block: 20px; border-top: var(--MI-divider); }
.product:first-child { padding-top: 0; border-top: 0; }
.product > a { flex-shrink: 0; }
.image { display: grid; place-items: center; flex-shrink: 0; width: 80px; height: 64px; border-radius: var(--MI-radius); overflow: hidden; background: var(--MI_THEME-panelHighlight); }
.image img { width: 100%; height: 100%; object-fit: cover; }
.image i { color: var(--MI_THEME-accent); font-size: 28px; }
.summary { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 6px; overflow-wrap: anywhere; }
.name { font-weight: 600; color: inherit; }
.meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; font-variant-numeric: tabular-nums; }
.meta, .limit { font-size: .85em; color: var(--MI_THEME-fgTransparent); }
.onSale { color: var(--MI_THEME-success); }
@container (max-width: 480px) { .product { flex-wrap: wrap; } .summary { flex-basis: calc(100% - 100px); } .product > a:first-of-type { margin-left: auto; } }
</style>
