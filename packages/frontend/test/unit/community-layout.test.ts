/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, inject } from 'vue';
import Community from '@/pages/community.vue';
import MkCommunityHub from '@/components/MkCommunityHub.vue';
import RouterView from '@/components/global/RouterView.vue';
import StackingRouterView from '@/components/global/StackingRouterView.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { DI } from '@/di.js';
import type { Router } from '@/router.js';

vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, numberOfPageCache: 4 } } }));
vi.mock('@/i.js', () => ({ $i: { id: 'self', policies: {} }, iAmAdmin: false, iAmModerator: false }));
vi.mock('@/pages/timeline.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/pages/_error_.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/router.js', () => ({ useRouter: () => inject(DI.router) }));
vi.mock('@/components/MkSuperMenu.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/pages/_loading_.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { communityRanking: 'Ranking', achievements: 'Achievements', _checkin: { dailyCheckin: 'Checkin' }, _benefits: { title: 'Benefits' } } } }));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const paths = ['/checkin', '/community-ranking', '/my/achievements', '/my/benefits'];

test.each([RouterView, StackingRouterView].flatMap(view => paths.map(initialPath => ({ view, initialPath }))))('keeps the sidebar when opening $initialPath and switching pages (%#)', async ({ view, initialPath }) => {
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1200);
	vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
	const names = ['checkin', 'ranking', 'achievements', 'benefits'] as const;
	const parent = ROUTE_DEF.find(route => 'name' in route && route.name === 'community')!;
	if (!('children' in parent)) throw new Error('Missing community child routes');
	expect(parent.children.map(route => route.path)).toEqual(paths);
	const children = parent.children.map((route, index) => ({
		...route,
		component: defineComponent({ setup: () => () => h(MkCommunityHub, { active: names[index] }, () => h('output', { 'data-testid': 'content' }, route.path)) }),
	}));
	const router = new Nirax([{ ...parent, component: Community, children }], initialPath, true, Community);
	const mounted = render(view, {
		props: { router: router as unknown as Router },
		global: {
			provide: { [DI.router as symbol]: router },
			components: { NestedRouterView },
			stubs: {
				MkLoading: true,
				MkAvatar: { template: '<img data-testid="avatar">' },
				MkUserName: { template: '<span>User</span>' },
				PageWithHeader: { template: '<main><slot/></main>' },
			},
		},
	});
	await waitFor(() => expect(mounted.getByTestId('content').textContent).toBe(initialPath));
	const avatar = mounted.getByTestId('avatar');
	const sidebar = mounted.getByRole('navigation');
	for (const path of [...paths.slice(1), paths[0]]) {
		router.pushByPath(path);
		await waitFor(() => expect(mounted.getByTestId('content').textContent).toBe(path));
		expect(router.getCurrentFullPath()).toBe(path);
		expect(mounted.getByTestId('avatar')).toBe(avatar);
		expect(mounted.getByRole('navigation')).toBe(sidebar);
	}
	router.replaceByPath(initialPath);
	await waitFor(() => expect(mounted.getByTestId('content').textContent).toBe(initialPath));
	expect(mounted.getByTestId('avatar')).toBe(avatar);
});
