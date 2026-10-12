/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import type { entities } from 'misskey-js';
import CommunityRanking from '@/pages/community-ranking.vue';
import { ROUTE_DEF } from '@/router.definition.js';
import { Nirax } from '@/lib/nirax.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), signedIn: true }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({
	get $i() { return mocks.signedIn ? { id: 'self', username: 'self', policies: { chatAvailability: 'available' } } : null; },
	iAmAdmin: false, iAmModerator: false,
}));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/pages/timeline.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/_error_.vue', () => ({ default: { render: () => null } }));

type Ranking = entities.UsersRankingResponse;
type RankingItem = Ranking['items'][number];

function entry(id: string, rank = 1, value = 7): RankingItem {
	return { rank, value, user: { id, username: id, name: id, host: null } as RankingItem['user'] };
}

function result(items: RankingItem[], overrides: Partial<Ranking> = {}): Ranking {
	return { type: 'points', items, myRank: null, updatedAt: '2026-10-07T02:00:00.000Z', ...overrides };
}

function pageEntries(start: number, count = 20) {
	return Array.from({ length: count }, (_, index) => entry(`user-${start + index}`, start + index));
}

function renderPage(path = '/community-ranking') {
	const route = ROUTE_DEF.find(candidate => candidate.path === '/community-ranking');
	if (!route) throw new Error('Missing standalone ranking route');
	const router = new Nirax([{ ...route, component: CommunityRanking }], path, mocks.signedIn, { render: () => null });
	const pageActive = ref(true);
	const shell = defineComponent({ setup: () => () => h(CommunityRanking, Object.fromEntries(router.currentRef.value.props)) });
	const view = render(shell, { global: {
		provide: { [DI.pageActive as symbol]: pageActive },
		stubs: {
			PageWithHeader: { template: '<main><slot/></main>' }, MkLoading: true, MkAvatar: true,
			MkA: defineComponent({
				props: ['to'],
				setup: (props, { slots }) => () => h('a', {
					href: props.to,
					onClick: (event: MouseEvent) => { event.preventDefault(); router.pushByPath(props.to); },
				}, slots.default?.()),
			}),
			MkUserName: { props: ['user'], template: '<span>{{ user.username }}</span>' },
		},
	} });
	return { ...view, router, pageActive };
}

beforeEach(() => { vi.clearAllMocks(); mocks.signedIn = true; mocks.api.mockResolvedValue(result([])); });
afterEach(cleanup);

describe('community ranking', () => {
	test('keeps the current podium and its units while loading, then reuses a recently viewed category', async () => {
		const posts = Promise.withResolvers<Ranking>();
		mocks.api.mockResolvedValueOnce(result(pageEntries(1, 4))).mockReturnValueOnce(posts.promise);
		const view = renderPage();
		await waitFor(() => expect(view.getByRole('link', { name: 'user-1' })).toBeTruthy());
		const podium = view.getByRole('list', { name: i18n.ts._communityRanking.podium });
		const winner = within(podium).getAllByRole('listitem')[0];
		await fireEvent.click(view.getByRole('link', { name: i18n.ts._communityRanking.posts }));
		expect(view.getByRole('list', { name: i18n.ts._communityRanking.podium })).toBe(podium);
		expect(within(winner).getByText(i18n.ts._communityRanking.pointsUnit)).toBeTruthy();
		expect(view.getByRole('status').textContent).toContain(i18n.ts._communityRanking.posts);
		posts.resolve(result([entry('post-winner', 1, 88)], { type: 'posts' }));
		await waitFor(() => expect(view.getByRole('link', { name: 'post-winner' })).toBeTruthy());
		expect(within(podium).getAllByRole('listitem')[0]).toBe(winner);
		expect(within(winner).getByText(i18n.ts._communityRanking.postsUnit)).toBeTruthy();
		await fireEvent.click(view.getByRole('link', { name: i18n.ts._communityRanking.points }));
		expect(view.getByRole('link', { name: 'user-1' })).toBeTruthy();
		expect(view.queryByRole('status')).toBeNull();
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('loads a directly addressed category and separates the podium from subsequent ranks', async () => {
		mocks.api.mockResolvedValue(result(pageEntries(1, 4), { type: 'posts', myRank: { rank: 4, value: 7 } }));
		const view = renderPage('/community-ranking?type=posts');
		await waitFor(() => expect(view.getAllByRole('listitem')).toHaveLength(4));
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/ranking', { type: 'posts', offset: 0, limit: 20 });
		const podium = view.getByRole('list', { name: i18n.ts._communityRanking.podium });
		expect(within(podium).getAllByRole('link').map(link => link.textContent)).toEqual(['user-1', 'user-2', 'user-3']);
		const remaining = view.getByRole('list', { name: i18n.ts._communityRanking.posts });
		expect(within(remaining).getAllByRole('listitem')).toHaveLength(1);
		expect(within(remaining).getByRole('link').getAttribute('href')).toBe('/@user-4');
		expect(view.getByText(i18n.ts._communityRanking.myRank).textContent).toContain(i18n.tsx._communityRanking.rankLabel({ rank: 4 }));
		expect(view.getByRole('link', { name: i18n.ts._communityRanking.posts }).getAttribute('aria-current')).toBe('page');
	});

	test('keeps category URLs and restored routes in sync while ignoring older responses', async () => {
		const first = Promise.withResolvers<Ranking>();
		const second = Promise.withResolvers<Ranking>();
		const third = Promise.withResolvers<Ranking>();
		mocks.api.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
		const view = renderPage();
		await fireEvent.click(view.getByRole('link', { name: i18n.ts._communityRanking.replies }));
		expect(view.router.getCurrentFullPath()).toBe('/community-ranking?type=replies');
		await fireEvent.click(view.getByRole('link', { name: i18n.ts._communityRanking.tips }));
		third.resolve(result([entry('tips-winner', 1, 12)], { type: 'tips' }));
		await waitFor(() => expect(view.getByRole('link', { name: 'tips-winner' })).toBeTruthy());
		second.resolve(result([entry('replies-winner')], { type: 'replies' }));
		first.resolve(result([entry('old-winner')]));
		await nextTick();
		await nextTick();
		expect(view.queryByRole('link', { name: 'replies-winner' })).toBeNull();
		expect(view.queryByRole('link', { name: 'old-winner' })).toBeNull();
		expect(view.getByText('12')).toBeTruthy();
		expect(view.getByText(i18n.ts._communityRanking.tipsUnit)).toBeTruthy();
		expect(view.getByText(i18n.ts._communityRanking.tipsRule)).toBeTruthy();
		expect(view.getByRole('link', { name: i18n.ts._communityRanking.tips }).getAttribute('aria-current')).toBe('page');
		mocks.api.mockResolvedValueOnce(result([entry('restored')], { type: 'replies' }));
		view.router.replaceByPath('/community-ranking?type=replies');
		await waitFor(() => expect(view.getByRole('link', { name: 'restored' })).toBeTruthy());
		expect(mocks.api).toHaveBeenLastCalledWith('users/ranking', { type: 'replies', offset: 0, limit: 20 });
		expect(view.getByRole('link', { name: i18n.ts._communityRanking.replies }).getAttribute('aria-current')).toBe('page');
	});

	test('ignores an outdated failure after changing ranking category', async () => {
		const old = Promise.withResolvers<Ranking>();
		mocks.api.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result([entry('current')], { type: 'checkin' }));
		const view = renderPage();
		await fireEvent.click(view.getByRole('link', { name: i18n.ts._communityRanking.checkin }));
		await waitFor(() => expect(view.getByRole('link', { name: 'current' })).toBeTruthy());
		old.reject(new Error('old request failed'));
		await nextTick();
		await nextTick();
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('falls back to points for an unknown category and retries an initial failure', async () => {
		mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(result([entry('recovered')]));
		const view = renderPage('/community-ranking?type=unknown');
		await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByRole('link', { name: 'recovered' })).toBeTruthy());
		expect(view.queryByRole('alert')).toBeNull();
		expect(mocks.api).toHaveBeenLastCalledWith('users/ranking', { type: 'points', offset: 0, limit: 20 });
		expect(view.getByRole('link', { name: i18n.ts._communityRanking.points }).getAttribute('aria-current')).toBe('page');
	});

	test('shows empty rankings without podium or pagination and permits signed-out viewing', async () => {
		mocks.signedIn = false;
		const view = renderPage();
		await waitFor(() => expect(view.getByRole('heading', { name: i18n.ts._communityRanking.noEntries })).toBeTruthy());
		expect(view.getByText(i18n.ts._communityRanking.signInPrompt)).toBeTruthy();
		expect(view.queryByRole('list')).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();
		expect(view.queryByText(i18n.ts._communityRanking.myRank)).toBeNull();
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
		await waitFor(() => expect(view.getByRole('link', { name: 'user-22 @user-22' })).toBeTruthy());
		expect(mocks.api).toHaveBeenLastCalledWith('users/ranking', { type: 'points', offset: 20, limit: 20 });
		expect(view.getAllByRole('listitem')).toHaveLength(22);
		expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('ignores a pending response after leaving and refreshes on return', async () => {
		const pending = Promise.withResolvers<Ranking>();
		mocks.api.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result([entry('returned')]));
		const view = renderPage();
		view.pageActive.value = false;
		await nextTick();
		pending.reject(new Error('left page'));
		await nextTick();
		await nextTick();
		expect(view.queryByRole('alert')).toBeNull();
		view.pageActive.value = true;
		await waitFor(() => expect(view.getByRole('link', { name: 'returned' })).toBeTruthy());
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});
});
