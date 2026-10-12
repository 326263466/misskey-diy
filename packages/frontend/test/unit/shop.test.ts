/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import Shop from '@/pages/shop.vue';
import Orders from '@/pages/orders.vue';
import ProductEditor from '@/pages/product-edit.vue';
import PaymentSettings from '@/pages/admin/payments.vue';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { DI } from '@/di.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), purchase: vi.fn(), copy: vi.fn(), replace: vi.fn(), account: { id: 'shop-buyer', username: 'buyer', host: null } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, toast: vi.fn() }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: mocks.copy }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/i.js', () => ({ ensureSignin: () => mocks.account }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled', 'type', 'wait'], template: '<button :type="type || \'button\'" :disabled="disabled || wait"><slot/></button>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<p><slot/></p>' } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { props: ['to'], template: '<a :href="to"><slot/></a>' } }));

const seller = { id: 'shop-seller', name: '商品发布人', username: 'seller', host: null, avatarUrl: null, avatarDecorations: [], emojis: {} };
const product = { id: 'digital-guide', name: '电子手册', description: '使用说明', price: 60, maxQuantity: 10, unit: '份', type: 'virtual', category: '', imageUrl: '', perUserLimit: 10, stockLimit: 0, enabled: true, remainingStock: null, remainingAllowance: 10, purchasedQuantity: 0, unavailableReason: null, version: 'v1', sellerId: seller.id, seller, isOwner: false, deliveryText: null };
const pageStubs = { PageWithHeader: { template: '<main><slot/></main>' }, MkAvatar: { props: ['user'], template: '<span/>' }, MkUserName: { props: ['user'], template: '<span>{{ user.name || user.username }}</span>' } };
const storageKey = 'order-purchase:shop-buyer' as const;
const orderId = '1791655200000000001';
const redemptionCode = 'ABCDE-12345-FGHIJ-67890';
const order = { id: orderId, productId: product.id, name: product.name, type: 'virtual', total: 60, quantity: 1, unit: '份', createdAt: '2026-10-08T00:00:00Z', deliveryText: '', redemptionCode, seller, buyer: null };

async function renderShop(productId?: string) {
	const view = render(Shop, { props: { productId }, global: { stubs: pageStubs } });
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._marketplace.redeemNow })).toBeTruthy());
	return view;
}

beforeEach(() => {
	vi.clearAllMocks();
	Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_key: string, action: () => Promise<void>) => action() } });
	mocks.account.id = 'shop-buyer';
	miLocalStorage.removeItem(storageKey);
	miLocalStorage.removeItem('product-publish:shop-buyer');
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.purchase.mockResolvedValue({ productId: product.id, quantity: 1, points: 540, orderId, deliveryText: '', redemptionCode, purchased: true });
	mocks.api.mockImplementation((endpoint: string, params: unknown) => endpoint === 'products/list' ? Promise.resolve({ products: [product], points: 600, nextId: null }) : endpoint === 'products/show' ? Promise.resolve(product) : endpoint === 'orders/list' ? Promise.resolve([]) : mocks.purchase(params));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('links catalog products to their details without submitting a purchase', async () => {
	const view = await renderShop();
	expect(view.getByRole('link', { name: product.name }).getAttribute('href')).toBe(`/products/${product.id}`);
	expect(view.queryByRole('link', { name: i18n.ts._marketplace.orders })).toBeNull();
	expect(view.queryByRole('link', { name: i18n.ts._marketplace.myProducts })).toBeNull();
	expect(view.queryByRole('link', { name: i18n.ts._marketplace.publishProduct })).toBeNull();
	expect(mocks.purchase).not.toHaveBeenCalled();
});

test('keeps the visible quantity, total and confirmation consistent when input exceeds the limit', async () => {
	const view = await renderShop(product.id);
	const quantity = view.getByRole('spinbutton') as HTMLInputElement;
	await fireEvent.change(quantity, { target: { value: '10' } });
	await fireEvent.change(quantity, { target: { value: '999' } });
	expect(quantity.value).toBe('10');
	expect(view.getByText(`${i18n.tsx._marketplace.total({ amount: '600' })} ${i18n.ts._marketplace.pointUnit}`)).toBeTruthy();
	mocks.confirm.mockResolvedValue({ canceled: true });
	await fireEvent.click(view.getByRole('button', { name: new RegExp(i18n.ts._marketplace.redeemNow) }));
	expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ text: i18n.tsx._marketplace.confirmProduct({ name: product.name, unit: product.unit, quantity: '10', amount: '600' }) }));
	expect(mocks.purchase).not.toHaveBeenCalled();
	await fireEvent.change(quantity, { target: { value: '1' } });
	await fireEvent.change(quantity, { target: { value: '0' } });
	expect(quantity.value).toBe('1');
});

test('reuses the quoted request after an unknown result and refreshes the catalog after success', async () => {
	mocks.purchase.mockRejectedValueOnce(new Error('response lost'));
	const view = await renderShop(product.id);
	const purchase = view.getByRole('button', { name: new RegExp(i18n.ts._marketplace.redeemNow) });
	await fireEvent.click(purchase);
	await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
	expect((view.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true);
	await view.rerender({ productId: undefined });
	expect(view.getByRole('button', { name: i18n.ts._marketplace.retryPurchase })).toBeTruthy();
	await view.rerender({ productId: product.id });
	expect((view.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true);
	const retry = view.getByRole('button', { name: i18n.ts._marketplace.retryPurchase });
	await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
	await fireEvent.click(retry);
	await waitFor(() => expect(view.getByText(i18n.ts._marketplace.redeemSuccess)).toBeTruthy());
	expect(mocks.purchase).toHaveBeenCalledTimes(2);
	expect(mocks.purchase.mock.calls[1][0]).toEqual(mocks.purchase.mock.calls[0][0]);
	expect(mocks.purchase.mock.calls[0][0]).toEqual(expect.objectContaining({ productId: product.id, quantity: 1, requestId: expect.any(String) }));
	expect(mocks.purchase.mock.calls[0][0].expectedPrice).toBe(60);
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'products/list')).toHaveLength(5);
	expect(miLocalStorage.getItem(storageKey)).toBeNull();
});

test('locks the purchase while confirmation is open and submits the displayed quote', async () => {
	let confirm!: (value: { canceled: boolean }) => void;
	mocks.confirm.mockImplementation(() => new Promise(resolve => { confirm = resolve; }));
	const view = await renderShop(product.id);
	const purchase = view.getByRole('button', { name: new RegExp(i18n.ts._marketplace.redeemNow) });
	await fireEvent.click(purchase);
	await fireEvent.click(purchase);
	expect(mocks.confirm).toHaveBeenCalledTimes(1);
	confirm({ canceled: false });
	await waitFor(() => expect(mocks.purchase).toHaveBeenCalledTimes(1));
	expect(mocks.purchase.mock.calls[0][0]).toMatchObject({ quantity: 1, expectedPrice: 60 });
});

test('refreshes a changed price and requires a new confirmation before resubmitting', async () => {
	mocks.purchase.mockRejectedValueOnce({ code: 'MARKETPLACE_PRODUCT_CHANGED' });
	const view = await renderShop(product.id);
	mocks.api.mockImplementation((endpoint: string, params: unknown) => endpoint === 'products/list' ? Promise.resolve({ products: [{ ...product, price: 80 }], points: 600, nextId: null }) : endpoint === 'products/show' ? Promise.resolve({ ...product, price: 80 }) : mocks.purchase(params));
	const purchase = view.getByRole('button', { name: new RegExp(i18n.ts._marketplace.redeemNow) });
	await fireEvent.click(purchase);
	await waitFor(() => expect(view.getByRole('alert').textContent).toContain(i18n.ts._marketplace.priceChanged));
	await waitFor(() => expect((purchase as HTMLButtonElement).disabled).toBe(false));
	expect(mocks.purchase).toHaveBeenCalledTimes(1);
	await fireEvent.click(purchase);
	await waitFor(() => expect(mocks.purchase).toHaveBeenCalledTimes(2));
	expect(mocks.purchase.mock.calls[1][0]).toMatchObject({ expectedPrice: 80 });
	expect(mocks.purchase.mock.calls[1][0].requestId).not.toBe(mocks.purchase.mock.calls[0][0].requestId);
});

test.each(['virtual', 'physical'])('delivers a %s product directly after payment and keeps its content in order history', async type => {
	const digital = { ...product, id: 'guide', name: '自定义商品', type, unit: '份', version: 'v2' };
	mocks.purchase.mockResolvedValue({ productId: digital.id, quantity: 1, points: 540, orderId, deliveryText: 'private-delivery', redemptionCode, purchased: true });
	mocks.api.mockImplementation((endpoint: string, params: unknown) => {
		if (endpoint === 'products/list') return Promise.resolve({ products: [digital], points: 600 });
		if (endpoint === 'products/show') return Promise.resolve(digital);
		if (endpoint === 'orders/list') return Promise.resolve([{ ...order, name: digital.name, type, unit: '份', deliveryText: 'private-delivery' }]);
		return mocks.purchase(params);
	});
	const view = await renderShop(digital.id);
	await fireEvent.click(view.getByRole('button', { name: new RegExp(i18n.ts._marketplace.redeemNow) }));
	await waitFor(() => expect(view.getByText(i18n.ts._marketplace.redeemSuccess)).toBeTruthy());
	expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ text: i18n.tsx._marketplace.confirmProduct({ name: digital.name, unit: '份', quantity: '1', amount: '60' }) }));
	expect(view.getByText('private-delivery')).toBeTruthy();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyContent }));
	expect(mocks.copy).toHaveBeenCalledWith('private-delivery');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._marketplace.copyCode }));
	expect(mocks.copy).toHaveBeenCalledWith(redemptionCode);
	expect(view.getByText('ABCDE-12345-FGHIJ-67890')).toBeTruthy();
	view.unmount();
	const history = render(Orders, { global: { stubs: pageStubs } });
	await waitFor(() => expect(history.getByText('private-delivery')).toBeTruthy());
	expect(history.getByText(orderId)).toBeTruthy();
});

test('resumes the same paid request after reload even when its product has been removed', async () => {
	const paid = new Set<string>();
	let points = 600;
	let lastRequest: Record<string, unknown>;
	mocks.purchase.mockImplementation(async request => {
		lastRequest = request;
		if (!paid.has(request.requestId)) {
			paid.add(request.requestId);
			points -= 60;
			throw new Error('paid but response lost');
		}
		return { quantity: 1, points, orderId, deliveryText: 'private-delivery', redemptionCode };
	});
	const view = await renderShop(product.id);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._marketplace.redeemNow }));
	await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
	const saved = JSON.parse(miLocalStorage.getItem(storageKey)!);
	expect(saved.request).toEqual(lastRequest!);
	view.unmount();
	mocks.api.mockImplementation((endpoint: string, params: unknown) => endpoint === 'products/list' ? Promise.resolve({ products: [], points }) : mocks.purchase(params));
	const restored = render(Shop, { global: { stubs: pageStubs } });
	await fireEvent.click(restored.getByRole('button', { name: i18n.ts._marketplace.retryPurchase }));
	await waitFor(() => expect(restored.getByText(i18n.ts._marketplace.redeemSuccess)).toBeTruthy());
	expect(lastRequest!).toEqual(saved.request);
	expect(points).toBe(540);
	expect(paid.size).toBe(1);
	expect(mocks.confirm).toHaveBeenCalledTimes(1);
	expect(restored.getByText('private-delivery')).toBeTruthy();
});

test('preserves a success received after unmount so a new page can recover its delivery', async () => {
	let finish!: (value: unknown) => void;
	mocks.purchase.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
	const first = await renderShop();
	await fireEvent.click(first.getByRole('button', { name: i18n.ts._marketplace.redeemNow }));
	await waitFor(() => expect(mocks.purchase).toHaveBeenCalledTimes(1));
	const saved = miLocalStorage.getItem(storageKey);
	first.unmount();
	const second = await renderShop();
	finish({ quantity: 1, points: 540, orderId, deliveryText: '', redemptionCode });
	await nextTick();
	expect(miLocalStorage.getItem(storageKey)).toBe(saved);
	await fireEvent.click(second.getByRole('button', { name: i18n.ts._marketplace.retryPurchase }));
	await waitFor(() => expect(second.getByText('ABCDE-12345-FGHIJ-67890')).toBeTruthy());
	expect(mocks.purchase.mock.calls[1][0]).toEqual(mocks.purchase.mock.calls[0][0]);
});

test.each(['RATE_LIMIT_EXCEEDED', 'MARKETPLACE_NOT_ALLOWED', 'MARKETPLACE_REQUEST_CONFLICT', 'INTERNAL_ERROR'])('keeps an uncertain request when its retry returns %s', async code => {
	mocks.purchase.mockRejectedValueOnce(new Error('lost')).mockRejectedValueOnce({ code });
	const view = await renderShop();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._marketplace.redeemNow }));
	await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
	const saved = miLocalStorage.getItem(storageKey);
	await waitFor(() => expect((view.getByRole('button', { name: i18n.ts._marketplace.retryPurchase }) as HTMLButtonElement).disabled).toBe(false));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._marketplace.retryPurchase }));
	await waitFor(() => expect(mocks.purchase).toHaveBeenCalledTimes(2));
	expect(miLocalStorage.getItem(storageKey)).toBe(saved);
	expect((view.getByRole('button', { name: i18n.ts._marketplace.redeemNow }) as HTMLButtonElement).disabled).toBe(true);
});

test('does not charge without durable storage and never persists API credentials', async () => {
	const save = vi.spyOn(miLocalStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
	const view = await renderShop();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._marketplace.redeemNow }));
	await waitFor(() => expect(view.getByText(i18n.ts._marketplace.requestStorageFailed)).toBeTruthy());
	expect(mocks.purchase).not.toHaveBeenCalled();
	await waitFor(() => expect((view.getByRole('button', { name: i18n.ts.retry }) as HTMLButtonElement).disabled).toBe(false));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
	expect(view.queryByText(i18n.ts._marketplace.requestStorageFailed)).toBeNull();
	mocks.purchase.mockImplementationOnce(async request => { request.i = 'private-token'; throw new Error('lost'); });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._marketplace.redeemNow }));
	await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
	expect(miLocalStorage.getItem(storageKey)).not.toContain('private-token');
	expect(save).toHaveBeenCalledTimes(2);
});

test('isolates recovery by account and preserves a quantity above ten after remount', async () => {
	const unlimitedProduct = { ...product, price: 1, maxQuantity: 1000000, perUserLimit: 0, remainingAllowance: null };
	mocks.purchase.mockRejectedValue(new Error('lost'));
	mocks.api.mockImplementation((endpoint: string, params: unknown) => endpoint === 'products/list' ? Promise.resolve({ products: [unlimitedProduct], points: 600, nextId: null }) : endpoint === 'products/show' ? Promise.resolve(unlimitedProduct) : mocks.purchase(params));
	const view = await renderShop(product.id);
	await fireEvent.change(view.getByRole('spinbutton'), { target: { value: '25' } });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._marketplace.redeemNow }));
	await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
	view.unmount();
	mocks.account.id = 'other-shop-buyer';
	const other = await renderShop();
	expect(other.queryByRole('button', { name: i18n.ts._marketplace.retryPurchase })).toBeNull();
	other.unmount();
	mocks.account.id = 'shop-buyer';
	const restored = await renderShop(product.id);
	expect((restored.getByRole('spinbutton') as HTMLInputElement).value).toBe('25');
	expect((restored.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true);
	expect(mocks.purchase.mock.calls[0][0]).toMatchObject({ quantity: 25, expectedPrice: 1 });
});

test('does not charge when cross-tab request locking is unavailable', async () => {
	Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
	const view = await renderShop();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._marketplace.redeemNow }));
	await waitFor(() => expect(view.getByText(i18n.ts._marketplace.securePurchaseUnavailable)).toBeTruthy());
	expect(mocks.purchase).not.toHaveBeenCalled();
	expect(miLocalStorage.getItem(storageKey)).toBeNull();
});

function renderCached(component: typeof Shop | typeof Orders | typeof ProductEditor, stubs = pageStubs) {
	const visible = ref(true);
	const host = defineComponent({ setup: () => () => h(KeepAlive, {}, { default: () => visible.value ? h(component) : h('div') }) });
	return { ...render(host, { global: { stubs } }), visible };
}

test('refreshes eligibility when returning to the cached catalog and ignores stale loads', async () => {
	let resolveStale!: (value: unknown) => void;
	mocks.api.mockResolvedValueOnce({ products: [product], points: 0 })
		.mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve; }))
		.mockResolvedValueOnce({ products: [product], points: 600 });
	const view = renderCached(Shop);
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._marketplace.insufficientPoints })).toBeTruthy());
	window.dispatchEvent(new Event('focus'));
	view.visible.value = false;
	await nextTick();
	view.visible.value = true;
	await waitFor(() => expect((view.getByRole('button', { name: i18n.ts._marketplace.redeemNow }) as HTMLButtonElement).disabled).toBe(false));
	resolveStale({ products: [product], points: 0 });
	await nextTick();
	expect((view.getByRole('button', { name: i18n.ts._marketplace.redeemNow }) as HTMLButtonElement).disabled).toBe(false);
	expect(mocks.api).toHaveBeenCalledTimes(3);
});

test('refreshes cached orders without an older response hiding a new purchase', async () => {
	let resolveOld!: (value: unknown) => void;
	mocks.api.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
		.mockResolvedValueOnce([{ ...order, name: 'New purchase', deliveryText: 'new-code' }]);
	const view = renderCached(Orders);
	view.visible.value = false;
	await nextTick();
	view.visible.value = true;
	await waitFor(() => expect(view.getByText('new-code')).toBeTruthy());
	resolveOld([]);
	await nextTick();
	expect(view.getByText('new-code')).toBeTruthy();
	expect(mocks.api).toHaveBeenCalledTimes(2);
});

test.each([{ name: 'catalog', component: Shop }, { name: 'orders', component: Orders }])('refreshes $name when a stacked page becomes visible again', async ({ component }) => {
	const activity = ref(true);
	render(component, { global: { stubs: pageStubs, provide: { [DI.pageActive as symbol]: activity } } });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	activity.value = false;
	await nextTick();
	window.dispatchEvent(new Event('focus'));
	expect(mocks.api).toHaveBeenCalledTimes(1);
	activity.value = true;
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
});

test('paginates order snapshots and retries a failed page without losing earlier orders', async () => {
	const orders = Array.from({ length: 21 }, (_, index) => ({ ...order, id: String(BigInt(orderId) + BigInt(index)), name: `Product ${index}` }));
	mocks.api.mockResolvedValueOnce(orders).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([orders[20]]);
	const view = render(Orders, { global: { stubs: pageStubs } });
	await waitFor(() => expect(view.getByText('Product 19')).toBeTruthy());
	expect(view.queryByText('Product 20')).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
	await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
	expect(view.getByText('Product 0')).toBeTruthy();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
	await waitFor(() => expect(view.getByText('Product 20')).toBeTruthy());
	expect(mocks.api.mock.calls[1]).toEqual(['orders/list', { limit: 21, untilId: orders[19].id }]);
	expect(mocks.api.mock.calls[2]).toEqual(mocks.api.mock.calls[1]);
	expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();
});

const editorStubs = {
	...pageStubs,
	MkInput: { props: ['modelValue', 'type', 'disabled'], template: `<label><slot name="label"/><input :type="type || 'text'" :value="modelValue" :disabled="disabled" @input="$emit('update:modelValue', type === 'number' ? Number($event.target.value) : $event.target.value)"/></label>` },
	MkTextarea: { props: ['modelValue', 'disabled'], template: `<label><slot name="label"/><textarea :value="modelValue" :disabled="disabled" @input="$emit('update:modelValue', $event.target.value)"/></label>` },
	MkSelect: { props: ['modelValue', 'items', 'disabled'], template: `<label><slot name="label"/><select :value="String(modelValue)" :disabled="disabled" @change="$emit('update:modelValue', items.find(item => String(item.value) === $event.target.value).value)"><option v-for="item in items" :key="String(item.value)" :value="String(item.value)">{{ item.label }}</option></select></label>` },
};

test('restores an uncertain product publication with the same request and without API credentials', async () => {
	const attempts: Record<string, unknown>[] = [];
	mocks.api.mockImplementation(async (endpoint: string, params: Record<string, unknown>) => {
		if (endpoint === 'payments/settings') return { feeRateBps: 1500 };
		if (endpoint !== 'products/create') throw new Error(`Unexpected endpoint: ${endpoint}`);
		attempts.push({ ...params });
		if (attempts.length === 1) { params.i = 'private-api-token'; throw new Error('response lost'); }
		return { ...product, ...params, id: 'new-product', isOwner: true };
	});
	const first = render(ProductEditor, { global: { stubs: editorStubs } });
	await fireEvent.update(first.getByLabelText(i18n.ts._marketplace.productName), '电子资料');
	await fireEvent.update(first.getByLabelText(i18n.ts._marketplace.deliveryContent), '下载地址与领取方法');
	await fireEvent.update(first.getByLabelText(i18n.ts._marketplace.coverUrl), 'HTTPS://example.com/Digital.png');
	await fireEvent.submit(first.container.querySelector('form')!);
	await waitFor(() => expect(first.getByText(i18n.ts._marketplace.productSaveFailed)).toBeTruthy());
	const saved = miLocalStorage.getItem('product-publish:shop-buyer');
	expect(saved).not.toContain('private-api-token');
	expect(JSON.parse(saved!)).toMatchObject({ name: '电子资料', imageUrl: 'https://example.com/Digital.png', perUserLimit: 0, requestId: expect.any(String) });
	first.unmount();
	const restored = render(ProductEditor, { global: { stubs: editorStubs } });
	expect((restored.getByLabelText(i18n.ts._marketplace.productName) as HTMLInputElement).disabled).toBe(true);
	await fireEvent.click(restored.getByRole('button', { name: i18n.ts._marketplace.retryPublish }));
	await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/my/products/:productId/edit', { params: { productId: 'new-product' } }));
	expect(attempts).toHaveLength(2);
	expect(attempts[1]).toEqual(attempts[0]);
	expect(miLocalStorage.getItem('product-publish:shop-buyer')).toBeNull();
});

test('updates the owner product through the shared API with its version and cumulative limit', async () => {
	const ownedProduct = { ...product, isOwner: true, sellerId: mocks.account.id, seller: { ...seller, id: mocks.account.id }, perUserLimit: 0, deliveryText: 'private-delivery' };
	mocks.api.mockImplementation((endpoint: string, params: Record<string, unknown>) => {
		if (endpoint === 'payments/settings') return Promise.resolve({ feeRateBps: 1500 });
		if (endpoint === 'products/show') return Promise.resolve(ownedProduct);
		if (endpoint === 'products/update') return Promise.resolve({ ...ownedProduct, ...params, version: 'v2' });
		throw new Error(`Unexpected endpoint: ${endpoint}`);
	});
	const view = render(ProductEditor, { props: { productId: product.id }, global: { stubs: editorStubs } });
	await waitFor(() => expect(view.getByLabelText(i18n.ts._marketplace.productName)).toBeTruthy());
	await fireEvent.update(view.getByLabelText(i18n.ts._marketplace.purchaseLimit), 'limited');
	await fireEvent.update(view.getByLabelText(`${i18n.ts._marketplace.perUserLimit} (${product.unit})`), '12');
	await fireEvent.submit(view.container.querySelector('form')!);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('products/update', expect.objectContaining({ productId: product.id, expectedVersion: 'v1', perUserLimit: 12 })));
	expect(mocks.api.mock.calls.map(([endpoint]) => endpoint)).not.toContain('admin/update-meta');
});

test('keeps a hidden publication recoverable without navigating away from the active page', async () => {
	let finish!: (value: unknown) => void;
	const published = { ...product, id: 'published-product', isOwner: true, deliveryText: 'private-delivery' };
	mocks.api.mockImplementation((endpoint: string) => endpoint === 'payments/settings' ? Promise.resolve({ feeRateBps: 1500 }) : new Promise(resolve => { finish = resolve; }));
	const view = renderCached(ProductEditor, editorStubs);
	await fireEvent.update(view.getByLabelText(i18n.ts._marketplace.productName), '电子资料');
	await fireEvent.update(view.getByLabelText(i18n.ts._marketplace.deliveryContent), '领取说明');
	await fireEvent.submit(view.container.querySelector('form')!);
	await waitFor(() => expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'products/create')).toHaveLength(1));
	const saved = miLocalStorage.getItem('product-publish:shop-buyer');
	view.visible.value = false;
	await nextTick();
	finish(published);
	await nextTick();
	await nextTick();
	expect(mocks.replace).not.toHaveBeenCalled();
	expect(miLocalStorage.getItem('product-publish:shop-buyer')).toBe(saved);
	view.visible.value = true;
	await nextTick();
	mocks.api.mockResolvedValueOnce(published);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._marketplace.retryPublish }));
	await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/my/products/:productId/edit', { params: { productId: published.id } }));
	const publishCalls = mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'products/create');
	expect(publishCalls[1]).toEqual(publishCalls[0]);
});

test('reads a fifteen percent fee and saves fractional percentages in basis points', async () => {
	mocks.api.mockImplementation((endpoint: string, params?: { feeRateBps: number }) => {
		if (endpoint === 'admin/payments/settings') return Promise.resolve({ feeRateBps: 1500, platformBalance: 12.5 });
		if (endpoint === 'admin/payments/update-settings') return Promise.resolve({ feeRateBps: params!.feeRateBps, platformBalance: 12.5 });
		throw new Error(`Unexpected endpoint: ${endpoint}`);
	});
	const view = render(PaymentSettings, { global: { stubs: editorStubs } });
	await waitFor(() => expect(view.getByLabelText(i18n.ts._payments.feeRate)).toBeTruthy());
	expect((view.getByLabelText(i18n.ts._payments.feeRate) as HTMLInputElement).value).toBe('15');
	await fireEvent.update(view.getByLabelText(i18n.ts._payments.feeRate), '20.25');
	await fireEvent.submit(view.container.querySelector('form')!);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('admin/payments/update-settings', { feeRateBps: 2025 }));
});

test('shows seller settlement snapshots without inventing fees for older orders', async () => {
	mocks.api.mockResolvedValue([
		{ ...order, id: '1791655200000000002', name: '已结算订单', total: 150, feeRateBps: 1500, platformFee: 22.5, sellerAmount: 127.5 },
		{ ...order, name: '历史订单', feeRateBps: null, platformFee: null, sellerAmount: null },
	]);
	const view = render(Orders, { props: { mode: 'sales' }, global: { stubs: pageStubs } });
	await waitFor(() => expect(view.getByText('22.5 积分')).toBeTruthy());
	expect(view.getByText('127.5 积分')).toBeTruthy();
	expect(view.getAllByText(i18n.ts._payments.sellerAmount)).toHaveLength(1);
	expect(mocks.api).toHaveBeenCalledWith('orders/list', { limit: 21, mode: 'sales' });
});
