/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import AdminBenefitCodes from '@/pages/admin/benefits.codes.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), create: vi.fn(), list: vi.fn(), update: vi.fn(), claims: vi.fn(), copy: vi.fn(), toast: vi.fn(), alert: vi.fn(), confirm: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ toast: mocks.toast, alert: mocks.alert, confirm: mocks.confirm }));
vi.mock('@/components/MkButton.vue', () => ({ default: {
	props: ['type', 'disabled', 'wait'],
	template: '<button :type="type ?? \'button\'" :disabled="disabled || wait"><slot/></button>',
} }));
vi.mock('@/components/MkInput.vue', () => ({ default: {
	props: ['modelValue', 'type', 'disabled'],
	emits: ['update:modelValue'],
	template: '<label><slot name="label"/><input :type="type ?? \'text\'" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', type === \'number\' ? Number($event.target.value) : $event.target.value)"/></label>',
} }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));

function code(overrides = {}) {
	return { id: 'code-1', name: 'Autumn event', code: 'ABCDEFGH12345678', amount: 3, maxRedemptions: 50, redemptions: 2, expiresAt: null, enabled: true, createdAt: '2026-09-29T03:00:00Z', ...overrides };
}

function claim(overrides = {}) {
	return { id: 'claim-1', userId: 'alice', user: { id: 'alice', username: 'alice' }, amount: 3, createdAt: '2026-09-29T03:00:00Z', ...overrides };
}

function renderPage() {
	return render(AdminBenefitCodes, { global: { stubs: {
		MkLoading: { template: '<div role="status">Loading</div>' },
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		MkTime: { props: ['time'], template: '<time>{{ time }}</time>' },
	} } });
}

async function fillForm(view: ReturnType<typeof renderPage>) {
	if (!view.queryByRole('textbox')) await fireEvent.click(view.getByRole('button', { name: i18n.ts._benefits.createCode }));
	await fireEvent.update(view.getByRole('textbox', { name: i18n.ts._benefits.codeName }), '  Autumn event  ');
	await fireEvent.update(view.getByRole('spinbutton', { name: i18n.ts._benefits.cardsPerClaim }), '3');
	await fireEvent.update(view.getByRole('spinbutton', { name: i18n.ts._benefits.claimLimit }), '50');
}

function listPanel(view: ReturnType<typeof renderPage>) {
	return within(view.getByRole('region', { name: i18n.ts._benefits.codeList }));
}

async function openClaims(view: ReturnType<typeof renderPage>, name = 'Autumn event') {
	await fireEvent.click(await view.findByRole('button', { name: i18n.tsx._benefits.claimsTitle({ name }) }));
	return within(view.getByRole('region', { name: i18n.tsx._benefits.claimsTitle({ name }) }));
}

describe('administrator benefit redemption codes', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } });
		mocks.copy.mockResolvedValue(undefined);
		mocks.confirm.mockResolvedValue({ canceled: false });
		mocks.list.mockResolvedValue({ total: 1, items: [code()] });
		mocks.create.mockResolvedValue(code());
		mocks.update.mockResolvedValue(code({ enabled: false }));
		mocks.claims.mockResolvedValue({ total: 1, items: [claim()] });
		mocks.api.mockImplementation((endpoint, params) => {
			if (endpoint === 'admin/checkin/codes/list') return mocks.list(params);
			if (endpoint === 'admin/checkin/codes/create') return mocks.create(params);
			if (endpoint === 'admin/checkin/codes/update') return mocks.update(params);
			if (endpoint === 'admin/checkin/codes/claims') return mocks.claims(params);
			throw new Error(`Unexpected endpoint ${endpoint}`);
		});
	});
	afterEach(cleanup);

	test('starts with the code list, preserves a canceled draft and restores focus to creation', async () => {
		const view = renderPage();
		await view.findByTestId('benefit-code-code-1');
		expect(view.queryByRole('textbox')).toBeNull();
		await fillForm(view);
		expect(document.activeElement).toBe(view.getByRole('textbox'));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
		expect(view.queryByRole('textbox')).toBeNull();
		expect(document.activeElement).toBe(view.getByRole('button', { name: i18n.ts._benefits.createCode }));
		expect(mocks.create).not.toHaveBeenCalled();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._benefits.createCode }));
		expect(view.getByRole('textbox')).toHaveProperty('value', '  Autumn event  ');
	});

	test('creates a named code, prevents duplicate submission and retains the result if list reload fails', async () => {
		const pending = Promise.withResolvers<ReturnType<typeof code>>();
		mocks.create.mockReturnValueOnce(pending.promise);
		const view = renderPage();
		await view.findByTestId('benefit-code-code-1');
		await fillForm(view);
		const form = view.container.querySelector('form')!;
		await fireEvent.submit(form);
		await fireEvent.submit(form);
		expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ name: 'Autumn event', amount: 3, maxRedemptions: 50, expiresAt: null });
		expect(view.getByRole('textbox')).toHaveProperty('disabled', true);
		expect(view.emitted('busy')).toEqual([[true]]);
		mocks.list.mockRejectedValueOnce(new Error('offline'));
		pending.resolve(code());
		await view.findByText(i18n.ts._benefits.codeCreated);
		await view.findByText(i18n.ts._benefits.codeLoadFailed);
		expect(view.getByText(code().code)).toBeTruthy();
		expect(view.queryByRole('textbox')).toBeNull();
		expect(document.activeElement?.textContent).toContain(code().code);
		expect(view.emitted('busy')).toEqual([[true], [false]]);
	});

	test.each([
		{ field: 'name', value: '   ' },
		{ field: 'name', value: 'a'.repeat(101) },
		{ field: 'amount', value: '0' },
		{ field: 'amount', value: '1.5' },
		{ field: 'amount', value: '10001' },
		{ field: 'limit', value: '0' },
		{ field: 'limit', value: '1000001' },
	])('rejects invalid $field=$value even on direct form submission', async ({ field, value }) => {
		const view = renderPage();
		await fillForm(view);
		const label = field === 'name' ? i18n.ts._benefits.codeName : field === 'amount' ? i18n.ts._benefits.cardsPerClaim : i18n.ts._benefits.claimLimit;
		await fireEvent.update(view.getByLabelText(label), value);
		await fireEvent.submit(view.container.querySelector('form')!);
		expect(mocks.create).not.toHaveBeenCalled();
		expect(view.getByText(i18n.ts._benefits.invalidCodeConfiguration)).toBeTruthy();
	});

	test('rejects an elapsed expiry and converts a local future expiry to ISO', async () => {
		const view = renderPage();
		await fillForm(view);
		await fireEvent.click(view.getByRole('checkbox', { name: i18n.ts.noExpirationDate }));
		await fireEvent.update(view.getByLabelText(i18n.ts.expirationDate), '2000-01-01T10:00');
		expect(view.getByRole('button', { name: i18n.ts._benefits.createCode })).toHaveProperty('disabled', true);
		await fireEvent.submit(view.container.querySelector('form')!);
		expect(mocks.create).not.toHaveBeenCalled();
		await fireEvent.update(view.getByLabelText(i18n.ts.expirationDate), '2099-01-01T10:00');
		expect(view.getByRole('button', { name: i18n.ts._benefits.createCode })).toHaveProperty('disabled', false);
		await fireEvent.submit(view.container.querySelector('form')!);
		await waitFor(() => expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ name: 'Autumn event', amount: 3, maxRedemptions: 50, expiresAt: new Date('2099-01-01T10:00').toISOString() }));
	});

	test('preserves form values on a rejected creation and permits retry', async () => {
		mocks.create.mockRejectedValueOnce(new Error('offline'));
		const view = renderPage();
		await fillForm(view);
		await fireEvent.submit(view.container.querySelector('form')!);
		await view.findByText(i18n.ts._benefits.codeCreateFailed);
		expect(view.getByRole('textbox')).toHaveProperty('value', '  Autumn event  ');
		await fireEvent.submit(view.container.querySelector('form')!);
		await view.findByText(i18n.ts._benefits.codeCreated);
		expect(mocks.create).toHaveBeenCalledTimes(2);
	});

	test('copies only after clipboard success and reports a refused clipboard write', async () => {
		const view = renderPage();
		await fireEvent.click(await view.findByRole('button', { name: i18n.ts.copy }));
		expect(mocks.copy).toHaveBeenCalledExactlyOnceWith(code().code);
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.copiedToClipboard);
		mocks.copy.mockRejectedValueOnce(new Error('permission denied'));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.copy }));
		await waitFor(() => expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'error', text: i18n.ts._benefits.copyFailed }));
		expect(mocks.toast).toHaveBeenCalledOnce();
	});

	test('paginates codes and offers independent retry and empty states', async () => {
		mocks.list.mockResolvedValueOnce({ total: 21, items: [code()] });
		const view = renderPage();
		await view.findByTestId('benefit-code-code-1');
		mocks.list.mockRejectedValueOnce(new Error('offline'));
		await fireEvent.click(listPanel(view).getByRole('button', { name: i18n.ts._checkin.grantNextPage }));
		await view.findByText(i18n.ts._benefits.codeLoadFailed);
		expect(mocks.list).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
		mocks.list.mockResolvedValueOnce({ total: 0, items: [] });
		await fireEvent.click(listPanel(view).getByRole('button', { name: i18n.ts.retry }));
		await view.findByText(i18n.ts._benefits.codeListEmpty);
		expect(listPanel(view).getByRole('button', { name: i18n.ts._checkin.grantNextPage })).toHaveProperty('disabled', true);
		expect(listPanel(view).getByRole('button', { name: i18n.ts._checkin.grantPreviousPage })).toHaveProperty('disabled', true);
	});

	test('disables and re-enables codes, blocks repeated updates and shows update failures inline', async () => {
		const pending = Promise.withResolvers<ReturnType<typeof code>>();
		mocks.update.mockReturnValueOnce(pending.promise);
		const view = renderPage();
		const button = await view.findByRole('button', { name: i18n.ts._benefits.disableCode });
		await fireEvent.click(button);
		await fireEvent.click(button);
		expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({ type: 'warning', title: i18n.ts._benefits.disableCode, text: i18n.tsx._benefits.disableCodeConfirm({ name: 'Autumn event' }) });
		expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ id: 'code-1', enabled: false });
		expect(button).toHaveProperty('disabled', true);
		mocks.list.mockResolvedValue({ total: 1, items: [code({ enabled: false })] });
		pending.resolve(code({ enabled: false }));
		const enable = await view.findByRole('button', { name: i18n.ts._benefits.enableCode });
		expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._benefits.codeDisabled);
		mocks.update.mockRejectedValueOnce(new Error('offline'));
		await fireEvent.click(enable);
		await view.findByText(i18n.ts._benefits.codeUpdateFailed);
		expect(mocks.update).toHaveBeenLastCalledWith({ id: 'code-1', enabled: true });
		expect(view.getByText(i18n.ts.disabled)).toBeTruthy();
	});

	test('canceling a stop leaves claims enabled without sending an update', async () => {
		mocks.confirm.mockResolvedValueOnce({ canceled: true });
		const view = renderPage();
		await fireEvent.click(await view.findByRole('button', { name: i18n.ts._benefits.disableCode }));
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._benefits.disableCode })).toHaveProperty('disabled', false));
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.toast).not.toHaveBeenCalled();
		expect(mocks.list).toHaveBeenCalledOnce();
	});

	test('does not stop a code after leaving while confirmation is open', async () => {
		const pending = Promise.withResolvers<{ canceled: boolean }>();
		mocks.confirm.mockReturnValueOnce(pending.promise);
		const view = renderPage();
		await fireEvent.click(await view.findByRole('button', { name: i18n.ts._benefits.disableCode }));
		view.unmount();
		pending.resolve({ canceled: false });
		await pending.promise;
		expect(mocks.update).not.toHaveBeenCalled();
	});

	test('distinguishes expired and exhausted codes and prevents ineffective reactivation', async () => {
		mocks.list.mockResolvedValueOnce({ total: 2, items: [code({ expiresAt: '2000-01-01T00:00:00Z' }), code({ id: 'code-2', redemptions: 50, enabled: false })] });
		const view = renderPage();
		await view.findByText(i18n.ts._benefits.codeExpired);
		expect(view.getByText(i18n.ts._benefits.codeExhausted)).toBeTruthy();
		expect(view.getByRole('button', { name: i18n.ts._benefits.disableCode })).toHaveProperty('disabled', true);
		expect(view.getByRole('button', { name: i18n.ts._benefits.enableCode })).toHaveProperty('disabled', true);
	});

	test('paginates code-specific claims, preserves deleted-user rows and retries an empty response', async () => {
		mocks.claims.mockResolvedValueOnce({ total: 21, items: [claim()] });
		const view = renderPage();
		const panel = await openClaims(view);
		const user = await panel.findByRole('link', { name: '@alice' });
		expect(user.getAttribute('href')).toBe('/admin/user/alice');
		mocks.claims.mockResolvedValueOnce({ total: 21, items: [claim({ id: 'deleted', user: null })] });
		await fireEvent.click(panel.getByRole('button', { name: i18n.ts._checkin.grantNextPage }));
		await panel.findByText(i18n.ts.unknown);
		expect(mocks.claims).toHaveBeenLastCalledWith({ codeId: 'code-1', limit: 20, offset: 20 });
		mocks.claims.mockRejectedValueOnce(new Error('offline'));
		await fireEvent.click(panel.getByRole('button', { name: i18n.ts.reload }));
		await panel.findByText(i18n.ts._benefits.claimsLoadFailed);
		mocks.claims.mockResolvedValueOnce({ total: 0, items: [] });
		await fireEvent.click(panel.getByRole('button', { name: i18n.ts.retry }));
		await panel.findByText(i18n.ts._benefits.claimsEmpty);
		expect(panel.getByRole('button', { name: i18n.ts._checkin.grantPreviousPage })).toHaveProperty('disabled', true);
	});

	test('ignores an older claims response after selecting a different code', async () => {
		const pending = Promise.withResolvers<unknown>();
		mocks.list.mockResolvedValueOnce({ total: 2, items: [code(), code({ id: 'code-2', name: 'Winter event' })] });
		mocks.claims.mockReturnValueOnce(pending.promise);
		const view = renderPage();
		await openClaims(view);
		const panel = await openClaims(view, 'Winter event');
		await panel.findByRole('link', { name: '@alice' });
		expect(mocks.claims).toHaveBeenLastCalledWith({ codeId: 'code-2', limit: 20, offset: 0 });
		pending.resolve({ total: 0, items: [] });
		await pending.promise;
		await waitFor(() => expect(panel.queryByText(i18n.ts._benefits.claimsEmpty)).toBeNull());
		expect(panel.getByRole('link', { name: '@alice' })).toBeTruthy();
	});

	test('closes pending claims, restores focus and ignores a late response', async () => {
		const pending = Promise.withResolvers<unknown>();
		mocks.claims.mockReturnValueOnce(pending.promise);
		const view = renderPage();
		const panel = await openClaims(view);
		await fireEvent.click(panel.getByRole('button', { name: i18n.ts.close }));
		expect(view.queryByRole('region', { name: i18n.tsx._benefits.claimsTitle({ name: 'Autumn event' }) })).toBeNull();
		expect(document.activeElement).toBe(view.getByRole('button', { name: i18n.tsx._benefits.claimsTitle({ name: 'Autumn event' }) }));
		pending.resolve({ total: 1, items: [claim()] });
		await pending.promise;
		expect(view.queryByRole('link', { name: '@alice' })).toBeNull();
	});
});
