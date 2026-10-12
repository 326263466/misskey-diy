<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard hideHeader>
	<div class="_pageBody _gaps_m" :class="$style.root" :aria-busy="loading || saving">
		<nav :class="$style.navigation" :aria-label="i18n.ts._marketplace.title"><MkA to="/my/products"><i class="ti ti-arrow-left" aria-hidden="true"></i> {{ i18n.ts._marketplace.myProducts }}</MkA><MkA to="/shop">{{ i18n.ts._marketplace.allProducts }}</MkA></nav>
		<h1 :class="$style.heading">{{ props.productId ? i18n.ts._marketplace.editProduct : i18n.ts._marketplace.publishProduct }}</h1>
		<p v-if="loading" role="status">{{ i18n.ts.loading }}</p>
		<div v-else-if="loadError" role="alert" class="_gaps_s"><p>{{ loadError }}</p><MkButton @click="load">{{ i18n.ts.retry }}</MkButton></div>
		<template v-else>
			<div v-if="pendingRequest && !saving" role="status" class="_gaps_s"><MkInfo>{{ i18n.ts._marketplace.publishPending }}</MkInfo><MkButton primary :disabled="saving || storageError" @click="retryPublish">{{ i18n.ts._marketplace.retryPublish }}</MkButton></div>
			<div v-if="storageError" role="alert" class="_gaps_s"><p>{{ i18n.ts._marketplace.publishStorageFailed }}</p><MkButton :disabled="saving" @click="restorePending">{{ i18n.ts.retry }}</MkButton></div>
			<div v-if="saveError" role="alert" class="_gaps_s"><p :class="$style.error">{{ saveError }}</p><MkButton v-if="conflict" :disabled="saving" @click="reloadProduct">{{ i18n.ts.reload }}</MkButton></div>
			<form class="_gaps_m" @submit.prevent="save">
				<MkInput v-model="draft.name" :maxLength="40" :disabled="locked"><template #label>{{ i18n.ts._marketplace.productName }}</template></MkInput>
				<div :class="$style.columns">
					<MkSelect v-model="draft.type" :items="productTypes" :disabled="locked"><template #label>{{ i18n.ts._marketplace.productType }}</template></MkSelect>
					<MkInput v-model="draft.category" :maxLength="20" :disabled="locked"><template #label>{{ i18n.ts._marketplace.categoryLabel }}</template></MkInput>
				</div>
				<MkTextarea v-model="draft.description" :maxLength="200" :rows="4" :disabled="locked"><template #label>{{ i18n.ts._marketplace.productDescription }}</template></MkTextarea>
				<MkInput v-model="draft.imageUrl" :maxLength="2048" :disabled="locked"><template #label>{{ i18n.ts._marketplace.coverUrl }}</template><template #caption>{{ i18n.ts._marketplace.coverHint }}</template></MkInput>
				<img v-if="draft.imageUrl && validImage(draft.imageUrl)" :src="draft.imageUrl" :alt="draft.name" :class="$style.cover" referrerpolicy="no-referrer">
				<div :class="$style.columns">
					<MkInput v-model="draft.price" type="number" :min="1" :max="1000000" :step="1" :disabled="locked"><template #label>{{ i18n.ts._marketplace.productPrice }} ({{ i18n.ts._marketplace.pointUnit }})</template></MkInput>
					<MkInput v-model="draft.unit" :maxLength="8" :disabled="locked"><template #label>{{ i18n.ts._marketplace.unitLabel }}</template></MkInput>
				</div>
				<MkInfo v-if="feeRateBps != null">{{ i18n.tsx._payments.sellerFeeHint({ rate: (feeRateBps / 100).toLocaleString() }) }}</MkInfo>
				<div v-else-if="feeLoadError" role="alert" class="_gaps_s"><p>{{ i18n.ts._payments.publicLoadFailed }}</p><MkButton :disabled="feeLoading" @click="loadFees">{{ i18n.ts.retry }}</MkButton></div>
				<p v-else role="status">{{ i18n.ts.loading }}</p>
				<div :class="$style.columns">
					<MkSelect v-model="limitMode" :items="limitOptions" :disabled="locked"><template #label>{{ i18n.ts._marketplace.purchaseLimit }}</template><template #caption>{{ i18n.ts._marketplace.limitHint }}</template></MkSelect>
					<MkInput v-if="limited" v-model="draft.perUserLimit" type="number" :min="1" :max="1000000" :step="1" :disabled="locked"><template #label>{{ i18n.ts._marketplace.perUserLimit }} ({{ draft.unit }})</template></MkInput>
				</div>
				<MkInput v-model="draft.stockLimit" type="number" :min="0" :max="1000000" :step="1" :disabled="locked"><template #label>{{ i18n.ts._marketplace.stockLimit }} ({{ draft.unit }})</template><template #caption>{{ i18n.ts._marketplace.stockHint }}</template></MkInput>
				<MkTextarea v-model="draft.deliveryText" :maxLength="2000" :rows="5" :disabled="locked"><template #label>{{ draft.type === 'physical' ? i18n.ts._marketplace.physicalDeliveryContent : i18n.ts._marketplace.deliveryContent }}</template><template #caption>{{ draft.type === 'physical' ? i18n.ts._marketplace.physicalDeliveryHint : i18n.ts._marketplace.deliveryHint }}</template></MkTextarea>
				<MkSelect v-model="saleStatus" :items="saleOptions" :disabled="locked"><template #label>{{ i18n.ts.state }}</template></MkSelect>
				<div class="_buttons" :class="$style.actions"><MkButton primary type="submit" :disabled="locked || !valid || conflict || feeRateBps == null" :wait="saving"><i class="ti ti-check" aria-hidden="true"></i> {{ props.productId ? i18n.ts.save : i18n.ts._marketplace.publishProduct }}</MkButton><MkA to="/my/products">{{ i18n.ts.cancel }}</MkA></div>
			</form>
		</template>
	</div>
</PageWithHeader>
</template>

<script setup lang="ts">
import { computed, inject, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkA from '@/components/global/MkA.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { miLocalStorage } from '@/local-storage.js';
import { useRouter } from '@/router.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';

type Draft = {
	name: string; description: string; type: 'physical' | 'virtual'; category: string; imageUrl: string; unit: string;
	price: number; perUserLimit: number; stockLimit: number; deliveryText: string; enabled: boolean;
};
const props = defineProps<{ productId?: string }>();
const account = ensureSignin();
const router = useRouter();
const pageActive = inject(DI.pageActive, ref(true));
const storageKey = `product-publish:${account.id}` as const;
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const saveError = ref('');
const storageError = ref(false);
const conflict = ref(false);
const limited = ref(false);
const feeRateBps = ref<number | null>(null);
const feeLoading = ref(false);
const feeLoadError = ref(false);
const version = ref('');
const pendingRequest = ref<entities.ProductsCreateRequest | null>(null);
const draft = ref<Draft>({ name: '', description: '', type: 'virtual', category: '', imageUrl: '', unit: i18n.ts._marketplace.defaultUnit, price: 1, perUserLimit: 1, stockLimit: 0, deliveryText: '', enabled: true });
const locked = computed(() => saving.value || loading.value || storageError.value || pendingRequest.value != null);
const limitMode = computed({ get: () => limited.value ? 'limited' : 'unlimited', set: value => { limited.value = value === 'limited'; } });
const saleStatus = computed({ get: () => draft.value.enabled ? 'onSale' : 'offSale', set: value => { draft.value.enabled = value === 'onSale'; } });
const productTypes = [{ value: 'physical' as const, label: i18n.ts._marketplace.physicalType }, { value: 'virtual' as const, label: i18n.ts._marketplace.virtualType }];
const limitOptions = [{ value: 'unlimited', label: i18n.ts._marketplace.noPurchaseLimit }, { value: 'limited', label: i18n.ts._marketplace.withPurchaseLimit }];
const saleOptions = [{ value: 'onSale', label: i18n.ts._marketplace.onSale }, { value: 'offSale', label: i18n.ts._marketplace.offSale }];
let disposed = false;
let active = true;

async function loadFees() {
	if (feeLoading.value) return;
	feeLoading.value = true;
	feeLoadError.value = false;
	try {
		const settings = await misskeyApi('payments/settings');
		if (!disposed) feeRateBps.value = settings.feeRateBps;
	} catch { if (!disposed) feeLoadError.value = true; } finally { feeLoading.value = false; }
}

function validImage(url: string) {
	if (!url) return true;
	try { return ['https:', 'http:'].includes(new URL(url).protocol) && !/\s/.test(url); } catch { return false; }
}

function validDraft(value: Draft) {
	const text = (input: string, max: number, required = false) => typeof input === 'string' && Array.from(input).length <= max && !input.includes('\u0000') && (!required || input.trim().length > 0);
	const integer = (input: number, min: number) => Number.isSafeInteger(input) && input >= min && input <= 1000000;
	return text(value.name, 40, true) && text(value.description, 200) && text(value.category, 20) && text(value.unit, 8, true) &&
		text(value.imageUrl, 2048) && validImage(value.imageUrl) && ['physical', 'virtual'].includes(value.type) &&
		integer(value.price, 1) && integer(value.perUserLimit, 0) && integer(value.stockLimit, 0) &&
		typeof value.enabled === 'boolean' && text(value.deliveryText, 2000, value.enabled);
}

function fields(value: Draft): Draft {
	return { name: value.name.trim(), description: value.description.trim(), type: value.type, category: value.category.trim(), imageUrl: value.imageUrl.trim().replace(/^https?:/i, scheme => scheme.toLowerCase()), unit: value.unit.trim(), price: value.price, perUserLimit: value.perUserLimit, stockLimit: value.stockLimit, deliveryText: value.deliveryText.trim(), enabled: value.enabled };
}

const valid = computed(() => validDraft({ ...draft.value, perUserLimit: limited.value ? draft.value.perUserLimit : 0 }) && (!limited.value || draft.value.perUserLimit > 0));

function applyDraft(value: Draft) {
	draft.value = fields(value);
	limited.value = value.perUserLimit > 0;
	if (!limited.value) draft.value.perUserLimit = 1;
}

function readPending(): entities.ProductsCreateRequest | null {
	const raw = miLocalStorage.getItem(storageKey);
	if (raw == null) return null;
	const value = JSON.parse(raw) as entities.ProductsCreateRequest;
	if (!value || typeof value.requestId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.requestId) || !validDraft(value as Draft)) throw new Error('Invalid pending product');
	return { ...fields(value as Draft), requestId: value.requestId };
}

function restorePending() {
	if (props.productId) return;
	try {
		pendingRequest.value = readPending();
		if (pendingRequest.value) applyDraft(pendingRequest.value as Draft);
		storageError.value = false;
	} catch { storageError.value = true; }
}

function clearPending(requestId: string) {
	try {
		if (readPending()?.requestId === requestId) miLocalStorage.removeItem(storageKey);
		pendingRequest.value = readPending();
	} catch { storageError.value = true; }
}

async function load() {
	if (!active || !pageActive.value || !props.productId || loading.value || saving.value) return;
	loading.value = true;
	loadError.value = '';
	try {
		const product = await misskeyApi('products/show', { productId: props.productId });
		if (disposed || !active || !pageActive.value) return;
		if (!product.isOwner || product.deliveryText == null) { loadError.value = i18n.ts._marketplace.productNotEditable; return; }
		applyDraft({ ...product, deliveryText: product.deliveryText });
		version.value = product.version;
		conflict.value = false;
		saveError.value = '';
	} catch (error) {
		if (!disposed && active && pageActive.value) loadError.value = (error as { code?: string }).code === 'NO_SUCH_MARKETPLACE_PRODUCT' ? i18n.ts._marketplace.productNotEditable : i18n.ts._marketplace.myProductsLoadFailed;
	} finally { loading.value = false; }
}

async function reloadProduct() {
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._marketplace.reloadProductConfirm });
	if (!canceled) await load();
}

function errorMessage(error: unknown) {
	const code = (error as { code?: string } | null)?.code;
	if (code === 'MARKETPLACE_PRODUCT_CHANGED') { conflict.value = true; return i18n.ts._marketplace.productChanged; }
	if (code === 'NO_SUCH_MARKETPLACE_PRODUCT') return i18n.ts._marketplace.productNotEditable;
	if (code === 'INVALID_MARKETPLACE_PRODUCT' || code === 'INVALID_PARAM') return i18n.ts._marketplace.invalidSettings;
	if (code === 'MARKETPLACE_REQUEST_CONFLICT') return i18n.ts._marketplace.requestConflict;
	if (code === 'MARKETPLACE_PRODUCT_LIMIT') return i18n.ts._marketplace.productLimit;
	return i18n.ts._marketplace.productSaveFailed;
}

async function publish(request: entities.ProductsCreateRequest, retrying = false) {
	try {
		const product = await misskeyApi('products/create', { ...request });
		if (disposed || !active || !pageActive.value) return;
		clearPending(request.requestId);
		os.toast(i18n.ts._marketplace.publishSuccess, 'success');
		router.replace('/my/products/:productId/edit', { params: { productId: product.id } });
	} catch (error) {
		if (disposed || !active || !pageActive.value) return;
		const code = (error as { code?: string }).code ?? '';
		if (['INVALID_MARKETPLACE_PRODUCT', 'MARKETPLACE_PRODUCT_LIMIT'].includes(code) || (!retrying && ['INVALID_PARAM', 'MARKETPLACE_NOT_ALLOWED', 'RATE_LIMIT_EXCEEDED'].includes(code))) clearPending(request.requestId);
		if (!disposed) saveError.value = errorMessage(error);
	}
}

async function retryPublish() {
	if (!active || !pageActive.value || saving.value || storageError.value || !pendingRequest.value) return;
	if (!navigator.locks) { saveError.value = i18n.ts._marketplace.securePurchaseUnavailable; return; }
	saving.value = true;
	saveError.value = '';
	try {
		await navigator.locks.request(storageKey, async () => {
			if (disposed || !active || !pageActive.value) return;
			restorePending();
			if (!disposed && !storageError.value && pendingRequest.value) await publish(pendingRequest.value, true);
		});
	} catch (error) { saveError.value = errorMessage(error); } finally { saving.value = false; }
}

async function save() {
	if (!active || !pageActive.value || locked.value || !valid.value || conflict.value || feeRateBps.value == null) return;
	const value = fields({ ...draft.value, perUserLimit: limited.value ? draft.value.perUserLimit : 0 });
	saving.value = true;
	saveError.value = '';
	try {
		if (props.productId) {
			const product = await misskeyApi('products/update', { ...value, productId: props.productId, expectedVersion: version.value });
			if (disposed) return;
			version.value = product.version;
			applyDraft({ ...product, deliveryText: product.deliveryText ?? '' });
			if (active && pageActive.value) os.toast(i18n.ts.saved, 'success');
		} else {
			if (!navigator.locks || !crypto.randomUUID) { saveError.value = i18n.ts._marketplace.securePurchaseUnavailable; return; }
			await navigator.locks.request(storageKey, async () => {
				if (disposed || !active || !pageActive.value) return;
				restorePending();
				if (storageError.value || pendingRequest.value) return;
				const request = { ...value, requestId: crypto.randomUUID() };
				// 保留原始请求，断网或刷新后重试同一个发布操作。
				try { miLocalStorage.setItem(storageKey, JSON.stringify(request)); } catch { storageError.value = true; return; }
				pendingRequest.value = request;
				await publish(request);
			});
		}
	} catch (error) { saveError.value = errorMessage(error); } finally { saving.value = false; }
}

restorePending();
void load();
void loadFees();

function resume() { if (!props.productId) restorePending(); else if (!version.value) void load(); }

watch(pageActive, value => { if (value && active) resume(); });
onActivated(() => { const inactive = !active; active = true; if (inactive) resume(); });
onDeactivated(() => { active = false; });
onBeforeUnmount(() => { disposed = true; active = false; });
definePage(() => ({ title: props.productId ? i18n.ts._marketplace.editProduct : i18n.ts._marketplace.publishProduct, icon: 'ti ti-package' }));
</script>

<style lang="scss" module>
.root { container-type: inline-size; }
.navigation { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding-bottom: 16px; border-bottom: var(--MI-divider); }
.navigation a { padding-block: 6px; }
.heading { margin: 0; font-size: 1.35em; }
.columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
.cover { width: 200px; max-width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: var(--MI-radius); }
.actions { align-items: center; padding-top: 20px; border-top: var(--MI-divider); }
.error { color: var(--MI_THEME-error); margin: 0; }
@container (max-width: 520px) { .columns { grid-template-columns: 1fr; } }
</style>
