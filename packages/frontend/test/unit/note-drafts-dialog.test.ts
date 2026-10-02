/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkNoteDraftsDialog from '@/components/MkNoteDraftsDialog.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ contextMenu: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { policies: { noteDraftLimit: 10 } } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, enablePullToRefresh: true } } }));
vi.mock('@/components/MkPullToRefresh.vue', () => ({ default: { template: '<div data-testid="pull-to-refresh"><slot/></div>' } }));
vi.mock('@/components/MkPaginationControl.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<div/>' } }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

function renderDialog(scheduled = false) {
	return render(MkNoteDraftsDialog, {
		props: { scheduled },
		global: {
			directives: { tooltip: () => {}, panel: () => {} },
			stubs: {
				MkModalWindow: { emits: ['click', 'close', 'closed', 'esc'], template: '<div><header><slot name="header"/><slot name="headerActions"/></header><slot/></div>' },
				MkTime: true, I18n: true, Mfm: true, MkAcct: true,
				MkError: { template: '<button @click="$emit(\'retry\')">Retry</button>' },
				MkLoading: { template: '<div data-testid="loading-spinner"/>' },
				MkResult: { props: ['text'], template: '<div data-testid="empty-result">{{ text }}</div>' },
			},
		},
	});
}

test.each([false, true])('waits for the requested list before opening without tabs or loading spinners (scheduled: %s)', async scheduled => {
	let finish!: (value: []) => void;
	mocks.api.mockImplementation((endpoint: string) => endpoint === 'notes/drafts/count'
		? Promise.resolve(0)
		: new Promise(resolve => { finish = resolve; }));
	const view = renderDialog(scheduled);
	expect(view.container.querySelector('header')).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts.drafts })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts.scheduled })).toBeNull();
	expect(view.queryByTestId('loading-spinner')).toBeNull();
	expect(view.queryByTestId('pull-to-refresh')).toBeNull();
	expect(view.queryByTestId('empty-result')).toBeNull();
	expect(mocks.api).toHaveBeenCalledWith('notes/drafts/list', expect.objectContaining({ scheduled }));
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'notes/drafts/list')).toHaveLength(1);
	finish([]);
	await waitFor(() => expect(view.getByTestId('empty-result').textContent).toBe(scheduled ? i18n.ts.nothing : i18n.ts._drafts.noDrafts));
	expect(view.getByText(`${scheduled ? i18n.ts.scheduled : i18n.ts.drafts} (0/10)`)).toBeTruthy();
	expect(view.queryByRole('button', { name: i18n.ts.drafts })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts.scheduled })).toBeNull();
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'notes/drafts/list')).toHaveLength(1);
	expect(view.queryByTestId('loading-spinner')).toBeNull();
});

test('opens a retryable error without a spinner when the initial list request fails', async () => {
	mocks.api.mockImplementation((endpoint: string) => endpoint === 'notes/drafts/count' ? Promise.resolve(0) : Promise.reject(new Error('offline')));
	const view = renderDialog();
	await waitFor(() => expect(view.getByRole('button', { name: 'Retry' })).toBeTruthy());
	expect(view.queryByTestId('loading-spinner')).toBeNull();
	mocks.api.mockResolvedValue([]);
	await fireEvent.click(view.getByRole('button', { name: 'Retry' }));
	await waitFor(() => expect(view.getByTestId('empty-result')).toBeTruthy());
});

test('opens the list even when the optional quota count fails', async () => {
	mocks.api.mockImplementation((endpoint: string) => endpoint === 'notes/drafts/count' ? Promise.reject(new Error('offline')) : Promise.resolve([]));
	const view = renderDialog();
	await waitFor(() => expect(view.getByTestId('empty-result')).toBeTruthy());
	expect(view.container.querySelector('header')?.textContent?.trim()).toBe(i18n.ts.drafts);
});
