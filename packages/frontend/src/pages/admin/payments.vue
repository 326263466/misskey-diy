<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<div class="_pageBody _gaps_m" :aria-busy="loading || saving">
		<p v-if="loading" role="status">{{ i18n.ts.loading }}</p>
		<div v-else-if="loadError" role="alert" class="_gaps_s"><p>{{ i18n.ts._payments.loadFailed }}</p><MkButton @click="load">{{ i18n.ts.retry }}</MkButton></div>
		<form v-else class="_gaps_m" @submit.prevent="save">
			<MkKeyValue><template #key>{{ i18n.ts._payments.platformBalance }}</template><template #value>{{ platformBalance.toLocaleString() }} {{ i18n.ts._marketplace.pointUnit }}</template></MkKeyValue>
			<MkInput v-model="percentage" type="number" :min="0" :max="100" :step="0.01" :disabled="saving"><template #label>{{ i18n.ts._payments.feeRate }}</template><template #suffix>%</template><template #caption>{{ i18n.ts._payments.feeRateHint }}</template></MkInput>
			<p v-if="!valid" role="alert" :class="$style.error">{{ i18n.ts._payments.invalidRate }}</p>
			<p v-if="saveError" role="alert" :class="$style.error">{{ saveError }}</p>
			<div class="_buttons"><MkButton type="submit" primary :disabled="saving || !valid || !modified" :wait="saving">{{ i18n.ts.save }}</MkButton><MkButton :disabled="saving || !modified" @click="discard">{{ i18n.ts.cancel }}</MkButton></div>
		</form>
	</div>
</PageWithHeader>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

const loading = ref(false);
const saving = ref(false);
const loadError = ref(false);
const saveError = ref('');
const percentage = ref(15);
const savedRate = ref(1500);
const platformBalance = ref(0);
let disposed = false;
const valid = computed(() => Number.isFinite(percentage.value) && percentage.value >= 0 && percentage.value <= 100 && Math.abs(percentage.value * 100 - Math.round(percentage.value * 100)) < 0.00001);
const modified = computed(() => Math.round(percentage.value * 100) !== savedRate.value);

function apply(settings: entities.AdminPaymentsSettingsResponse) {
	savedRate.value = settings.feeRateBps;
	percentage.value = settings.feeRateBps / 100;
	platformBalance.value = settings.platformBalance;
}

async function load() {
	if (loading.value || saving.value) return;
	loading.value = true;
	loadError.value = false;
	try {
		const settings = await misskeyApi('admin/payments/settings');
		if (!disposed) apply(settings);
	} catch { if (!disposed) loadError.value = true; } finally { loading.value = false; }
}

function discard() { percentage.value = savedRate.value / 100; saveError.value = ''; }

async function save() {
	if (loading.value || saving.value || !valid.value || !modified.value) return;
	saving.value = true;
	saveError.value = '';
	try {
		const settings = await misskeyApi('admin/payments/update-settings', { feeRateBps: Math.round(percentage.value * 100) });
		if (disposed) return;
		apply(settings);
		os.toast(i18n.ts.saved, 'success');
	} catch (error) {
		if (!disposed) saveError.value = (error as { code?: string }).code === 'INVALID_PAYMENT_SETTINGS' ? i18n.ts._payments.invalidRate : i18n.ts._payments.saveFailed;
	} finally { saving.value = false; }
}

void load();
onBeforeUnmount(() => { disposed = true; });
definePage(() => ({ title: i18n.ts._payments.title, icon: 'ti ti-percentage' }));
</script>

<style lang="scss" module>
.error { color: var(--MI_THEME-error); margin: 0; }
</style>
