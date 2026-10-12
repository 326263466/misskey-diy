/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import AppsSettings from '@/pages/settings/apps.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), api: vi.fn(), reload: vi.fn(), toast: vi.fn() }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, apiWithDialog: mocks.api, toast: mocks.toast }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/utility/paginator.js', () => ({ Paginator: class { reload = mocks.reload; } }));
vi.mock('@/components/MkPagination.vue', () => ({ default: {
	setup: () => ({ items: [{ id: 'app', name: 'Client', permission: [], createdAt: '2026-09-01' }] }),
	template: '<div><slot :items="items"/></div>',
} }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { template: '<div><slot name="label"/><slot/><slot name="footer"/></div>' } }));
vi.mock('@/components/MkKeyValue.vue', () => ({ default: { template: '<div><slot name="key"/><slot name="value"/></div>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: {
	props: ['wait'],
	emits: ['click'],
	template: '<button :disabled="wait" @click="$emit(\'click\', $event)"><slot/></button>',
} }));

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

test('keeps application authorization when the deletion confirmation is canceled', async () => {
	mocks.confirm.mockResolvedValueOnce({ canceled: true });
	const view = render(AppsSettings);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.delete }));
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
	expect(mocks.api).not.toHaveBeenCalled();
	expect(mocks.reload).not.toHaveBeenCalled();
});

test('waits for revocation before refreshing the list and suppresses duplicate requests', async () => {
	mocks.confirm.mockResolvedValue({ canceled: false });
	const response = Promise.withResolvers<void>();
	mocks.api.mockReturnValueOnce(response.promise);
	const view = render(AppsSettings);
	const button = view.getByRole('button', { name: i18n.ts.delete }) as HTMLButtonElement;
	await fireEvent.click(button);
	await waitFor(() => expect(button.disabled).toBe(true));
	await fireEvent.click(button);
	expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/revoke-token', { tokenId: 'app' });
	expect(mocks.reload).not.toHaveBeenCalled();
	response.resolve();
	await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
	expect(button.disabled).toBe(false);
	expect(mocks.toast).not.toHaveBeenCalled();
});

test('keeps the list on failed revocation and restores the button for retry', async () => {
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.api.mockRejectedValueOnce(new Error('offline'));
	const view = render(AppsSettings);
	const button = view.getByRole('button', { name: i18n.ts.delete }) as HTMLButtonElement;
	await fireEvent.click(button);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	await waitFor(() => expect(button.disabled).toBe(false));
	expect(mocks.reload).not.toHaveBeenCalled();
	mocks.api.mockResolvedValueOnce(undefined);
	await fireEvent.click(button);
	await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
	expect(mocks.api).toHaveBeenCalledTimes(2);
	expect(mocks.toast).not.toHaveBeenCalled();
});
