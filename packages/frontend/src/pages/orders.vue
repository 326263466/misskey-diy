<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<template #header-actions><MkButton small :disabled="loading" :wait="loading" @click="load()">{{ i18n.ts.reload }}</MkButton></template>
	<div class="_pageBody _gaps" :class="$style.section" :aria-busy="loading">
		<MkLoading v-if="loading && !orders.length"/>
		<div v-if="loadError" role="alert" class="_gaps_s"><p>{{ i18n.ts._marketplace.orderLoadFailed }}</p><MkButton small :disabled="loading" @click="list.retry">{{ i18n.ts.retry }}</MkButton></div>
		<MkResult v-else-if="!loading && !orders.length" type="empty" :text="props.mode === 'sales' ? i18n.ts._marketplace.noSales : i18n.ts._marketplace.noOrders"/>
		<XOrder v-for="order in orders" :key="order.id" :order="order" :sales="props.mode === 'sales'" embedded/>
		<MkLoading v-if="loading && orders.length"/>
		<div v-if="canLoad && hasMore && !loading && !loadError" v-appear="list.loadMore" :class="$style.sentinel" aria-hidden="true"></div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import XOrder from './order.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { DI } from '@/di.js';
import { useInfiniteList } from '@/composables/use-infinite-list.js';
import { usePageHistoryRestore } from '@/composables/use-page-history-restore.js';
import { appearDirective as vAppear } from '@/directives/appear.js';
ensureSignin();
const props = withDefaults(defineProps<{ mode?: 'purchases' | 'sales' }>(), { mode: 'purchases' });
const title = computed(() => props.mode === 'sales' ? i18n.ts._marketplace.sales : i18n.ts._myCenter.purchases);
const pageSize = 20;
const pageActive = inject(DI.pageActive, ref(true));
const historyRestoring = usePageHistoryRestore();
const list = useInfiniteList<entities.OrdersListResponse[number]>(async (cursor, signal) => {
	const rows = await misskeyApi('orders/list', { limit: pageSize + 1, ...(props.mode === 'sales' ? { mode: 'sales' as const } : {}), ...(cursor ? { untilId: cursor } : {}) }, undefined, signal);
	const items = rows.slice(0, pageSize);
	return { items, next: rows.length > pageSize ? items.at(-1)!.id : null };
});

const { items: orders, loading, error: loadError, hasMore, canLoad } = list;
let active = true;

function load() { return list.refresh(); }

function reset() { void list.reset(); }

function invalidate() { list.invalidate(); }

function deactivate() { active = false; invalidate(); }

const refresh = () => { void load(); };

function refreshOnActivation() {
	if (loading.value) return;
	if (historyRestoring.value && orders.value.length > 0) {
		if (loadError.value) void list.retry();
		return;
	}
	refresh();
}

onMounted(() => {
	window.addEventListener('focus', refresh);
	window.addEventListener('online', refresh);
});
onActivated(() => { const wasInactive = !active; active = true; if (wasInactive) refreshOnActivation(); });
onDeactivated(deactivate);
watch(pageActive, value => { if (value) refreshOnActivation(); });
watch(() => props.mode, reset);
onBeforeUnmount(() => {
	deactivate();
	window.removeEventListener('focus', refresh);
	window.removeEventListener('online', refresh);
});
void load();
definePage(() => ({ title: title.value, icon: 'ti ti-receipt' }));
</script>

<style lang="scss" module>
.section { min-width: 0; }
.section p { margin: 0; }
.sentinel { height: 1px; }
</style>
