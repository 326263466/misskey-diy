/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { nextTick } from 'vue';
import type { Component } from 'vue';
import FollowingPage from '@/pages/user/following.vue';
import FollowersPage from '@/pages/user/followers.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), list: vi.fn(), popupMenu: vi.fn(), popup: vi.fn(), dispose: vi.fn() }));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ popupMenu: mocks.popupMenu, popup: mocks.popup, contextMenu: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<a><slot/></a>' } }));
vi.mock('@/components/MkUserInfo.vue', () => ({ default: {
	props: ['user'],
	template: '<article>{{ user.username }}</article>',
} }));
vi.mock('@/components/MkPullToRefresh.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkDialog.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class {} }));

const profile = { id: 'profile', username: 'profile', host: null };
const sentinels = new Map<HTMLElement, () => void>();

function relationships(type: 'following' | 'followers', usernames: string[]) {
	return usernames.map(username => ({
		id: username,
		createdAt: '2026-09-01T00:00:00.000Z',
		follower: type === 'followers' ? { id: username, username } : profile,
		followee: type === 'following' ? { id: username, username } : profile,
	}));
}

function renderPage(component: Component) {
	return render(component, {
		props: { acct: 'profile' },
		global: {
			stubs: {
				PageWithHeader: { template: '<div><header><slot name="header-actions"/></header><main><slot/></main></div>' },
				MkLoading: { template: '<div role="status"/>' },
				MkError: true,
				MkResult: true,
			},
			directives: {
				tooltip: () => {},
				'adaptive-border': () => {},
				appear: {
					mounted: (element, binding) => sentinels.set(element, binding.value),
					beforeUnmount: element => sentinels.delete(element),
				},
			},
		},
	});
}

async function chooseOrder(view: ReturnType<typeof render>, current: 'newest' | 'oldest', next: 'newest' | 'oldest') {
	await fireEvent.mouseDown(view.getByText(i18n.ts._order[current]));
	const [items, , options] = mocks.popupMenu.mock.lastCall!;
	const item = items.find((option: { text: string }) => option.text === i18n.ts._order[next]);
	expect(item).toBeDefined();
	item.action();
	options.onClosing();
	await nextTick();
}

async function closeDateDialog(canceled: boolean, result: unknown) {
	const events = mocks.popup.mock.lastCall![2];
	events.done({ canceled, result });
	events.closed();
	await nextTick();
}

describe.each([
	{ type: 'following' as const, component: FollowingPage, endpoint: 'users/following' },
	{ type: 'followers' as const, component: FollowersPage, endpoint: 'users/followers' },
])('$type page controls', ({ type, component, endpoint }) => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.list.mockReset().mockResolvedValue([]);
		mocks.popup.mockReturnValue({ dispose: mocks.dispose });
		mocks.api.mockImplementation(async (path, params) => {
			if (path === 'users/show') return profile;
			if (path === endpoint) return params.limit === 1 ? [] : mocks.list();
			throw new Error(`Unexpected endpoint: ${path}`);
		});
	});

	afterEach(() => {
		cleanup();
		sentinels.clear();
		vi.restoreAllMocks();
	});

	test('has one control group in the header and reloads the displayed list in either order', async () => {
		mocks.list.mockResolvedValueOnce(relationships(type, ['newer', 'older']));
		const view = renderPage(component);
		await waitFor(() => expect(view.getAllByRole('article').map(item => item.textContent)).toEqual(['newer', 'older']));
		const header = within(view.getByRole('banner'));
		expect(view.getAllByText(i18n.ts._order.newest)).toHaveLength(1);
		expect(header.getByText(i18n.ts._order.newest)).toBeTruthy();
		expect(header.getByRole('button', { name: i18n.ts.dateAndTime })).toBeTruthy();
		expect(header.getByRole('button', { name: i18n.ts.reload })).toBeTruthy();
		expect(view.getAllByRole('button')).toHaveLength(2);
		expect(mocks.api).toHaveBeenCalledWith('users/show', { username: 'profile', host: null });
		expect(mocks.api).toHaveBeenCalledWith(endpoint, { userId: 'profile', limit: 20, allowPartial: true });

		const oldest = Array.from({ length: 20 }, (_, index) => `oldest-${index.toString().padStart(2, '0')}`);
		mocks.list.mockResolvedValueOnce(relationships(type, oldest));
		await chooseOrder(view, 'newest', 'oldest');
		await waitFor(() => expect(view.getAllByRole('article').map(item => item.textContent)).toEqual(oldest));
		expect(mocks.api).toHaveBeenCalledWith(endpoint, { userId: 'profile', limit: 20, allowPartial: true, sinceId: '0' });
		expect(sentinels.size).toBe(1);
		mocks.list.mockResolvedValueOnce(relationships(type, ['next-newer']));
		[...sentinels.values()][0]();
		await waitFor(() => expect(view.getAllByRole('article').map(item => item.textContent)).toEqual([...oldest, 'next-newer']));
		expect(mocks.api).toHaveBeenCalledWith(endpoint, { userId: 'profile', limit: 30, sinceId: 'oldest-19' });

		mocks.api.mockClear();
		mocks.list.mockResolvedValueOnce(relationships(type, ['latest']));
		await chooseOrder(view, 'oldest', 'newest');
		await waitFor(() => expect(view.getAllByRole('article').map(item => item.textContent)).toEqual(['latest']));
		expect(mocks.api).toHaveBeenCalledWith(endpoint, { userId: 'profile', limit: 20, allowPartial: true });
		expect(mocks.list).toHaveBeenCalledTimes(4);
	});

	test('applies dates from a dialog without expanding the header and preserves them on cancel and refresh', async () => {
		const now = new Date(2026, 8, 22, 12).getTime();
		vi.spyOn(Date, 'now').mockReturnValue(now);
		mocks.list.mockResolvedValueOnce(relationships(type, ['initial']));
		const view = renderPage(component);
		await waitFor(() => expect(view.getByRole('article').textContent).toBe('initial'));
		const calendar = view.getByRole('button', { name: i18n.ts.dateAndTime });

		mocks.api.mockClear();
		await fireEvent.click(calendar);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.getByRole('banner').querySelector('input')).toBeNull();
		expect(mocks.popup.mock.lastCall![1]).toEqual({
			title: i18n.ts.dateAndTime,
			input: { type: 'date', default: '2026-09-22' },
			okText: i18n.ts.apply,
		});
		await closeDateDialog(true, '2026-09-01');
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.queryByRole('button', { name: i18n.ts.clear })).toBeNull();
		expect(view.getByRole('article').textContent).toBe('initial');

		await fireEvent.click(calendar);
		mocks.list.mockResolvedValueOnce(relationships(type, ['before-date']));
		await closeDateDialog(false, '2026-09-01');
		await waitFor(() => expect(view.getByRole('article').textContent).toBe('before-date'));
		const date = new Date('2026-09-01T00:00:00').getTime();
		expect(mocks.api).toHaveBeenCalledWith(endpoint, expect.objectContaining({ userId: 'profile', untilDate: date }));
		expect(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` })).toBe(calendar);
		expect(view.getByRole('banner').querySelector('input')).toBeNull();

		mocks.api.mockClear();
		await fireEvent.click(calendar);
		expect(mocks.popup.mock.lastCall![1].input).toEqual({ type: 'date', default: '2026-09-01' });
		await closeDateDialog(true, '2026-09-02');
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.getByRole('article').textContent).toBe('before-date');
		expect(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` })).toBe(calendar);

		mocks.api.mockClear();
		mocks.list.mockResolvedValueOnce(relationships(type, ['refreshed']));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.reload }));
		await waitFor(() => expect(view.getByRole('article').textContent).toBe('refreshed'));
		expect(mocks.api).toHaveBeenCalledWith(endpoint, expect.objectContaining({ userId: 'profile', untilDate: date }));

		mocks.api.mockClear();
		mocks.list.mockResolvedValueOnce(relationships(type, ['unfiltered']));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.clear }));
		await waitFor(() => expect(view.getByRole('article').textContent).toBe('unfiltered'));
		expect(view.queryByRole('button', { name: i18n.ts.clear })).toBeNull();
		expect(view.getByRole('button', { name: i18n.ts.dateAndTime })).toBe(calendar);
		expect(mocks.api).toHaveBeenCalledWith(endpoint, { userId: 'profile', limit: 20, allowPartial: true });
	});

	test('ignores invalid date results and lets an empty confirmation clear the filter', async () => {
		mocks.list.mockResolvedValueOnce(relationships(type, ['initial']));
		const view = renderPage(component);
		await waitFor(() => expect(view.getByRole('article').textContent).toBe('initial'));
		const calendar = view.getByRole('button', { name: i18n.ts.dateAndTime });
		await fireEvent.click(calendar);
		mocks.list.mockResolvedValueOnce(relationships(type, ['filtered']));
		await closeDateDialog(false, '2026-09-01');
		await waitFor(() => expect(view.getByRole('article').textContent).toBe('filtered'));

		mocks.api.mockClear();
		for (const invalid of ['not-a-date', 123]) {
			await fireEvent.click(calendar);
			await closeDateDialog(false, invalid);
			expect(mocks.api).not.toHaveBeenCalled();
			expect(view.getByRole('article').textContent).toBe('filtered');
			expect(view.getByRole('button', { name: `${i18n.ts.dateAndTime}: 2026-09-01` })).toBe(calendar);
		}

		await fireEvent.click(calendar);
		mocks.list.mockResolvedValueOnce(relationships(type, ['unfiltered']));
		await closeDateDialog(false, '');
		await waitFor(() => expect(view.getByRole('article').textContent).toBe('unfiltered'));
		expect(view.queryByRole('button', { name: i18n.ts.clear })).toBeNull();
		expect(mocks.api).toHaveBeenCalledWith(endpoint, { userId: 'profile', limit: 20, allowPartial: true });
	});
});
