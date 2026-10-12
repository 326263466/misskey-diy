<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader class="_standalonePage" hideHeader>
	<div class="_pageBody" :class="[$style.root, { [$style.still]: !prefer.s.animation }]">
		<div v-if="pendingPurchase" :class="[$style.feedback, $style.pending]">
			<div role="status" :class="$style.pendingText">
				<p>{{ i18n.ts._marketplace.pendingResult }}</p>
				<p>{{ i18n.tsx._marketplace.pendingSummary({ name: pendingPurchase.name, quantity: pendingPurchase.request.quantity, unit: pendingPurchase.unit, amount: (pendingPurchase.request.expectedPrice * pendingPurchase.request.quantity).toLocaleString() }) }}</p>
			</div>
			<MkButton :disabled="purchasing" :wait="purchasing" @click="retryPurchase">{{ i18n.ts._marketplace.retryPurchase }}</MkButton>
		</div>
		<div v-if="receipt" ref="receiptEl" :class="$style.receipt" tabindex="-1">
			<p role="status" :class="[$style.feedback, $style.notice]"><i class="ti ti-circle-check" aria-hidden="true"></i> {{ i18n.ts._marketplace.redeemSuccess }}</p>
			<XOrder :order="receipt"/>
		</div>
		<p v-if="purchaseError" role="alert" :class="[$style.feedback, $style.error]"><i class="ti ti-alert-triangle" aria-hidden="true"></i> {{ purchaseError }}</p>
		<div v-if="storageError" role="alert" :class="[$style.feedback, $style.error]">
			<span>{{ i18n.ts._marketplace.requestStorageFailed }}</span>
			<MkButton :disabled="purchasing" @click="restorePending">{{ i18n.ts.retry }}</MkButton>
		</div>

		<section v-if="props.productId" :aria-busy="loading || purchasing">
			<div v-if="loading && !currentProduct" :class="$style.stateCard" role="status">{{ i18n.ts.loading }}</div>
			<div v-else-if="loadError" role="alert" :class="$style.stateCard"><MkInfo warn>{{ i18n.ts._marketplace.loadFailed }}</MkInfo><MkButton small @click="load">{{ i18n.ts.retry }}</MkButton></div>
			<XProductDetail
				v-else-if="currentProduct"
				:product="currentProduct"
				:quantity="getQuantity(currentProduct)"
				:purchasing="purchasing"
				:pending="!!pendingPurchase"
				:canPurchase="canPurchase(currentProduct)"
				:purchaseLabel="purchaseLabel(currentProduct)"
				:typeName="typeName(currentProduct)"
				:icon="icon(currentProduct)"
				@quantityChange="setQuantity(currentProduct, $event)"
				@purchase="purchase(currentProduct)"
			/>
			<div v-else :class="$style.stateCard"><MkInfo warn>{{ i18n.ts._marketplace.unavailable }}</MkInfo><MkA to="/shop">{{ i18n.ts._marketplace.allProducts }}</MkA></div>
		</section>

		<section v-else :aria-busy="loading || purchasing">
			<h1 :class="$style.srOnly">{{ i18n.ts._marketplace.title }}</h1>
			<div :class="$style.toolbar" role="search" :aria-label="i18n.ts._marketplace.search">
				<div :class="$style.searchRow">
					<div :class="$style.searchBox">
						<i class="ti ti-search" aria-hidden="true"></i>
						<input v-model="query" type="search" enterkeyhint="search" :placeholder="i18n.ts._marketplace.search" :aria-label="i18n.ts._marketplace.search">
						<button v-if="query !== ''" v-tooltip="i18n.ts.clear" type="button" class="_button" :class="$style.clearButton" :aria-label="i18n.ts.clear" @click="query = ''"><i class="ti ti-x" aria-hidden="true"></i></button>
					</div>
					<button type="button" class="_button" :class="$style.sortButton" :aria-label="`${i18n.ts.sort}: ${sortLabel}`" aria-haspopup="menu" @click="openSortMenu">
						<i class="ti ti-arrows-sort" aria-hidden="true"></i>
						<span>{{ sortLabel }}</span>
						<i class="ti ti-chevron-down" aria-hidden="true"></i>
					</button>
				</div>
				<div :class="$style.facets">
					<div :class="$style.segmented" role="group" :aria-label="i18n.ts._marketplace.productType">
						<button v-for="option in typeOptions" :key="option.value" type="button" class="_button" :class="[$style.segment, { [$style.active]: productType === option.value }]" :aria-pressed="productType === option.value" @click="productType = option.value">{{ option.label }}</button>
					</div>
					<div v-if="categories.length > 0" :class="$style.chips" role="group" :aria-label="i18n.ts._marketplace.categoryLabel">
						<button v-for="value in categories" :key="value" type="button" class="_button" :class="[$style.chip, { [$style.active]: category === value }]" :aria-pressed="category === value" @click="category = category === value ? null : value">{{ value }}</button>
					</div>
				</div>
			</div>

			<div v-if="loading && !products.length" role="status" :aria-label="i18n.ts.loading" :class="$style.productGrid"><div v-for="index in 6" :key="index" :class="$style.skeleton" aria-hidden="true"></div></div>
			<div v-else-if="loadError" role="alert" :class="$style.stateCard"><i class="ti ti-cloud-off" aria-hidden="true"></i><h2>{{ i18n.ts._marketplace.loadFailed }}</h2><MkButton small @click="load">{{ i18n.ts.retry }}</MkButton></div>
			<div v-else-if="!products.length" :class="$style.stateCard"><i class="ti ti-shopping-bag" aria-hidden="true"></i><h2>{{ i18n.ts._marketplace.emptyTitle }}</h2></div>
			<div v-else-if="!cards.length" role="status" :class="$style.stateCard"><i class="ti ti-search-off" aria-hidden="true"></i><h2>{{ i18n.ts._marketplace.noResults }}</h2><MkButton small @click="clearFilters">{{ i18n.ts._marketplace.clearFilters }}</MkButton></div>
			<div v-else :class="$style.productGrid">
				<article v-for="{ product, badge } in cards" :key="product.id" :class="[$style.card, { [$style.soldOut]: product.maxQuantity === 0 }]">
					<MkA :to="`/products/${encodeURIComponent(product.id)}`" :class="$style.visual" :aria-label="i18n.tsx._marketplace.viewProduct({ name: product.name })">
						<img v-if="product.imageUrl && !failedImages[product.id]" :src="product.imageUrl" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failedImages[product.id] = true">
						<span v-else :class="$style.glyph" aria-hidden="true"><i :class="icon(product)"></i></span>
						<span :class="$style.visualBadges">
							<span :class="$style.typeBadge">{{ typeName(product) }}</span>
							<span v-if="badge" :class="[$style.statusBadge, $style[badge.tone]]">{{ badge.label }}</span>
						</span>
					</MkA>
					<div :class="$style.body">
						<div :class="$style.category"><span aria-hidden="true"></span>{{ product.category || typeName(product) }}</div>
						<h2><MkA :to="`/products/${encodeURIComponent(product.id)}`" :title="product.name">{{ product.name }}</MkA></h2>
						<p :class="$style.desc" :title="product.description">{{ product.description }}</p>
						<div :class="$style.cardMeta">
							<span><i class="ti ti-package" aria-hidden="true"></i> {{ stockInfo(product) }}</span>
							<span><i :class="product.type === 'physical' ? 'ti ti-truck-delivery' : 'ti ti-bolt'" aria-hidden="true"></i> {{ product.type === 'physical' ? i18n.ts._marketplace.physicalDelivery : i18n.ts._marketplace.automaticDelivery }}</span>
						</div>
						<footer :class="$style.footer">
							<span :class="$style.price"><i class="ti ti-coins" aria-hidden="true"></i><span><strong>{{ product.price.toLocaleString() }}</strong> {{ i18n.ts._marketplace.pointUnit }}<small> / {{ i18n.tsx._marketplace.pricePerUnit({ unit: product.unit }) }}</small></span></span>
							<button type="button" class="_button" :class="$style.redeem" :disabled="!canPurchase(product)" @click="purchase(product)">{{ purchaseLabel(product) }}</button>
						</footer>
					</div>
				</article>
			</div>
			<div v-if="moreError" role="alert" :class="$style.more"><span>{{ i18n.ts._marketplace.loadFailed }}</span><MkButton :disabled="loadingMore" @click="loadMore">{{ i18n.ts.retry }}</MkButton></div>
			<MkButton v-else-if="nextId" :class="$style.more" :disabled="loading || loadingMore" :wait="loadingMore" @click="loadMore">{{ i18n.ts.loadMore }}</MkButton>
		</section>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import XProductDetail from './product-detail.vue';
import XOrder from './order.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkA from '@/components/global/MkA.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { miLocalStorage } from '@/local-storage.js';
import { DI } from '@/di.js';

type Product = entities.ProductsListResponse['products'][number];
type PendingPurchase = {
	request: entities.OrdersPurchaseRequest;
	name: string;
	unit: string;
	type: Product['type'];
};
type Receipt = Pick<entities.OrdersListResponse[number], 'id' | 'name' | 'type' | 'quantity' | 'unit' | 'total' | 'deliveryText' | 'redemptionCode'>;
const props = defineProps<{ productId?: string }>();
const account = ensureSignin();
const storageKey = `order-purchase:${account.id}` as const;
const pageActive = inject(DI.pageActive, ref(true));
const products = ref<Product[]>([]);
const detailProduct = ref<Product | null>(null);
const currentProduct = computed(() => detailProduct.value?.id === props.productId ? detailProduct.value : products.value.find(product => product.id === props.productId));
const nextId = ref<string | null>(null);
const loadingMore = ref(false);
const moreError = ref(false);
const points = ref(0);
const quantities = ref<Record<string, number>>(Object.create(null));
const failedImages = ref<Record<string, boolean>>(Object.create(null));
const loading = ref(false);
const purchasing = ref(false);
const loadError = ref(false);
const purchaseError = ref('');
const storageError = ref(false);
const receipt = ref<Receipt | null>(null);
const receiptEl = useTemplateRef('receiptEl');
const pendingPurchase = ref<PendingPurchase | null>(null);
const query = ref('');
const sort = ref<'default' | 'priceAsc' | 'priceDesc'>('default');
const productType = ref<'all' | Product['type']>('all');
const category = ref<string | null>(null);
let active = true;
let disposed = false;
let loadGeneration = 0;

function readPending(): PendingPurchase | null {
	const raw = miLocalStorage.getItem(storageKey);
	if (raw === null) return null;
	const saved = JSON.parse(raw) as PendingPurchase;
	const request = saved?.request;
	if (!request || typeof request.productId !== 'string' || request.productId.length > 64
		|| !Number.isInteger(request.quantity) || request.quantity < 1 || request.quantity > 1000000
		|| !Number.isSafeInteger(request.expectedPrice) || request.expectedPrice < 1 || request.expectedPrice > 1000000
		|| request.expectedPrice * request.quantity > 2000000000
		|| typeof request.expectedVersion !== 'string' || request.expectedVersion.length < 1 || request.expectedVersion.length > 64
		|| typeof request.requestId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(request.requestId)
		|| typeof saved.name !== 'string' || typeof saved.unit !== 'string'
		|| !['physical', 'virtual'].includes(saved.type)) {
		throw new Error('Invalid pending purchase');
	}
	return { name: saved.name, unit: saved.unit, type: saved.type, request: {
		productId: request.productId, quantity: request.quantity, expectedPrice: request.expectedPrice,
		expectedVersion: request.expectedVersion, requestId: request.requestId,
	} };
}

function restorePending() {
	try {
		pendingPurchase.value = readPending();
		storageError.value = false;
	} catch { storageError.value = true; }
}

function clearPending(requestId: string) {
	try {
		if (readPending()?.request.requestId === requestId) miLocalStorage.removeItem(storageKey);
		restorePending();
	} catch { storageError.value = true; }
}

restorePending();

// 分类标签再点一次即取消，回到不限分类
const categories = computed(() => [...new Set(products.value.map(product => product.category).filter(Boolean))]);
const typeOptions = [
	{ value: 'all', label: i18n.ts._marketplace.allProducts },
	{ value: 'virtual', label: i18n.ts._marketplace.virtualType },
	{ value: 'physical', label: i18n.ts._marketplace.physicalType },
] as const;
const sortOptions = [
	{ value: 'default', label: i18n.ts._marketplace.defaultSort },
	{ value: 'priceAsc', label: i18n.ts._marketplace.priceAsc },
	{ value: 'priceDesc', label: i18n.ts._marketplace.priceDesc },
] as const;
const sortLabel = computed(() => sortOptions.find(option => option.value === sort.value)?.label ?? i18n.ts._marketplace.defaultSort);

function openSortMenu(ev: MouseEvent) {
	os.popupMenu(sortOptions.map(option => ({
		text: option.label,
		active: sort.value === option.value,
		action: () => { sort.value = option.value; },
	})), (ev.currentTarget ?? ev.target) as HTMLElement);
}

const visibleProducts = computed(() => {
	const keyword = query.value.trim().toLowerCase();
	const list = products.value.filter(product =>
		(keyword === '' || product.name.toLowerCase().includes(keyword) || product.description.toLowerCase().includes(keyword) || product.category.toLowerCase().includes(keyword))
		&& (productType.value === 'all' || productType.value === product.type)
		&& (category.value === null || category.value === product.category));
	if (sort.value === 'priceAsc') return [...list].sort((a, b) => a.price - b.price);
	if (sort.value === 'priceDesc') return [...list].sort((a, b) => b.price - a.price);
	return list;
});

function statusBadge(product: Product): { label: string; tone: string } | null {
	if (product.maxQuantity === 0 && product.unavailableReason === 'sold-out') return { label: i18n.ts._marketplace.soldOut, tone: 'badgeDanger' };
	if (product.unavailableReason === 'purchase-limit') return { label: i18n.ts._marketplace.reachedLimit, tone: 'badgeDanger' };
	if (product.remainingStock !== null && product.remainingStock <= 5) return { label: i18n.tsx._marketplace.stockRemaining({ count: product.remainingStock }), tone: 'badgeWarn' };
	if (product.perUserLimit > 0) return { label: i18n.tsx._marketplace.limited({ count: product.perUserLimit }), tone: 'badgeAccent' };
	return null;
}

const cards = computed(() => visibleProducts.value.map(product => ({ product, badge: statusBadge(product) })));

function clearFilters() {
	query.value = '';
	sort.value = 'default';
	productType.value = 'all';
	category.value = null;
}

function typeName(product: Product) { return product.type === 'physical' ? i18n.ts._marketplace.physicalType : i18n.ts._marketplace.virtualType; }

function icon(product: Product) { return product.type === 'physical' ? 'ti ti-package' : 'ti ti-gift'; }

function stockInfo(product: Product): string {
	if (product.remainingStock !== null) return i18n.tsx._marketplace.stockRemaining({ count: product.remainingStock });
	return i18n.ts._marketplace.unlimitedStock;
}

function getQuantity(product: Product): number {
	if (pendingPurchase.value?.request.productId === product.id) return pendingPurchase.value.request.quantity;
	return Math.min(1000000, Math.max(1, Math.floor(Number(quantities.value[product.id]) || 1)));
}

function setQuantity(product: Product, value: number | Event) {
	if (pendingPurchase.value || purchasing.value) {
		if (typeof value !== 'number') (value.target as HTMLInputElement).value = String(getQuantity(product));
		return;
	}
	const raw = typeof value === 'number' ? value : Math.floor(Number((value.target as HTMLInputElement).value));
	const quantity = Math.min(1000000, Math.max(1, Math.min(Number.isFinite(raw) ? raw : 1, product.maxQuantity)));
	quantities.value[product.id] = quantity;
	if (typeof value !== 'number') (value.target as HTMLInputElement).value = String(quantity);
}

function canPurchase(product: Product): boolean {
	return active && pageActive.value && !product.isOwner && !pendingPurchase.value && !storageError.value && !loadError.value && !loading.value && product.maxQuantity > 0 && getQuantity(product) <= product.maxQuantity && points.value >= product.price * getQuantity(product) && !purchasing.value;
}

function purchaseLabel(product: Product) {
	if (product.isOwner) return i18n.ts._marketplace.ownProduct;
	if (product.unavailableReason === 'sold-out') return i18n.ts._marketplace.soldOut;
	if (product.unavailableReason === 'purchase-limit') return i18n.ts._marketplace.reachedLimit;
	if (product.maxQuantity === 0) return i18n.ts._marketplace.unavailable;
	if (points.value < product.price * getQuantity(product)) return i18n.ts._marketplace.insufficientPoints;
	return i18n.ts._marketplace.redeemNow;
}

async function load() {
	if (!active || !pageActive.value) return;
	const generation = ++loadGeneration;
	loading.value = true;
	loadError.value = false;
	loadingMore.value = false;
	moreError.value = false;
	const productId = props.productId;
	try {
		const [shop, detail] = await Promise.all([
			misskeyApi('products/list', {}),
			productId ? misskeyApi('products/show', { productId }).catch((error: { code?: string }) => {
				if (error.code === 'NO_SUCH_MARKETPLACE_PRODUCT') return null;
				throw error;
			}) : Promise.resolve(null),
		]);
		if (!active || generation !== loadGeneration) return;
		products.value = shop.products;
		detailProduct.value = detail;
		nextId.value = shop.nextId;
		points.value = shop.points;
		failedImages.value = Object.create(null);
		if (!pendingPurchase.value) {
			for (const product of [...shop.products, ...(detail ? [detail] : [])]) quantities.value[product.id] = Math.max(1, Math.min(getQuantity(product), product.maxQuantity));
		}
	} catch {
		if (active && generation === loadGeneration) loadError.value = true;
	} finally {
		if (generation === loadGeneration) loading.value = false;
	}
}

async function loadMore() {
	if (!active || !pageActive.value || loading.value || loadingMore.value || !nextId.value) return;
	const generation = loadGeneration;
	const untilId = nextId.value;
	loadingMore.value = true;
	moreError.value = false;
	try {
		const shop = await misskeyApi('products/list', { untilId });
		if (!active || generation !== loadGeneration) return;
		const knownIds = new Set(products.value.map(product => product.id));
		products.value.push(...shop.products.filter(product => !knownIds.has(product.id)));
		nextId.value = shop.nextId;
		points.value = shop.points;
	} catch {
		if (active && generation === loadGeneration) moreError.value = true;
	} finally {
		if (generation === loadGeneration) loadingMore.value = false;
	}
}

function purchaseErrorMessage(cause: unknown): string {
	const code = (cause as { code?: string } | null)?.code;
	if (code === 'MARKETPLACE_INSUFFICIENT_POINTS') return i18n.ts._marketplace.insufficientPoints;
	if (code === 'MARKETPLACE_PRODUCT_CHANGED') return i18n.ts._marketplace.priceChanged;
	if (code === 'MARKETPLACE_LIMIT_EXCEEDED') return i18n.ts._marketplace.limitExceeded;
	if (code === 'NO_SUCH_MARKETPLACE_PRODUCT') return i18n.ts._marketplace.unavailable;
	if (code === 'MARKETPLACE_REQUEST_CONFLICT') return i18n.ts._marketplace.requestConflict;
	if (code === 'MARKETPLACE_SELLER_BALANCE_LIMIT') return i18n.ts._marketplace.sellerBalanceLimit;
	if (code === 'MARKETPLACE_NOT_ALLOWED') return i18n.ts._marketplace.purchaseNotAllowed;
	if (code === 'PLATFORM_BALANCE_LIMIT') return i18n.ts._payments.platformBalanceLimit;
	return i18n.ts._marketplace.purchaseFailed;
}

async function purchase(product: Product) {
	if (!canPurchase(product)) return;
	if (!navigator.locks || !crypto.randomUUID) {
		purchaseError.value = i18n.ts._marketplace.securePurchaseUnavailable;
		return;
	}
	purchasing.value = true;
	const pending: PendingPurchase = {
		name: product.name, unit: product.unit, type: product.type,
		request: { productId: product.id, quantity: getQuantity(product), expectedPrice: product.price, expectedVersion: product.version, requestId: crypto.randomUUID() },
	};
	try {
		const { quantity, expectedPrice } = pending.request;
		const { canceled } = await os.confirm({ type: 'question', title: pending.name, text: i18n.tsx._marketplace.confirmProduct({ name: pending.name, unit: pending.unit, amount: (expectedPrice * quantity).toLocaleString(), quantity: quantity.toLocaleString() }) });
		if (canceled || !active || !pageActive.value) return;
		await withPurchaseLock(() => submit(pending, false));
	} catch (cause) { purchaseError.value = purchaseErrorMessage(cause); } finally { purchasing.value = false; }
}

async function retryPurchase() {
	if (!active || !pageActive.value || purchasing.value || !pendingPurchase.value) return;
	const pending = pendingPurchase.value;
	purchasing.value = true;
	try {
		await withPurchaseLock(() => submit(pending, true));
	} catch (cause) { purchaseError.value = purchaseErrorMessage(cause); } finally { purchasing.value = false; }
}

async function withPurchaseLock(action: () => Promise<void>) {
	// 同一账户的多个标签页串行保存请求，避免互相覆盖未确认的扣款。
	if (!navigator.locks) {
		purchaseError.value = i18n.ts._marketplace.securePurchaseUnavailable;
		return;
	}
	await navigator.locks.request(storageKey, action);
}

async function submit(pending: PendingPurchase, retrying: boolean) {
	if (!active || !pageActive.value) return;
	restorePending();
	if (storageError.value) return;
	if (retrying ? pendingPurchase.value?.request.requestId !== pending.request.requestId : pendingPurchase.value != null) return;
	if (!retrying) {
		try {
			// 必须先落盘再扣款；接口会注入凭据，因此仅向它传请求副本。
			miLocalStorage.setItem(storageKey, JSON.stringify(pending));
			pendingPurchase.value = pending;
		} catch { storageError.value = true; return; }
	}
	purchaseError.value = '';
	receipt.value = null;
	try {
		const result = await misskeyApi('orders/purchase', { ...pending.request });
		// 离开后被销毁的页面不消费回执，重新进入时仍可用原请求取回发货内容。
		if (disposed) return;
		clearPending(pending.request.requestId);
		receipt.value = {
			id: result.orderId, name: pending.name, type: pending.type,
			quantity: result.quantity, unit: pending.unit, total: pending.request.expectedPrice * result.quantity, deliveryText: result.deliveryText,
			redemptionCode: result.redemptionCode,
		};
		points.value = result.points;
		await nextTick();
		if (active && pageActive.value) receiptEl.value?.focus();
	} catch (cause) {
		const code = (cause as { code?: string } | null)?.code ?? '';
		// 这些错误发生在事务中的幂等查询之后，可确定未成交；认证或限流失败不能证明旧请求未扣款。
		const rejectedAfterLookup = ['MARKETPLACE_INSUFFICIENT_POINTS', 'NO_SUCH_MARKETPLACE_PRODUCT', 'MARKETPLACE_PRODUCT_CHANGED', 'MARKETPLACE_LIMIT_EXCEEDED', 'MARKETPLACE_SELLER_BALANCE_LIMIT', 'PLATFORM_BALANCE_LIMIT'].includes(code);
		const rejectedBeforePurchase = ['MARKETPLACE_NOT_ALLOWED', 'INVALID_PARAM', 'RATE_LIMIT_EXCEEDED', 'CREDENTIAL_REQUIRED', 'AUTHENTICATION_FAILED', 'YOUR_ACCOUNT_SUSPENDED', 'USER_IS_DELETED', 'YOUR_ACCOUNT_MOVED', 'ACCESS_DENIED', 'PERMISSION_DENIED', 'ROLE_PERMISSION_DENIED'].includes(code);
		if (rejectedAfterLookup || (!retrying && rejectedBeforePurchase)) clearPending(pending.request.requestId);
		if (!disposed) purchaseError.value = purchaseErrorMessage(cause);
	} finally {
		if (active) await load();
	}
}

function refresh() {
	if (!active || !pageActive.value || purchasing.value) return;
	restorePending();
	void load();
}

function onStorage(event: StorageEvent) { if (event.key === storageKey || event.key === null) refresh(); }

function invalidateLoad() { loadGeneration++; loading.value = false; loadingMore.value = false; }

function deactivate() { active = false; invalidateLoad(); }

watch(pageActive, value => { if (value) refresh(); else invalidateLoad(); });
watch(() => props.productId, () => { void load(); });
onMounted(() => {
	window.addEventListener('focus', refresh);
	window.addEventListener('online', refresh);
	window.addEventListener('storage', onStorage);
});
onActivated(() => { const wasInactive = !active; active = true; if (wasInactive) refresh(); });
onDeactivated(deactivate);
onBeforeUnmount(() => {
	disposed = true;
	deactivate();
	window.removeEventListener('focus', refresh);
	window.removeEventListener('online', refresh);
	window.removeEventListener('storage', onStorage);
});
void load();
definePage(() => ({ title: currentProduct.value?.name ?? i18n.ts._marketplace.title, icon: 'ti ti-shopping-bag' }));
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	max-width: var(--MI-pageWidth);
	margin-inline: auto;
	padding-bottom: 32px;
	box-sizing: border-box;
}

.srOnly {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}

.feedback {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	padding: 12px 16px;
	margin: 0 0 var(--MI-margin);
	border-radius: var(--MI-cardRadius);
	line-height: 1.6;
}

.pendingText { flex: 1 1 240px; }
.pendingText p { margin: 0; overflow-wrap: anywhere; }
.receipt { margin-bottom: var(--MI-margin); }
.more { margin-top: var(--MI-margin); display: flex; align-items: center; gap: 12px; }

.notice { color: var(--MI_THEME-success); background: color-mix(in srgb, var(--MI_THEME-success) 10%, var(--MI_THEME-panel)); }
.error { color: var(--MI_THEME-error); background: color-mix(in srgb, var(--MI_THEME-error) 10%, var(--MI_THEME-panel)); }
.pending { color: var(--MI_THEME-warn); background: color-mix(in srgb, var(--MI_THEME-warn) 12%, var(--MI_THEME-panel)); }

.toolbar {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-bottom: var(--MI-margin);
	padding: var(--MI-cardPadding);
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-cardRadius);
}

.searchRow {
	display: flex;
	align-items: center;
	gap: 8px;
}

.searchBox {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	height: 40px;
	padding: 0 6px 0 14px;
	box-sizing: border-box;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: 999px;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fgTransparent);
	transition: border-color .15s;

	&:hover { border-color: var(--MI_THEME-inputBorderHover); }
	&:focus-within { border-color: var(--MI_THEME-accent); }

	> input {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0;
		border: none;
		outline: none;
		background: none;
		color: var(--MI_THEME-fg);
		font: inherit;

		&::-webkit-search-cancel-button { display: none; }
	}
}

.clearButton {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	color: var(--MI_THEME-fgTransparentWeak);
}

.sortButton {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 40px;
	padding: 0 12px;
	border-radius: 999px;
	color: var(--MI_THEME-fgTransparent);
	white-space: nowrap;

	> .ti-chevron-down { font-size: .85em; }
}

.facets {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
}

.segmented {
	flex-shrink: 0;
	display: inline-flex;
	padding: 3px;
	border-radius: 999px;
	background: var(--MI_THEME-bg);
}

.segment {
	min-height: 30px;
	padding: 0 14px;
	border-radius: 999px;
	color: var(--MI_THEME-fgTransparent);
	white-space: nowrap;
	transition: color .15s, background .15s;

	&.active {
		color: var(--MI_THEME-fgOnAccent);
		background: var(--MI_THEME-accent);
	}
}

// 分类多时横向滚动，不撑高工具栏
.chips {
	display: flex;
	gap: 8px;
	min-width: 0;
	padding-left: 12px;
	border-left: var(--MI-divider);
	overflow-x: auto;
	scrollbar-width: none;

	&::-webkit-scrollbar { display: none; }
}

.chip {
	flex-shrink: 0;
	min-height: 30px;
	padding: 0 12px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 999px;
	color: var(--MI_THEME-fgTransparent);
	white-space: nowrap;
	transition: color .15s, border-color .15s, background .15s;

	&.active {
		border-color: transparent;
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
	}
}

.productGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
	gap: var(--MI-margin);
	align-items: stretch;
}

.card {
	display: flex;
	flex-direction: column;
	min-width: 0;
	overflow: hidden;
	border: var(--MI-divider);
	border-radius: var(--MI-cardRadius);
	background: var(--MI_THEME-panel);
	box-shadow: 0 2px 8px color-mix(in srgb, var(--MI_THEME-fg) 3%, transparent);
	transition: box-shadow .2s, transform .2s;
}

.visual {
	position: relative;
	display: grid;
	place-items: center;
	aspect-ratio: 3 / 2;
	overflow: hidden;
	background: linear-gradient(135deg, var(--MI_THEME-accentedBg), var(--MI_THEME-panelHighlight));

	> img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform .3s;
	}
}

.glyph { display: grid; place-items: center; color: var(--MI_THEME-accent); font-size: 48px; }
.visualBadges { position: absolute; inset: 10px 10px auto; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
.typeBadge, .statusBadge { max-width: 100%; padding: 3px 7px; border-radius: calc(var(--MI-radius) / 3); font-size: .8em; font-weight: 600; overflow-wrap: anywhere; }
.typeBadge { color: var(--MI_THEME-infoWarnFg); background: var(--MI_THEME-infoWarnBg); }
.badgeDanger { color: var(--MI_THEME-error); background: var(--MI_THEME-panel); }
.badgeWarn { color: var(--MI_THEME-infoWarnFg); background: var(--MI_THEME-infoWarnBg); }
.badgeAccent { color: var(--MI_THEME-accent); background: var(--MI_THEME-panel); }
.soldOut .visual > img { opacity: .65; }

.body {
	display: flex;
	flex-direction: column;
	flex: 1;
	gap: 8px;
	padding: 14px;

	h2 {
		overflow: hidden;
		margin: 0;
		font-size: 1.05em;
		font-weight: 600;
		line-height: 1.5;
	}

	h2 a { display: block; overflow: hidden; color: inherit; text-overflow: ellipsis; white-space: nowrap; }
}

.category {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	color: var(--MI_THEME-fgTransparent);
	font-size: .85em;
	line-height: 1.4;
	overflow-wrap: anywhere;

	> span { flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; background: var(--MI_THEME-accent); }
}

.desc {
	overflow: hidden;
	min-height: 1.6em;
	margin: 0;
	color: var(--MI_THEME-fgTransparent);
	font-size: .9em;
	line-height: 1.6;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cardMeta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 12px;
	margin-top: auto;
	color: var(--MI_THEME-fgTransparent);
	font-size: .8em;
	line-height: 1.5;
	overflow-wrap: anywhere;

	> span { display: inline-flex; align-items: center; gap: 4px; }
}

.footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding-top: 10px; border-top: var(--MI-divider); }
.price { display: inline-flex; align-items: center; gap: 6px; color: var(--MI_THEME-accent); font-size: .85em; font-variant-numeric: tabular-nums; }
.price strong { font-size: 1.4em; font-weight: 600; }
.price small { color: var(--MI_THEME-fgTransparent); font-size: .9em; }

.redeem {
	max-width: 100%;
	min-height: 32px;
	padding: 6px 10px;
	border-radius: calc(var(--MI-radius) / 2);
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
	font-size: .85em;
	font-weight: 600;
	transition: background .15s;

	&:disabled {
		color: var(--MI_THEME-fgTransparent);
		background: var(--MI_THEME-buttonBg);
		cursor: not-allowed;
	}
}

.segment:focus-visible, .chip:focus-visible, .sortButton:focus-visible, .clearButton:focus-visible, .visual:focus-visible, .body h2 a:focus-visible, .redeem:focus-visible {
	outline: 2px solid var(--MI_THEME-focus);
	outline-offset: 2px;
}

.visual:focus-visible { outline-offset: -3px; }

.stateCard {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 14px;
	min-height: 260px;
	padding: 32px 20px;
	box-sizing: border-box;
	border-radius: var(--MI-cardRadius);
	background: var(--MI_THEME-panel);
	text-align: center;

	> i { color: var(--MI_THEME-fgTransparentWeak); font-size: 36px; }
	h2 { margin: 0; font-size: 1em; font-weight: 600; }
	p { max-width: 340px; margin: 0; color: var(--MI_THEME-fgTransparent); line-height: 1.6; }
}

.skeleton { min-height: 310px; border: var(--MI-divider); border-radius: var(--MI-cardRadius); background: var(--MI_THEME-panel); }

@media (hover: hover) {
	.card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent); }
	.card:hover .visual > img { transform: scale(1.035); }
	.segment:not(.active):hover, .chip:not(.active):hover, .sortButton:hover, .clearButton:hover, .body h2 a:hover { color: var(--MI_THEME-accent); }
	.sortButton:hover, .clearButton:hover { background: var(--MI_THEME-buttonHoverBg); }
	.redeem:not(:disabled):hover { background: color-mix(in srgb, var(--MI_THEME-accent) 18%, var(--MI_THEME-panel)); }
}

.still * { transition: none !important; }
@media (prefers-reduced-motion: reduce) { .root * { transition: none !important; } }

@container (max-width: 600px) {
	.facets {
		flex-direction: column;
		align-items: stretch;
	}

	.segmented { align-self: flex-start; }

	.chips {
		padding-left: 0;
		border-left: none;
	}
}
</style>
