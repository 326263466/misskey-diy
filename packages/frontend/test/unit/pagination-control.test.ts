/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/vue';
import { defineComponent, markRaw, nextTick, ref, shallowRef } from 'vue';
import type { IPaginator } from '@/utility/paginator.js';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ popup: vi.fn(), dispose: vi.fn() }));

vi.mock('@/os.js', () => ({ popup: mocks.popup }));
vi.mock('@/components/MkDialog.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: {
	props: ['active'],
	template: '<button type="button" :aria-pressed="active"><slot/></button>',
} }));
vi.mock('@/components/MkSelect.vue', () => ({ default: {
	props: ['modelValue', 'items', 'small'],
	emits: ['update:modelValue'],
	template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
} }));

function createPaginator(options: { order?: 'newest' | 'oldest'; date?: number | null; search?: string | null; canSearch?: boolean } = {}) {
	return markRaw({
		items: ref([]),
		queuedAheadItemsCount: ref(0),
		fetching: ref(false),
		fetchingOlder: ref(false),
		fetchingNewer: ref(false),
		canFetchOlder: ref(false),
		canFetchNewer: ref(false),
		canSearch: options.canSearch ?? true,
		error: ref(false),
		computedParams: null,
		initialId: null,
		initialDate: options.date ?? null,
		initialDirection: options.order === 'oldest' ? 'newer' as const : 'older' as const,
		noPaging: false,
		searchQuery: ref(options.search ?? null),
		order: ref(options.order ?? 'newest'),
		init: vi.fn().mockResolvedValue(undefined),
		reload: vi.fn().mockResolvedValue(undefined),
		fetchOlder: vi.fn().mockResolvedValue(undefined),
		fetchNewer: vi.fn().mockResolvedValue(undefined),
		trim: vi.fn(),
		unshiftItems: vi.fn(),
		pushItems: vi.fn(),
		prepend: vi.fn(),
		enqueue: vi.fn(),
		releaseQueue: vi.fn(),
		removeItem: vi.fn(),
		updateItem: vi.fn(),
	} satisfies IPaginator);
}

function renderControls(paginator: IPaginator, header?: string) {
	const current = shallowRef(paginator);
	const host = defineComponent({
		components: { MkPaginationControl },
		setup: () => ({ paginator: current }),
		template: '<MkPaginationControl :paginator="paginator"><template v-if="$slots.header" #header><slot name="header"/></template></MkPaginationControl>',
	});
	const view = render(host, {
		slots: header ? { header } : {},
		global: { directives: { tooltip: () => {} } },
	});
	return {
		...view,
		async switchPaginator(next: IPaginator) {
			current.value = next;
			await nextTick();
		},
	};
}

function dialogEvents(): { done: (result: { canceled: boolean; result: unknown }) => void; closed: () => void } {
	return mocks.popup.mock.lastCall![2];
}

async function closeDialog(canceled: boolean, result: unknown, events = dialogEvents()) {
	events.done({ canceled, result });
	events.closed();
	await nextTick();
}

const firstDate = new Date('2026-09-01T00:00:00').getTime();
const secondDate = new Date('2026-09-12T00:00:00').getTime();

describe('pagination controls', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.popup.mockReturnValue({ dispose: mocks.dispose });
	});

	afterEach(cleanup);

	test('displays existing order, date and search without reloading the list', async () => {
		const paginator = createPaginator({ order: 'oldest', date: firstDate, search: 'existing query' });
		const view = renderControls(paginator);
		await nextTick();

		expect(view.getByRole('combobox')).toHaveProperty('value', 'oldest');
		expect(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` }).getAttribute('aria-pressed')).toBe('true');
		expect(view.getByRole('button', { name: `${i18n.ts.search}: existing query` }).getAttribute('aria-pressed')).toBe('true');
		expect(view.getByRole('button', { name: i18n.ts.clear })).toBeTruthy();
		expect(paginator.initialDate).toBe(firstDate);
		expect(paginator.searchQuery.value).toBe('existing query');
		expect(paginator.reload).not.toHaveBeenCalled();
		expect(mocks.popup).not.toHaveBeenCalled();
	});

	test('switches to each paginator state without changing or reloading either list', async () => {
		const first = createPaginator({ order: 'oldest', date: firstDate, search: 'first query' });
		const second = createPaginator();
		const view = renderControls(first);
		await view.switchPaginator(second);

		expect(view.getByRole('combobox')).toHaveProperty('value', 'newest');
		expect(view.getByRole('button', { name: i18n.ts.dateAndTime }).getAttribute('aria-pressed')).toBe('false');
		expect(view.getByRole('button', { name: i18n.ts.search }).getAttribute('aria-pressed')).toBe('false');
		expect(view.queryByRole('button', { name: i18n.ts.clear })).toBeNull();

		await view.switchPaginator(first);
		expect(view.getByRole('combobox')).toHaveProperty('value', 'oldest');
		expect(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` })).toBeTruthy();
		expect(view.getByRole('button', { name: `${i18n.ts.search}: first query` })).toBeTruthy();
		expect(first.reload).not.toHaveBeenCalled();
		expect(second.reload).not.toHaveBeenCalled();
	});

	test('changes order and paging direction only for the displayed list', async () => {
		const first = createPaginator();
		const second = createPaginator({ order: 'oldest' });
		const view = renderControls(first);
		await fireEvent.update(view.getByRole('combobox'), 'oldest');
		expect(first.order.value).toBe('oldest');
		expect(first.initialDirection).toBe('newer');
		expect(first.reload).toHaveBeenCalledTimes(1);
		await fireEvent.change(view.getByRole('combobox'));
		expect(first.reload).toHaveBeenCalledTimes(1);

		await view.switchPaginator(second);
		await fireEvent.update(view.getByRole('combobox'), 'newest');
		expect(second.order.value).toBe('newest');
		expect(second.initialDirection).toBe('older');
		expect(second.reload).toHaveBeenCalledTimes(1);
		expect(first.order.value).toBe('oldest');
		expect(first.reload).toHaveBeenCalledTimes(1);
	});

	test('opens dates in a dialog, preserves cancellation, and applies then clears a date', async () => {
		const paginator = createPaginator({ date: firstDate });
		const view = renderControls(paginator);
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` }));
		expect(mocks.popup.mock.lastCall![1]).toEqual({
			title: i18n.ts.dateAndTime,
			input: { type: 'date', default: '2026-09-01' },
			okText: i18n.ts.apply,
		});
		expect(view.container.querySelector('input')).toBeNull();
		await closeDialog(true, '2026-09-12');
		expect(paginator.initialDate).toBe(firstDate);
		expect(paginator.reload).not.toHaveBeenCalled();

		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` }));
		await closeDialog(false, '2026-09-12');
		expect(paginator.initialDate).toBe(secondDate);
		expect(paginator.reload).toHaveBeenCalledTimes(1);
		expect(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-12` })).toBeTruthy();
		expect(view.container.querySelector('input')).toBeNull();

		await fireEvent.click(view.getByRole('button', { name: i18n.ts.clear }));
		expect(paginator.initialDate).toBeNull();
		expect(paginator.reload).toHaveBeenCalledTimes(2);
		expect(view.getByRole('button', { name: i18n.ts.dateAndTime })).toBeTruthy();
		expect(view.queryByRole('button', { name: i18n.ts.clear })).toBeNull();
		expect(mocks.dispose).toHaveBeenCalledTimes(2);
	});

	test.each(['', null])('clears a date when the dialog confirms %j', async result => {
		const paginator = createPaginator({ date: firstDate });
		const view = renderControls(paginator);
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` }));
		await closeDialog(false, result);
		expect(paginator.initialDate).toBeNull();
		expect(paginator.reload).toHaveBeenCalledTimes(1);
		expect(view.queryByRole('button', { name: i18n.ts.clear })).toBeNull();
	});

	test.each(['2026-09-01', 'not-a-date', 123])('does not reload for an unchanged or invalid date %j', async result => {
		const paginator = createPaginator({ date: firstDate });
		const view = renderControls(paginator);
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` }));
		await closeDialog(false, result);
		expect(paginator.initialDate).toBe(firstDate);
		expect(paginator.reload).not.toHaveBeenCalled();
	});

	test('applies an open date dialog to its original paginator after switching tabs', async () => {
		const first = createPaginator({ date: firstDate });
		const second = createPaginator();
		const view = renderControls(first);
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` }));
		const events = dialogEvents();
		await view.switchPaginator(second);
		await closeDialog(false, '2026-09-12', events);

		expect(first.initialDate).toBe(secondDate);
		expect(first.reload).toHaveBeenCalledTimes(1);
		expect(second.initialDate).toBeNull();
		expect(second.reload).not.toHaveBeenCalled();
		expect(view.getByRole('button', { name: i18n.ts.dateAndTime })).toBeTruthy();
		expect(view.queryByRole('button', { name: i18n.ts.clear })).toBeNull();

		await view.switchPaginator(first);
		expect(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-12` })).toBeTruthy();
		expect(first.reload).toHaveBeenCalledTimes(1);
	});

	test('searches through a dialog without expanding inline inputs and preserves canceled changes', async () => {
		const paginator = createPaginator({ search: 'saved query' });
		const view = renderControls(paginator);
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.search}: saved query` }));
		expect(mocks.popup.mock.lastCall![1]).toEqual({
			title: i18n.ts.search,
			input: { type: 'text', default: 'saved query' },
			okText: i18n.ts.apply,
		});
		expect(view.queryByRole('textbox')).toBeNull();
		await closeDialog(true, 'canceled query');
		expect(paginator.searchQuery.value).toBe('saved query');
		expect(paginator.reload).not.toHaveBeenCalled();

		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.search}: saved query` }));
		await closeDialog(false, '  new query  ');
		expect(paginator.searchQuery.value).toBe('new query');
		expect(paginator.reload).toHaveBeenCalledTimes(1);
		expect(view.getByRole('button', { name: `${i18n.ts.search}: new query` })).toBeTruthy();
		expect(view.queryByRole('textbox')).toBeNull();

		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.search}: new query` }));
		await closeDialog(false, '   ');
		expect(paginator.searchQuery.value).toBeNull();
		expect(paginator.reload).toHaveBeenCalledTimes(2);
		expect(view.getByRole('button', { name: i18n.ts.search }).getAttribute('aria-pressed')).toBe('false');
	});

	test('keeps search results with the original paginator when switching tabs while its dialog is open', async () => {
		const first = createPaginator({ search: 'first query' });
		const second = createPaginator({ search: 'second query' });
		const view = renderControls(first);
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.search}: first query` }));
		const events = dialogEvents();
		await view.switchPaginator(second);
		await closeDialog(false, 'changed first query', events);

		expect(first.searchQuery.value).toBe('changed first query');
		expect(first.reload).toHaveBeenCalledTimes(1);
		expect(second.searchQuery.value).toBe('second query');
		expect(second.reload).not.toHaveBeenCalled();
		expect(view.getByRole('button', { name: `${i18n.ts.search}: second query` })).toBeTruthy();
	});

	test('renders header tabs and a single group of controls', async () => {
		const paginator = createPaginator();
		const view = renderControls(paginator, '<nav aria-label="List tabs"><button type="button">Following</button><button type="button">Followers</button></nav>');
		const tabs = within(view.getByRole('navigation', { name: 'List tabs' }));
		expect(tabs.getByRole('button', { name: 'Following' })).toBeTruthy();
		expect(tabs.getByRole('button', { name: 'Followers' })).toBeTruthy();
		expect(view.getAllByRole('combobox')).toHaveLength(1);
		expect(view.getAllByRole('button', { name: i18n.ts.search })).toHaveLength(1);
		expect(view.getAllByRole('button', { name: i18n.ts.dateAndTime })).toHaveLength(1);
		expect(view.getAllByRole('button', { name: i18n.ts.reload })).toHaveLength(1);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.reload }));
		expect(paginator.reload).toHaveBeenCalledTimes(1);
	});
});
