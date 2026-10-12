<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard hideHeader>
	<div class="_pageBody _gaps" :class="$style.section" :aria-busy="loading">
		<nav :class="$style.navigation" :aria-label="i18n.ts._marketplace.title"><MkA :to="props.mode === 'sales' ? '/my/orders' : '/my/sales'">{{ props.mode === 'sales' ? i18n.ts._marketplace.orders : i18n.ts._marketplace.sales }}</MkA></nav>
		<div :class="$style.heading"><h1>{{ props.mode === 'sales' ? i18n.ts._marketplace.sales : i18n.ts._marketplace.orders }}</h1><MkButton small :disabled="loading" :wait="loading" @click="load()">{{ i18n.ts.reload }}</MkButton></div>
		<p v-if="loading && !orders.length">{{ i18n.ts.loading }}</p>
		<div v-if="loadError" role="alert" class="_gaps_s"><p>{{ i18n.ts._marketplace.orderLoadFailed }}</p><MkButton small :disabled="loading" @click="load(appendFailed)">{{ i18n.ts.retry }}</MkButton></div>
		<p v-else-if="!loading && !orders.length">{{ props.mode === 'sales' ? i18n.ts._marketplace.noSales : i18n.ts._marketplace.noOrders }}</p>
		<XOrder v-for="order in orders" :key="order.id" :order="order" :sales="props.mode === 'sales'" embedded/>
		<MkButton v-if="hasMore && !loadError" :disabled="loading" @click="load(true)">{{ i18n.ts.loadMore }}</MkButton>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { inject, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import XOrder from './order.vue';
import MkA from '@/components/global/MkA.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { DI } from '@/di.js';
ensureSignin();
const props = withDefaults(defineProps<{ mode?: 'purchases' | 'sales' }>(), { mode: 'purchases' });
const orders = ref<entities.OrdersListResponse>([]);
const loading = ref(false);
const loadError = ref(false);
const hasMore = ref(false);
const pageActive = inject(DI.pageActive, ref(true));
let active = true;
let generation = 0;
let appendFailed = false;

async function load(append = false) {
	if (!active || !pageActive.value || (append && loading.value)) return;
	const request = ++generation;
	loading.value = true;
	loadError.value = false;
	appendFailed = append;
	try {
		const rows = await misskeyApi('orders/list', { limit: 21, ...(props.mode === 'sales' ? { mode: 'sales' as const } : {}), ...(append ? { untilId: orders.value.at(-1)?.id } : {}) });
		if (!active || request !== generation) return;
		orders.value = append ? [...orders.value, ...rows.slice(0, 20)] : rows.slice(0, 20);
		hasMore.value = rows.length > 20;
	} catch {
		if (active && request === generation) loadError.value = true;
	} finally {
		if (request === generation) loading.value = false;
	}
}

function invalidate() { generation++; loading.value = false; }

function deactivate() { active = false; invalidate(); }

const refresh = () => { void load(); };
onMounted(() => {
	window.addEventListener('focus', refresh);
	window.addEventListener('online', refresh);
});
onActivated(() => { const wasInactive = !active; active = true; if (wasInactive) refresh(); });
onDeactivated(deactivate);
watch(pageActive, value => { if (value) refresh(); else invalidate(); });
watch(() => props.mode, () => { orders.value = []; hasMore.value = false; refresh(); });
onBeforeUnmount(() => {
	deactivate();
	window.removeEventListener('focus', refresh);
	window.removeEventListener('online', refresh);
});
void load();
definePage(() => ({ title: props.mode === 'sales' ? i18n.ts._marketplace.sales : i18n.ts._marketplace.orders, icon: 'ti ti-receipt' }));
</script>

<style lang="scss" module>
.section { min-width: 0; }
.section h1, .section p { margin: 0; }
.section h1 { font-size: 1.35em; }
.navigation { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.heading { display: flex; align-items: center; justify-content: space-between; gap: var(--MI-margin); flex-wrap: wrap; }
</style>
