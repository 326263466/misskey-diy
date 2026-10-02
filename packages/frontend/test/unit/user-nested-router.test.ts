/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import RouterView from '@/components/global/RouterView.vue';
import StackingRouterView from '@/components/global/StackingRouterView.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';
import { publishUserProfileUpdate } from '@/composables/use-user-profile.js';
import type { Router } from '@/router.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), realMenu: false }));

vi.mock('@/i.js', () => ({ $i: null, iAmAdmin: false, iAmModerator: false }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/server-context.js', () => ({ serverContext: null, assertServerContext: () => false }));
vi.mock('@/composables/use-scroll-position-keeper.js', () => ({ useScrollPositionKeeper: vi.fn() }));
vi.mock('@/composables/use-user-statistics.js', () => ({ useUserStatistics: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, numberOfPageCache: 4 } } }));
vi.mock('@/pages/timeline.vue', () => ({ default: { template: '<div data-testid="timeline"/>' } }));
vi.mock('@/pages/settings/index.vue', () => ({ __esModule: true, default: { template: '<section data-testid="settings"><NestedRouterView/></section>' } }));
vi.mock('@/pages/settings/profile.vue', () => ({ __esModule: true, default: { template: '<div data-testid="settings-profile"/>' } }));
vi.mock('@/pages/_error_.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/pages/_loading_.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/router.js', async () => {
	const { inject } = await import('vue');
	const { DI } = await import('@/di.js');
	return { useRouter: () => inject(DI.router) };
});
vi.mock('@/components/MkInput.vue', () => ({ default: {
	props: ['modelValue'], emits: ['update:modelValue'],
	template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
} }));
vi.mock('@/components/MkSuperMenu.vue', async importOriginal => {
	const actual = await importOriginal<typeof import('@/components/MkSuperMenu.vue')>();
	const { inject } = await import('vue');
	const { DI } = await import('@/di.js');
	return { default: {
		props: ['def', 'searchIndex'],
		components: { RealMenu: actual.default },
		setup: () => ({ router: inject(DI.router), realMenu: mocks.realMenu }),
		template: '<RealMenu v-if="realMenu" :def="def" :searchIndex="searchIndex"/><div v-else data-testid="profile-menu"><a v-for="item in def[0].items" :key="item.to" :href="item.to" :data-active="item.active" @click.prevent="router.pushByPath(item.to)">{{ item.text }}</a></div>',
	} };
});
vi.mock('@/pages/user/home.vue', () => ({ __esModule: true, default: {
	props: ['user', 'singleColumn', 'refreshUser'],
	emits: ['showMoreFiles'],
	template: '<section data-testid="profile-home" :data-user="user.id" :data-single-column="singleColumn"><h1>{{ user.name }}</h1><button @click="$emit(\'showMoreFiles\')">More files</button><button @click="refreshUser">Refresh profile</button></section>',
} }));
vi.mock('@/pages/user/notes.vue', () => ({ __esModule: true, default: {
	props: ['user'],
	template: '<section data-testid="profile-notes" :data-user="user.id">{{ user.name }}</section>',
} }));
vi.mock('@/pages/user/files.vue', () => ({ __esModule: true, default: {
	props: ['user'],
	template: '<section data-testid="profile-files" :data-user="user.id">{{ user.name }}</section>',
} }));

const PageWithHeader = {
	props: ['tabs', 'tab'],
	emits: ['update:tab'],
	template: '<main data-testid="profile-header"><nav v-if="tabs.length"><button v-for="item in tabs" :key="item.key" :data-active="tab === item.key" @click="$emit(\'update:tab\', item.key)">{{ item.title }}</button></nav><slot/></main>',
};

function makeUser(username: string): Misskey.entities.UserDetailed {
	return {
		id: username, username, host: null, name: username, publicReactions: true,
	} as Misskey.entities.UserDetailed;
}

function mountProfile(view: typeof RouterView | typeof StackingRouterView, path = '/@alice', loggedIn = false) {
	const router = new Nirax(ROUTE_DEF, path, loggedIn, { template: '<div/>' });
	const errors = vi.fn();
	const mounted = render(view, {
		props: { router: router as Router },
		global: {
			components: { NestedRouterView },
			provide: { [DI.router as symbol]: router },
			stubs: { PageWithHeader, MkLoading: true, MkError: true, MkA: {
				props: ['to'],
				template: '<a :href="to" @click.prevent="navigate(to)"><slot/></a>',
				methods: { navigate: (to: string) => router.pushByPath(to) },
			} },
			config: { errorHandler: errors },
		},
	});
	const currentProfile = () => {
		const profiles = mounted.container.querySelectorAll<HTMLElement>('._pageLayout');
		return profiles[profiles.length - 1];
	};
	return { ...mounted, router, currentProfile, errors };
}

let profileWidth = 1100;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.realMenu = false;
	profileWidth = 1100;
	vi.stubGlobal('innerWidth', 1100);
	vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => profileWidth);
	vi.stubGlobal('ResizeObserver', class {
		observe() {}
		disconnect() {}
	});
	mocks.api.mockImplementation(async (_endpoint: string, params: { username: string }) => makeUser(params.username));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('profile nested routes', () => {
	test('searches visible profile sections and opens results by click or keyboard', async () => {
		mocks.realMenu = true;
		const mounted = mountProfile(RouterView);
		await waitFor(() => expect(mounted.getByTestId('profile-home')).toBeTruthy());
		const input = mounted.getByRole('searchbox');
		const parent = mounted.currentProfile();
		await fireEvent.update(input, i18n.ts.files);
		await waitFor(() => expect(mounted.getByRole('link', { name: i18n.ts.files }).getAttribute('href')).toBe('/@alice/files#profile-files'));
		await fireEvent.click(mounted.getByRole('link', { name: i18n.ts.files }));
		await waitFor(() => expect(mounted.getByTestId('profile-files')).toBeTruthy());
		expect(mounted.currentProfile()).toBe(parent);
		expect(parent.querySelector('#profile-files')).not.toBeNull();
		await fireEvent.update(input, 'notes');
		await waitFor(() => expect(mounted.getByRole('link', { name: i18n.ts.notes })).toBeTruthy());
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		await fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(mounted.getByTestId('profile-notes')).toBeTruthy());
		expect(mounted.router.getCurrentFullPath()).toBe('/@alice/notes#profile-notes');
		await fireEvent.update(input, 'no-such-profile-section');
		await waitFor(() => expect(mounted.queryAllByRole('link')).toHaveLength(0));
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(mounted.errors).not.toHaveBeenCalled();
		await fireEvent.update(input, '');
		await waitFor(() => expect(mounted.getByRole('link', { name: i18n.ts.overview })).toBeTruthy());
	});

	test('refreshes the routed profile in place without overwriting a newer saved edit', async () => {
		const username = 'refresh-profile';
		const mounted = mountProfile(RouterView, `/@${username}`);
		await waitFor(() => expect(mounted.getByTestId('profile-home')).toBeTruthy());
		const home = mounted.getByTestId('profile-home');
		publishUserProfileUpdate(username, { name: 'Earlier edit' });
		mocks.api.mockResolvedValueOnce({ ...makeUser(username), name: 'Fresh server profile' });
		await fireEvent.click(within(home).getByText('Refresh profile'));
		await waitFor(() => expect(home.textContent).toContain('Fresh server profile'));
		expect(mounted.getByTestId('profile-home')).toBe(home);

		let finishRefresh: (user: Misskey.entities.UserDetailed) => void = () => {};
		mocks.api.mockReturnValueOnce(new Promise(resolve => { finishRefresh = resolve; }));
		await fireEvent.click(within(home).getByText('Refresh profile'));
		publishUserProfileUpdate(username, { name: 'Newer local edit' });
		finishRefresh({ ...makeUser(username), name: 'Stale response' });
		await waitFor(() => expect(home.textContent).toContain('Newer local edit'));
		expect(mounted.errors).not.toHaveBeenCalled();
	});

	test('resolves profile sections under one account route while retaining separate user pages', () => {
		const router = new Nirax(ROUTE_DEF, '/@alice', false, { template: '<div/>' });
		for (const path of ['/@alice', '/@alice/notes', '/@alice/home', '/@alice/unknown']) {
			const resolved = router.resolve(path)!;
			expect(resolved.route.path).toBe('/@:acct');
			expect(resolved.props).toEqual(new Map([['acct', 'alice']]));
			expect(resolved.child?.route.path).toBe('/:page?');
		}
		expect(router.resolve('/@alice@example.test/files')?.props.get('acct')).toBe('alice@example.test');
		expect(router.resolve('/@alice/following')?.route.path).toBe('/@:acct/following');
		expect(router.resolve('/@alice/followers')?.route.path).toBe('/@:acct/followers');
		expect(router.resolve('/@alice/pages/example')?.route.path).toBe('/@:username/pages/:pageName(*)');
	});

	describe.each([
		{ name: 'RouterView', view: RouterView },
		{ name: 'StackingRouterView', view: StackingRouterView },
	])('$name', ({ view }) => {
		test('keeps the account layout and menu mounted while navigating between sections', async () => {
			const mounted = mountProfile(view);
			await waitFor(() => expect(mounted.getByTestId('profile-home').getAttribute('data-user')).toBe('alice'));
			const parent = mounted.currentProfile();
			const menu = within(parent).getByTestId('profile-menu');
			const header = within(parent).getByTestId('profile-header');
			const scrollTo = vi.spyOn(header, 'scrollTo');
			expect(mounted.getByTestId('profile-home').getAttribute('data-single-column')).toBe('true');

			for (const { section, title } of [
				{ section: 'notes', title: i18n.ts.notes },
				{ section: 'files', title: i18n.ts.files },
			]) {
				scrollTo.mockClear();
				await fireEvent.click(within(menu).getByRole('link', { name: title }));
				await waitFor(() => expect(within(parent).getByTestId(`profile-${section}`).getAttribute('data-user')).toBe('alice'));
				expect(mounted.currentProfile()).toBe(parent);
				expect(within(parent).getByTestId('profile-menu')).toBe(menu);
				expect(within(parent).getByTestId('profile-header')).toBe(header);
				expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: 'instant' });
				expect(mounted.router.getCurrentFullPath()).toBe(`/@alice/${section}`);
				expect(within(menu).getByRole('link', { name: title }).getAttribute('data-active')).toBe('true');
				expect(within(menu).getByRole('link', { name: i18n.ts.overview }).getAttribute('data-active')).toBe('false');
				expect(mounted.container.querySelectorAll('._pageLayout')).toHaveLength(1);
			}

			const navigate = (path: string) => view === RouterView ? mounted.router.replaceByPath(path) : mounted.router.pushByPath(path);
			navigate('/@alice');
			await waitFor(() => expect(within(parent).getByTestId('profile-home')).toBeTruthy());
			navigate('/@alice/unknown');
			await waitFor(() => expect(within(menu).getByRole('link', { name: i18n.ts.overview }).getAttribute('data-active')).toBe('true'));
			await waitFor(() => expect(within(parent).getByTestId('profile-home')).toBeTruthy());
			expect(mounted.currentProfile()).toBe(parent);
			expect(mounted.errors).not.toHaveBeenCalled();
			expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show', { username: 'alice', host: null });
		});

		test.each([
			{ path: '/timeline', testId: 'timeline' },
			{ path: '/settings/profile', testId: 'settings-profile' },
		])('does not bind a delayed profile child to $path while its parent is cached', async ({ path, testId }) => {
			let complete!: (user: Misskey.entities.UserDetailed) => void;
			mocks.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
			const mounted = mountProfile(view, '/@alice/notes', true);
			await waitFor(() => expect(mounted.getByTestId('profile-header')).toBeTruthy());
			await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
			const parent = mounted.currentProfile();
			expect(within(parent).queryByTestId('profile-notes')).toBeNull();
			mounted.router.pushByPath(path);
			await waitFor(() => expect(mounted.getByTestId(testId)).toBeTruthy());

			complete(makeUser('alice'));
			await waitFor(() => expect(within(parent).getByTestId('profile-notes').getAttribute('data-user')).toBe('alice'));
			expect(mounted.router.getCurrentFullPath()).toBe(path);
			expect(mounted.getByTestId(testId)).toBeTruthy();
			expect(mounted.errors).not.toHaveBeenCalled();

			mounted.router.pushByPath('/@alice/notes');
			await waitFor(() => expect(mounted.getByTestId('profile-notes').getAttribute('data-user')).toBe('alice'));
			expect(mounted.currentProfile()).toBe(parent);
			mounted.router.pushByPath('/@alice/files');
			await waitFor(() => expect(within(parent).getByTestId('profile-files').getAttribute('data-user')).toBe('alice'));
			expect(mounted.currentProfile()).toBe(parent);
			expect(mounted.errors).not.toHaveBeenCalled();
			expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show', { username: 'alice', host: null });
		});

		test('loads a new account when the parent parameter changes', async () => {
			const mounted = mountProfile(view, '/@alice/notes');
			await waitFor(() => expect(mounted.getByTestId('profile-notes').getAttribute('data-user')).toBe('alice'));
			const parent = mounted.currentProfile();
			mounted.router.push('/@:acct/:page?', { params: { acct: 'bob', page: 'notes' } });
			await waitFor(() => expect(within(mounted.currentProfile()).getByTestId('profile-notes').getAttribute('data-user')).toBe('bob'));
			expect(mounted.currentProfile()).not.toBe(parent);
			expect(mounted.router.getCurrentFullPath()).toBe('/@bob/notes');
			expect(mocks.api.mock.calls).toEqual([
				['users/show', { username: 'alice', host: null }],
				['users/show', { username: 'bob', host: null }],
			]);
		});

		test('switches mobile tabs and overview file actions through child routes', async () => {
			vi.stubGlobal('innerWidth', 390);
			profileWidth = 390;
			const mounted = mountProfile(view);
			await waitFor(() => expect(mounted.getByTestId('profile-home')).toBeTruthy());
			const parent = mounted.currentProfile();
			expect(mounted.queryByTestId('profile-menu')).toBeNull();
			await fireEvent.click(within(parent).getByRole('button', { name: i18n.ts.notes }));
			await waitFor(() => expect(within(parent).getByTestId('profile-notes')).toBeTruthy());
			expect(mounted.router.getCurrentFullPath()).toBe('/@alice/notes');
			expect(within(parent).getByRole('button', { name: i18n.ts.notes }).getAttribute('data-active')).toBe('true');
			await fireEvent.click(within(parent).getByRole('button', { name: i18n.ts.overview }));
			await waitFor(() => expect(within(parent).getByTestId('profile-home')).toBeTruthy());
			await fireEvent.click(within(parent).getByRole('button', { name: 'More files' }));
			await waitFor(() => expect(within(parent).getByTestId('profile-files')).toBeTruthy());
			expect(mounted.router.getCurrentFullPath()).toBe('/@alice/files');
			expect(within(parent).getByRole('button', { name: i18n.ts.files }).getAttribute('data-active')).toBe('true');
			expect(mounted.currentProfile()).toBe(parent);
			expect(mocks.api).toHaveBeenCalledTimes(1);
		});
	});
});
