/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import UserPage from '@/pages/user/index.vue';
import UserContent from '@/pages/user/content.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import MkUserInfo from '@/components/MkUserInfo.vue';
import { publishUserProfileUpdate } from '@/composables/use-user-profile.js';
import { Nirax } from '@/lib/nirax.js';
import { DI } from '@/di.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), definePage: vi.fn() }));

vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/page.js', () => ({ definePage: mocks.definePage }));
vi.mock('@/router.js', async () => {
	const { inject } = await import('vue');
	const { DI } = await import('@/di.js');
	return { useRouter: () => inject(DI.router) };
});
vi.mock('@/server-context.js', () => ({ serverContext: null, assertServerContext: () => false }));
vi.mock('@/composables/use-scroll-position-keeper.js', () => ({ useScrollPositionKeeper: vi.fn() }));
vi.mock('@/composables/use-user-statistics.js', () => ({ useUserStatistics: vi.fn() }));
vi.mock('@/composables/use-user-statistics-visibility.js', () => ({ useUserStatisticsVisibility: vi.fn() }));
vi.mock('@/components/MkFollowButton.vue', () => ({ default: { template: '<button/>' } }));
vi.mock('@/pages/user/home.vue', () => ({ __esModule: true, default: {
	props: ['user'],
	template: '<section><h1>{{ user.name }}</h1><p>{{ user.description }}</p><p>{{ user.company }}</p><p>{{ user.jobTitle }}</p></section>',
} }));

const global = {
	components: { NestedRouterView },
	directives: { tooltip: {} },
	stubs: {
		PageWithHeader: { template: '<main><slot/></main>' },
		MkA: { template: '<a><slot/></a>' },
		MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
		MkAvatar: true, MkAcct: true, MkLoading: true, MkError: true,
	},
};

function renderProfile() {
	const router = new Nirax([{
		path: '/@:acct',
		component: UserPage,
		children: [{ path: '/:page?', component: UserContent }],
	}], '/@alice', false, UserPage);
	return render(UserPage, {
		props: { acct: 'alice' },
		global: {
			...global,
			provide: { [DI.router as symbol]: router, [DI.routerCurrentDepth as symbol]: 1 },
		},
	});
}

function profile(id: string): Misskey.entities.UserDetailed {
	return {
		id, username: 'alice', host: null, name: 'Old name', description: 'Old bio',
		company: 'Old Company', jobTitle: 'Old job', bannerUrl: null,
	} as Misskey.entities.UserDetailed;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal('ResizeObserver', class {
		observe() {}
		disconnect() {}
	});
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('confirmed profile updates in page and cards', () => {
	test('refreshes a mounted homepage and its title without requesting the user again', async () => {
		const snapshot = profile('saved-profile-page');
		mocks.api.mockResolvedValue(snapshot);
		const view = renderProfile();
		await waitFor(() => expect(view.getByText('Old bio')).toBeTruthy());
		publishUserProfileUpdate(snapshot.id, { name: 'New name', description: 'New bio', company: 'New Company', jobTitle: 'Designer' });
		await nextTick();
		expect(view.getByText('New name')).toBeTruthy();
		expect(view.getByText('New bio')).toBeTruthy();
		expect(view.getByText('New Company')).toBeTruthy();
		expect(view.getByText('Designer')).toBeTruthy();
		expect(mocks.definePage.mock.calls[0][0]().title).toBe('New name (@alice)');
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('uses saved data when navigating to a homepage returning an older snapshot', async () => {
		const snapshot = profile('saved-profile-navigation');
		publishUserProfileUpdate(snapshot.id, { name: 'Saved name', company: 'Saved Company', jobTitle: null });
		mocks.api.mockResolvedValue(snapshot);
		const view = renderProfile();
		await waitFor(() => expect(view.getByText('Saved name')).toBeTruthy());
		expect(view.getByText('Saved Company')).toBeTruthy();
		expect(view.queryByText('Old job')).toBeNull();
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('updates a mounted user card and removes cleared values without mutating its source', async () => {
		const snapshot = profile('saved-profile-card');
		const view = render(MkUserInfo, { props: { user: snapshot }, global });
		publishUserProfileUpdate(snapshot.id, { name: 'New name', description: 'New bio', company: null, jobTitle: 'Designer', bannerUrl: 'https://example.test/banner.png' });
		await nextTick();
		expect(view.getByText('New name')).toBeTruthy();
		expect(view.getByText('New bio')).toBeTruthy();
		expect(view.getByText('Designer')).toBeTruthy();
		expect(view.queryByText('Old Company')).toBeNull();
		expect(view.container.innerHTML).toContain('https://example.test/banner.png');
		expect(snapshot.company).toBe('Old Company');
		expect(mocks.api).not.toHaveBeenCalled();
		await view.rerender({ user: profile('another-user') });
		expect(view.getByText('Old name')).toBeTruthy();
		expect(view.getByText('Old Company')).toBeTruthy();
	});
});
