/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render as renderComponent, within } from '@testing-library/vue';
import type { RenderOptions } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import MkUserInfo from '@/components/MkUserInfo.vue';
import MkUserPopup from '@/components/MkUserPopup.vue';
import MkUserOnlineIndicator from '@/components/MkUserOnlineIndicator.vue';
import UserHome from '@/pages/user/home.vue';
import UserIndex from '@/pages/user/index.vue';
import UserContent from '@/pages/user/content.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import { Nirax } from '@/lib/nirax.js';
import { DI } from '@/di.js';
import { initializeUserStatisticsSync, publishUserStatistics } from '@/composables/use-user-statistics.js';
import { i18n } from '@/i18n.js';
import { useStream } from '@/stream.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	pleaseLogin: vi.fn(),
	updateAccount: vi.fn(),
	claimAchievement: vi.fn(),
	connection: { on: vi.fn(), off: vi.fn(), dispose: vi.fn() },
}));

vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.updateAccount }));
vi.mock('@/i.js', () => ({ $i: { id: 'self', followingCount: 0 }, iAmModerator: false }));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1, popupMenu: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/popup-position.js', () => ({ calcPopupPosition: () => ({ top: 100, left: 200, transformOrigin: 'center top' }) }));
vi.mock('@/utility/get-user-menu.js', () => ({ getUserMenu: () => ({ menu: [], cleanup: vi.fn() }) }));
vi.mock('@/utility/media-proxy.js', () => ({ getStaticImageUrl: (url: string) => url }));
vi.mock('@/stream.js', async () => {
	const { EventEmitter } = await import('eventemitter3');
	const stream = Object.assign(new EventEmitter(), {
		state: 'connected', send: vi.fn(), useChannel: () => mocks.connection,
	});
	return { useStream: () => stream };
});
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	const realtimeMode = ref(true);
	return { store: { s: { get realtimeMode() { return realtimeMode.value; } }, r: { realtimeMode } } };
});
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: mocks.pleaseLogin }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: mocks.claimAchievement }));
vi.mock('@/utility/haptic.js', () => ({ haptic: vi.fn() }));
vi.mock('@/utility/confetti.js', () => ({ confetti: vi.fn() }));
vi.mock('@/router.js', async () => {
	const { inject } = await import('vue');
	const { DI } = await import('@/di.js');
	return { useRouter: () => inject(DI.router, null) ?? {} };
});
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/server-context.js', () => ({ serverContext: null, assertServerContext: () => false }));
vi.mock('@/composables/use-scroll-position-keeper.js', () => ({ useScrollPositionKeeper: vi.fn() }));
vi.mock('@/components/MkNote.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkModerationNote.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkPullToRefresh.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/pages/user/notes.vue', () => ({ default: { template: '<div/>' } }));

const stream = useStream();
let documentVisibility: DocumentVisibilityState = 'visible';

const global = {
	directives: { tooltip: {}, 'adaptive-bg': {} },
	stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		MkAvatar: true,
		MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
		MkAcct: true,
		MkTime: true,
		MkError: true,
		MkLoading: true,
		MkOmit: { template: '<div><slot/></div>' },
		MkLazy: true,
		Mfm: true,
	},
};

const statusGlobal = {
	...global,
	stubs: {
		...global.stubs,
		MkAvatar: {
			components: { MkUserOnlineIndicator },
			props: { user: Object, indicator: Boolean },
			template: '<span><MkUserOnlineIndicator v-if="indicator" :user="user"/></span>',
		},
	},
};

function render<C>(component: C, options: RenderOptions<C>) {
	const view = renderComponent(component, options);
	if (!(view.container instanceof HTMLElement)) throw new Error('Expected an HTML test container');
	return { ...view, container: view.container };
}

function makeUser(id = 'alice'): Misskey.entities.UserDetailed {
	return Object.freeze({
		id, username: id, name: id, host: null,
		createdAt: '2020-01-01T00:00:00.000Z',
		bannerUrl: null, description: 'Profile description',
		notesCount: 12, followingCount: 3, followersCount: 4,
		followingVisibility: 'followers', followersVisibility: 'followers',
		isFollowing: false, isFollowed: false, hasPendingFollowRequestFromYou: false,
		isLocked: false, roles: [], fields: [], pinnedNotes: [], avatarDecorations: [],
	}) as unknown as Misskey.entities.UserDetailed;
}

function expectCount(container: HTMLElement, username: string, kind: 'notes' | 'following' | 'followers', count: number) {
	const link = container.querySelector<HTMLAnchorElement>(`a[href="/@${username}/${kind}"]`);
	expect(link).not.toBeNull();
	expect(link?.textContent).toContain(String(count));
}

async function flush(milliseconds = 50) {
	await vi.advanceTimersByTimeAsync(milliseconds);
	await nextTick();
}

function setVisibility(visibility: DocumentVisibilityState) {
	documentVisibility = visibility;
	window.document.dispatchEvent(new Event('visibilitychange'));
}

describe('user statistics consumers', () => {
	let source: HTMLButtonElement;

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.spyOn(window.document, 'visibilityState', 'get').mockImplementation(() => documentVisibility);
		vi.clearAllMocks();
		mocks.api.mockReset().mockResolvedValue([]);
		mocks.pleaseLogin.mockResolvedValue(true);
		vi.stubGlobal('ResizeObserver', class {
			observe() {}
			disconnect() {}
		});
		vi.stubGlobal('IntersectionObserver', class {
			constructor(private callback: IntersectionObserverCallback) {}
			observe(target: Element) {
				this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
			}
			unobserve() {}
			disconnect() {}
		});
		source = window.document.createElement('button');
		window.document.body.appendChild(source);
		setVisibility('visible');
		initializeUserStatisticsSync();
		await flush();
		mocks.api.mockClear();
		vi.mocked(stream.send).mockClear();
	});

	afterEach(async () => {
		cleanup();
		setVisibility('hidden');
		await nextTick();
		source.remove();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test('updates cards, popups and profiles together without mutating the supplied user', async () => {
		const user = makeUser();
		const initial = { ...user };
		const card = render(MkUserInfo, { props: { user }, global });
		const popup = render(MkUserPopup, { props: { showing: true, source, q: user }, global });
		const home = render(UserHome, { props: { user, disableNotes: true, singleColumn: true }, global });
		const views = [card, popup, home];
		await flush();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show-partial-bulk', { userIds: [user.id] });
		expect(stream.send).toHaveBeenCalledExactlyOnceWith('subUser', { id: user.id });

		for (const view of views) {
			expectCount(view.container, user.username, 'notes', 12);
			expect(view.container.querySelector('a[href="/@alice/following"]')).toBeNull();
			expect(view.container.querySelector('a[href="/@alice/followers"]')).toBeNull();
			expect(within(view.container).queryByText(i18n.ts.followsYou)).toBeNull();
			expect(within(view.container).getByRole('button', { name: i18n.ts.follow })).toBeTruthy();
		}

		mocks.api.mockResolvedValueOnce([{
			...user,
			id: user.id, notesCount: 21, followingCount: 9, followersCount: 8,
			isFollowing: true, isFollowed: true, hasPendingFollowRequestFromYou: false,
		}]);
		stream.emit('userStatsUpdated', { userIds: [user.id] });
		await flush();

		for (const view of views) {
			expectCount(view.container, user.username, 'notes', 21);
			expectCount(view.container, user.username, 'following', 9);
			expectCount(view.container, user.username, 'followers', 8);
			expect(within(view.container).getByText(i18n.ts.followsYou)).toBeTruthy();
			expect(within(view.container).getByRole('button', { name: i18n.ts.unfollow })).toBeTruthy();
		}

		publishUserStatistics({ id: user.id, notesCount: 20, isFollowing: false, isFollowed: false });
		await nextTick();
		for (const view of views) {
			expectCount(view.container, user.username, 'notes', 20);
			expect(view.container.querySelector('a[href="/@alice/following"]')).toBeNull();
			expect(view.container.querySelector('a[href="/@alice/followers"]')).toBeNull();
			expect(within(view.container).queryByText(i18n.ts.followsYou)).toBeNull();
			expect(within(view.container).getByRole('button', { name: i18n.ts.follow })).toBeTruthy();
		}
		expect(user).toEqual(initial);
		expect(mocks.api.mock.calls.map(([endpoint]) => endpoint)).toEqual(['users/show-partial-bulk', 'users/show-partial-bulk']);
	});

	test('keeps builtin presence only in the avatar indicator across cards, popups and profiles', async () => {
		const user = Object.freeze({ ...makeUser(), onlineStatus: 'online' as const, customStatus: null });
		const views = [
			render(MkUserInfo, { props: { user }, global: statusGlobal }),
			render(MkUserPopup, { props: { showing: true, source, q: user }, global: statusGlobal }),
			render(UserHome, { props: { user, disableNotes: true, singleColumn: true }, global: statusGlobal }),
		];
		for (const onlineStatus of ['online', 'active', 'away', 'busy', 'offline', 'unknown'] as const) {
			publishUserStatistics({ id: user.id, onlineStatus, customStatus: null });
			await nextTick();
			for (const view of views) {
				const queries = within(view.container);
				const label = i18n.ts._onlineStatus._display[onlineStatus];
				expect(queries.getAllByRole('img', { name: label })).toHaveLength(1);
				expect(queries.queryByText(label, { exact: true })).toBeNull();
			}
		}
	});

	test('keeps custom status in the avatar indicator without duplicate title chips as presence changes', async () => {
		const customStatus = { icon: 'coffee', text: 'Taking a break' } as const;
		const user = Object.freeze({ ...makeUser(), onlineStatus: 'online' as const, customStatus });
		const card = render(MkUserInfo, { props: { user }, global: statusGlobal });
		const popup = render(MkUserPopup, { props: { showing: true, source, q: user }, global: statusGlobal });
		const home = render(UserHome, { props: { user, disableNotes: true, singleColumn: true }, global: statusGlobal });
		const views = [card, popup, home];
		const profileTitles = home.container.querySelectorAll<HTMLElement>('.profile > .main > .title, .banner-container > .title');
		expect(profileTitles).toHaveLength(2);
		const textContainers = [card.container, popup.container, ...profileTitles];
		await flush();
		for (const container of textContainers) {
			expect(within(container).queryByText(customStatus.text, { exact: true })).toBeNull();
		}
		for (const view of views) {
			const queries = within(view.container);
			expect(queries.getAllByRole('img', { name: customStatus.text })).toHaveLength(1);
			expect(view.container.querySelectorAll('[data-custom-status-icon="coffee"]')).toHaveLength(1);
		}

		mocks.api.mockResolvedValueOnce([{ id: user.id, onlineStatus: 'offline', customStatus: null }]);
		stream.emit('userStatsUpdated', { userIds: [user.id] });
		await flush();
		for (const view of views) {
			const queries = within(view.container);
			expect(queries.queryByText(customStatus.text, { exact: true })).toBeNull();
			expect(queries.getAllByRole('img', { name: i18n.ts._onlineStatus._display.offline })).toHaveLength(1);
			expect(queries.queryByText(i18n.ts._onlineStatus._display.offline, { exact: true })).toBeNull();
			expect(view.container.querySelector('[data-custom-status-icon="coffee"]')).toBeNull();
		}

		const nextStatus = { icon: 'music', text: 'Listening' } as const;
		mocks.api.mockResolvedValueOnce([{ id: user.id, onlineStatus: 'online', customStatus: nextStatus }]);
		stream.emit('userStatsUpdated', { userIds: [user.id] });
		await flush();
		for (const container of textContainers) {
			expect(within(container).queryByText(nextStatus.text, { exact: true })).toBeNull();
		}
		for (const view of views) {
			const queries = within(view.container);
			expect(queries.getAllByRole('img', { name: nextStatus.text })).toHaveLength(1);
			expect(view.container.querySelectorAll('[data-custom-status-icon="music"]')).toHaveLength(1);
			expect(queries.queryByText(customStatus.text, { exact: true })).toBeNull();
		}
		expect(user.customStatus).toEqual(customStatus);
	});

	test('rebinds reused cards and profiles to their new user without accepting updates for the old one', async () => {
		const alice = makeUser();
		const bob = makeUser('bob');
		const card = render(MkUserInfo, { props: { user: alice }, global });
		const home = render(UserHome, { props: { user: alice, disableNotes: true, singleColumn: true }, global });
		publishUserStatistics({ id: alice.id, isFollowing: true });
		await nextTick();
		for (const view of [card, home]) {
			expect(within(view.container).getByRole('button', { name: i18n.ts.unfollow })).toBeTruthy();
			await view.rerender({ user: bob });
		}

		publishUserStatistics({ id: alice.id, notesCount: 99, isFollowing: true });
		publishUserStatistics({ id: bob.id, notesCount: 5, hasPendingFollowRequestFromYou: true });
		await nextTick();
		for (const view of [card, home]) {
			expectCount(view.container, bob.username, 'notes', 5);
			expect(view.container.querySelector('a[href="/@bob/following"]')).toBeNull();
			expect(within(view.container).getByRole('button', { name: i18n.ts.followRequestPending })).toBeTruthy();
		}
		expect(alice.notesCount).toBe(12);
		expect(alice.isFollowing).toBe(false);
		expect(bob.notesCount).toBe(12);
		expect(bob.hasPendingFollowRequestFromYou).toBe(false);
	});

	test('keeps follow achievements when the shared stream updates a button before its own follow listener', async () => {
		initializeUserStatisticsSync(mocks.connection as never);
		const user = makeUser();
		const card = render(MkUserInfo, { props: { user }, global });
		const followed = { ...user, isFollowing: true, hasPendingFollowRequestFromYou: false };

		for (const [, handler] of mocks.connection.on.mock.calls.filter(([event]) => event === 'follow')) {
			handler(followed);
		}
		await nextTick();

		expect(within(card.container).getByRole('button', { name: i18n.ts.unfollow })).toBeTruthy();
		expect(mocks.claimAchievement).toHaveBeenCalledWith('following1');
	});

	test('does not let an older follow button refresh overwrite a newer pushed count', async () => {
		const user = Object.freeze({ ...makeUser(), isFollowing: true });
		const card = render(MkUserInfo, { props: { user }, global });
		await flush();
		let completeRefresh!: (users: Misskey.entities.UserDetailed[]) => void;
		let completeRecheck!: (users: Misskey.entities.UserDetailed[]) => void;
		const refresh = new Promise<Misskey.entities.UserDetailed[]>(resolve => { completeRefresh = resolve; });
		const recheck = new Promise<Misskey.entities.UserDetailed[]>(resolve => { completeRecheck = resolve; });
		let refreshCount = 0;
		mocks.api.mockImplementation((endpoint: string) => {
			if (endpoint === 'users/show-partial-bulk') return ++refreshCount === 1 ? refresh : recheck;
			return Promise.resolve();
		});
		await fireEvent.click(within(card.container).getByRole('button', { name: i18n.ts.unfollow }));
		await flush();
		expect(mocks.api).toHaveBeenCalledWith('users/show-partial-bulk', { userIds: expect.arrayContaining([user.id, 'self']) });

		publishUserStatistics({ id: user.id, notesCount: 13, followersCount: 5 });
		await nextTick();
		expectCount(card.container, user.username, 'notes', 13);
		completeRefresh([user]);
		await flush();
		expect(refreshCount).toBe(2);
		expectCount(card.container, user.username, 'notes', 13);
		expect(card.container.querySelector('a[href="/@alice/following"]')).toBeNull();
		completeRecheck([{ ...user, notesCount: 13, followersCount: 5, isFollowing: false }]);
		await flush(0);
		expect(within(card.container).getByRole('button', { name: i18n.ts.follow }).hasAttribute('disabled')).toBe(false);

		expectCount(card.container, user.username, 'notes', 13);
		expect(card.container.querySelector('a[href="/@alice/following"]')).toBeNull();
		expect(user.notesCount).toBe(12);
	});

	test('keeps the profile snapshot current while its overview tab is unmounted', async () => {
		const user = makeUser();
		mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'users/show' ? user : []);
		const router = new Nirax([{
			path: '/@:acct',
			component: UserIndex,
			children: [{ path: '/:page?', component: UserContent }],
		}], `/@${user.username}`, true, UserIndex);
		vi.stubGlobal('innerWidth', 390);
		const view = render(UserIndex, {
			props: { acct: user.username },
			global: {
				...global,
				components: { NestedRouterView },
				provide: { [DI.router as symbol]: router, [DI.routerCurrentDepth as symbol]: 1 },
				stubs: {
					...global.stubs,
					PageWithHeader: {
						props: ['tabs', 'tab'],
						emits: ['update:tab'],
						template: '<section><nav><button v-for="item in tabs" :key="item.key" @click="$emit(\'update:tab\', item.key)">{{ item.title }}</button></nav><slot/></section>',
					},
					XHome: { props: ['user'], template: '<output data-testid="overview-counts">{{ user.notesCount }} / {{ user.followingCount }} / {{ user.followersCount }}</output>' },
					XNotes: { template: '<div data-testid="profile-notes"/>' },
				},
			},
		});
		await flush();
		expect(view.getByTestId('overview-counts').textContent).toBe('12 / 3 / 4');
		await fireEvent.click(within(view.container).getByRole('button', { name: i18n.ts.notes }));
		await flush();
		expect(view.queryByTestId('overview-counts')).toBeNull();
		expect(view.getByTestId('profile-notes')).toBeTruthy();

		publishUserStatistics({ id: user.id, notesCount: 21, followingCount: 9, followersCount: 8 });
		await nextTick();
		await fireEvent.click(within(view.container).getByRole('button', { name: i18n.ts.overview }));
		await flush();

		expect(view.getByTestId('overview-counts').textContent).toBe('21 / 9 / 8');
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show', { username: user.username, host: null });
		expect(user.notesCount).toBe(12);
	});
});
