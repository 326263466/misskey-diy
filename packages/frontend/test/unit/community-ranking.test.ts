/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { nextTick } from 'vue';
import type { entities } from 'misskey-js';
import CommunityRanking from '@/pages/community-ranking.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), signedIn: true }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ get $i() { return mocks.signedIn ? { id: 'self', username: 'self' } : null; } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/composables/use-checkin-status.js', async () => {
	const { ref } = await import('vue');
	return { useCheckinStatus: () => ({ checkedInToday: ref(false) }) };
});
vi.mock('@/components/MkCommunityHub.vue', () => ({ default: { template: '<main><slot/></main>' } }));
vi.mock('@/components/MkFollowButton.vue', () => ({ default: { props: ['user'], template: '<button :data-follow-user="user.id">Follow {{ user.username }}</button>' } }));

type Ranking = entities.CheckinRankingResponse;
type RankingItem = Ranking['items'][number];

function entry(id: string, rank = 1, days = 7): RankingItem {
	return { rank, days, user: { id, username: id, name: id, host: null, isFollowing: false } as RankingItem['user'] };
}

function result(items: RankingItem[], overrides: Partial<Ranking> = {}): Ranking {
	return { timeZone: 'Asia/Shanghai', today: '2026-09-28', month: '2026-09', type: 'consecutive', items, myRank: null, ...overrides };
}

function pageEntries(start: number, count = 20) {
	return Array.from({ length: count }, (_, index) => entry(`user-${start + index}`, start + index));
}

function renderPage() {
	return render(CommunityRanking, { global: { stubs: {
		PageWithHeader: { template: '<div><slot/></div>' }, MkLoading: true, MkAvatar: true,
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		MkUserName: { props: ['user'], template: '<span>{{ user.username }}</span>' },
	} } });
}

beforeEach(() => { vi.clearAllMocks(); mocks.signedIn = true; mocks.api.mockResolvedValue(result([])); });
afterEach(cleanup);

describe('community check-in ranking', () => {
	test('shows the current user rank without a self-follow action', async () => {
		mocks.api.mockResolvedValue(result([entry('self'), entry('other', 2)], { myRank: { rank: 1, days: 7 } }));
		const view = renderPage();
		await waitFor(() => expect(view.getByRole('table')).toBeTruthy());
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('checkin/ranking', { type: 'consecutive', offset: 0, limit: 20 });
		const selfRow = view.getByRole('link', { name: 'self' }).closest('tr')!;
		expect(within(selfRow).queryByRole('button')).toBeNull();
		expect(view.getByRole('button', { name: 'Follow other' })).toBeTruthy();
		expect(view.container.querySelector('[data-follow-user="self"]')).toBeNull();
		expect(view.getByText(i18n.ts._checkin.myRank).textContent).toContain('1');
	});

	test('does not allow an older ranking response to replace the selected category', async () => {
		const first = Promise.withResolvers<Ranking>();
		const second = Promise.withResolvers<Ranking>();
		const third = Promise.withResolvers<Ranking>();
		mocks.api.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
		const view = renderPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.totalRanking }));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.monthlyRanking }));
		third.resolve(result([entry('monthly-winner')], { type: 'monthly' }));
		await waitFor(() => expect(view.getByRole('link', { name: 'monthly-winner' })).toBeTruthy());
		second.resolve(result([entry('total-winner')], { type: 'total' }));
		first.resolve(result([entry('old-winner')]));
		await nextTick();
		await nextTick();
		expect(view.queryByRole('link', { name: 'total-winner' })).toBeNull();
		expect(view.queryByRole('link', { name: 'old-winner' })).toBeNull();
		expect(view.getByRole('link', { name: 'monthly-winner' })).toBeTruthy();
		expect(view.getByRole('button', { name: i18n.ts._checkin.monthlyRanking }).getAttribute('aria-pressed')).toBe('true');
		expect(mocks.api).toHaveBeenLastCalledWith('checkin/ranking', { type: 'monthly', offset: 0, limit: 20 });
	});

	test('ignores an outdated failure after changing ranking category', async () => {
		const old = Promise.withResolvers<Ranking>();
		mocks.api.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result([entry('current')], { type: 'total' }));
		const view = renderPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.totalRanking }));
		await waitFor(() => expect(view.getByRole('link', { name: 'current' })).toBeTruthy());
		old.reject(new Error('old request failed'));
		await nextTick();
		await nextTick();
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('shows an initial error and retries the selected category', async () => {
		mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(result([entry('recovered')]));
		const view = renderPage();
		await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByRole('link', { name: 'recovered' })).toBeTruthy());
		expect(view.queryByRole('alert')).toBeNull();
		expect(mocks.api).toHaveBeenLastCalledWith('checkin/ranking', { type: 'consecutive', offset: 0, limit: 20 });
	});

	test('shows empty rankings without a table or pagination and permits signed-out viewing', async () => {
		mocks.signedIn = false;
		const view = renderPage();
		await waitFor(() => expect(view.getByRole('heading', { name: i18n.ts._checkin.noEntries })).toBeTruthy());
		expect(view.getByText(i18n.ts._checkin.signInPrompt)).toBeTruthy();
		expect(view.queryByRole('table')).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();
		expect(view.queryByText(i18n.ts._checkin.myRank)).toBeNull();
	});

	test('appends pages and retries a failed offset without losing the earlier entries', async () => {
		const page = Promise.withResolvers<Ranking>();
		mocks.api.mockResolvedValueOnce(result(pageEntries(1))).mockReturnValueOnce(page.promise).mockResolvedValueOnce(result(pageEntries(21, 2)));
		const view = renderPage();
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts.loadMore })).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		expect((view.getByRole('button', { name: i18n.ts.loading }) as HTMLButtonElement).disabled).toBe(true);
		page.reject(new Error('page failed'));
		await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
		expect(view.getByRole('link', { name: 'user-1' })).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByRole('link', { name: 'user-22' })).toBeTruthy());
		expect(mocks.api).toHaveBeenLastCalledWith('checkin/ranking', { type: 'consecutive', offset: 20, limit: 20 });
		expect(view.getAllByRole('row')).toHaveLength(23);
		expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('discards older pages and reloads from the start if the server date changes', async () => {
		mocks.api.mockResolvedValueOnce(result(pageEntries(1))).mockResolvedValueOnce(result(pageEntries(21), { today: '2026-10-01', month: '2026-10' })).mockResolvedValueOnce(result([entry('new-month')], { today: '2026-10-01', month: '2026-10' }));
		const view = renderPage();
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts.loadMore })).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await waitFor(() => expect(view.getByRole('link', { name: 'new-month' })).toBeTruthy());
		expect(mocks.api).toHaveBeenLastCalledWith('checkin/ranking', { type: 'consecutive', offset: 0, limit: 20 });
		expect(view.queryByRole('link', { name: 'user-1' })).toBeNull();
		expect(view.queryByRole('link', { name: 'user-21' })).toBeNull();
	});
});
