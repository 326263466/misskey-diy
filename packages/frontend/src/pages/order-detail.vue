<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader class="_standalonePage" contentCard hideHeader>
	<div class="_pageBody _gaps_m" :aria-busy="loading">
		<nav :class="$style.navigation" :aria-label="i18n.ts._marketplace.title"><MkA to="/orders"><i class="ti ti-arrow-left" aria-hidden="true"></i> {{ i18n.ts._marketplace.orders }}</MkA><MkA to="/orders?mode=sales">{{ i18n.ts._marketplace.sales }}</MkA></nav>
		<h1 :class="$style.heading">{{ i18n.ts._marketplace.orderDetails }}</h1>
		<p v-if="loading" role="status">{{ i18n.ts.loading }}</p>
		<div v-else-if="loadError" role="alert" class="_gaps_s"><p>{{ i18n.ts._marketplace.orderLoadFailed }}</p><MkButton @click="load">{{ i18n.ts.retry }}</MkButton></div>
		<XOrder v-else-if="order" :order="order" :sales="order.seller?.id === account.id" embedded/>
	</div>
</PageWithHeader>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import type { entities } from 'misskey-js';
import XOrder from './order.vue';
import MkA from '@/components/global/MkA.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{ orderId: string }>();
const account = ensureSignin();
const order = ref<entities.OrdersShowResponse | null>(null);
const loading = ref(false);
const loadError = ref(false);
let disposed = false;

async function load() {
	if (loading.value) return;
	loading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('orders/show', { orderId: props.orderId });
		if (!disposed) order.value = result;
	} catch {
		if (!disposed) loadError.value = true;
	} finally { loading.value = false; }
}

void load();
onBeforeUnmount(() => { disposed = true; });
definePage(() => ({ title: i18n.ts._marketplace.orderDetails, icon: 'ti ti-receipt' }));
</script>

<style lang="scss" module>
.navigation { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.heading { margin: 0; font-size: 1.35em; }
</style>
