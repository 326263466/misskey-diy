/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor, within } from '@testing-library/vue';
import { defineComponent, h, inject, nextTick, provide } from 'vue';
import type { InjectionKey } from 'vue';
import RouterView from '@/components/global/RouterView.vue';
import StackingRouterView from '@/components/global/StackingRouterView.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import { Nirax } from '@/lib/nirax.js';
import { DI } from '@/di.js';
import type { Router } from '@/router.js';

vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, numberOfPageCache: 4 } } }));
vi.mock('@/pages/_loading_.vue', () => ({ default: { template: '<div/>' } }));

afterEach(cleanup);

describe.each([
	{ name: 'RouterView', view: RouterView },
	{ name: 'StackingRouterView', view: StackingRouterView },
])('routes retained by $name', ({ view }) => {
	test('keeps an opted-in page mounted while query props and history change', async () => {
		const mounts = vi.fn();
		const Ranking = defineComponent({
			props: { type: String },
			setup(props) {
				mounts();
				return () => h('output', { 'data-testid': 'ranking' }, props.type ?? 'points');
			},
		});
		const Other = defineComponent({ setup: () => () => h('div', { 'data-testid': 'other' }) });
		const routes = [{
			path: '/community-ranking', component: Ranking, query: { type: 'type' }, reuseOnPropsChange: ['type'],
		}, {
			path: '/other', component: Other,
		}];
		const router = new Nirax(routes, '/community-ranking?type=points', true, Other);
		const mounted = render(view, {
			props: { router: router as unknown as Router },
			global: { stubs: { MkLoading: true } },
		});
		await waitFor(() => expect(mounted.getByTestId('ranking').textContent).toBe('points'));
		const ranking = mounted.getByTestId('ranking');

		router.pushByPath('/community-ranking?type=replies');
		await waitFor(() => expect(ranking.textContent).toBe('replies'));
		router.replaceByPath('/community-ranking?type=tips');
		await waitFor(() => expect(ranking.textContent).toBe('tips'));
		expect(mounted.getAllByTestId('ranking')).toEqual([ranking]);
		expect(mounts).toHaveBeenCalledTimes(1);

		router.pushByPath('/other');
		await waitFor(() => expect(mounted.getByTestId('other')).toBeTruthy());
		router.replaceByPath('/community-ranking');
		await waitFor(() => expect(mounted.queryByTestId('other')).toBeNull());
		expect(mounted.getAllByTestId('ranking')).toEqual([ranking]);
		expect(ranking.textContent).toBe('points');
		expect(mounts).toHaveBeenCalledTimes(1);
	});

	test.each([
		{ reason: 'query reuse is not enabled', reuseOnPropsChange: undefined, destination: '/pages/alice?type=replies', content: 'alice/replies' },
		{ reason: 'a path parameter changes', reuseOnPropsChange: ['type'], destination: '/pages/bob?type=points', content: 'bob/points' },
	])('uses a separate page instance when $reason', async ({ reuseOnPropsChange, destination, content }) => {
		const mounts = vi.fn();
		const Page = defineComponent({
			props: { acct: String, type: String },
			setup(props) {
				mounts();
				return () => h('output', { 'data-testid': 'page' }, `${props.acct}/${props.type}`);
			},
		});
		const router = new Nirax([{
			path: '/pages/:acct', component: Page, query: { type: 'type' }, reuseOnPropsChange,
		}], '/pages/alice?type=points', true, Page);
		const mounted = render(view, {
			props: { router: router as unknown as Router },
			global: { stubs: { MkLoading: true } },
		});
		await waitFor(() => expect(mounted.getByTestId('page').textContent).toBe('alice/points'));
		const original = mounted.getByTestId('page');

		router.pushByPath(destination);
		await waitFor(() => expect(mounted.getAllByTestId('page').at(-1)?.textContent).toBe(content));
		expect(mounted.getAllByTestId('page').at(-1)).not.toBe(original);
		expect(mounts).toHaveBeenCalledTimes(2);
	});

	test.each([
		{ source: 'query', path: '/search', query: { q: 'tab', userId: 'item' }, hash: undefined, initial: '/search?q=first&userId=alice', next: '/search?q=second&userId=alice', other: '/search?q=second&userId=bob' },
		{ source: 'hash', path: '/pages/:item', query: undefined, hash: 'tab', initial: '/pages/alice#first', next: '/pages/alice#second', other: '/pages/bob#second' },
		{ source: 'path', path: '/pages/:item/:tab', query: undefined, hash: undefined, initial: '/pages/alice/first', next: '/pages/alice/second', other: '/pages/bob/second' },
	])('reuses an allowed $source tab while isolating other identity props', async ({ path, query, hash, initial, next, other }) => {
		const mounts = vi.fn();
		const Page = defineComponent({
			props: { item: String, tab: String },
			setup(props) {
				mounts();
				return () => h('output', { 'data-testid': 'page' }, `${props.item}/${props.tab}`);
			},
		});
		const router = new Nirax([{
			path, component: Page, query, hash, reuseOnPropsChange: ['tab'],
		}], initial, true, Page);
		const mounted = render(view, {
			props: { router: router as unknown as Router },
			global: { stubs: { MkLoading: true } },
		});
		await waitFor(() => expect(mounted.getByTestId('page').textContent).toBe('alice/first'));
		const original = mounted.getByTestId('page');
		router.pushByPath(next);
		await waitFor(() => expect(original.textContent).toBe('alice/second'));
		expect(mounted.getAllByTestId('page')).toHaveLength(1);
		expect(mounts).toHaveBeenCalledTimes(1);

		router.replaceByPath(other);
		await waitFor(() => expect(mounted.getAllByTestId('page').at(-1)?.textContent).toBe('bob/second'));
		expect(mounted.getAllByTestId('page').at(-1)).not.toBe(original);
		expect(mounts).toHaveBeenCalledTimes(2);
	});

	test('retains a nested tab page without sharing its instance across categories or parents', async () => {
		const accountContext = Symbol() as InjectionKey<string>;
		const mounts = vi.fn();
		const Parent = defineComponent({
			props: { acct: { type: String, required: true } },
			setup(props) {
				provide(accountContext, props.acct);
				return () => h('section', h(NestedRouterView));
			},
		});
		const Content = defineComponent({
			props: { categoryId: String, tab: String },
			setup(props) {
				const account = inject(accountContext);
				mounts(account, props.categoryId);
				return () => h('output', { 'data-testid': 'content' }, `${account}/${props.categoryId}/${props.tab}`);
			},
		});
		const router = new Nirax([{
			path: '/:acct', component: Parent,
			children: [{ path: '/articles/:categoryId', component: Content, query: { tab: 'tab' }, reuseOnPropsChange: ['tab'] }],
		}], '/alice/articles/one?tab=latest', true, Parent);
		const mounted = render(view, {
			props: { router: router as unknown as Router },
			global: { provide: { [DI.router as symbol]: router }, stubs: { MkLoading: true } },
		});
		await waitFor(() => expect(mounted.getByTestId('content').textContent).toBe('alice/one/latest'));
		const original = mounted.getByTestId('content');
		router.pushByPath('/alice/articles/one?tab=recommended');
		await waitFor(() => expect(original.textContent).toBe('alice/one/recommended'));
		expect(mounted.getByTestId('content')).toBe(original);
		expect(mounts).toHaveBeenCalledTimes(1);

		router.replaceByPath('/alice/articles/two?tab=latest');
		await waitFor(() => expect(mounted.getByTestId('content').textContent).toBe('alice/two/latest'));
		const alice = mounted.getByTestId('content');
		expect(alice).not.toBe(original);
		router.pushByPath('/bob/articles/two?tab=latest');
		await waitFor(() => expect(mounted.getAllByTestId('content').at(-1)?.textContent).toBe('bob/two/latest'));
		expect(mounted.getAllByTestId('content').at(-1)).not.toBe(alice);
		expect(alice.textContent).toBe('alice/two/latest');
		expect(mounts.mock.calls).toEqual([['alice', 'one'], ['alice', 'two'], ['bob', 'two']]);
	});

	test('updates child pages only within the parent route that provides their context', async () => {
		const accountContext = Symbol() as InjectionKey<string>;
		const settingsMounts = vi.fn();
		const profileMounts = vi.fn();
		const errors = vi.fn();
		const Settings = defineComponent({
			setup: () => () => h('section', { 'data-testid': 'settings-parent' }, h(NestedRouterView)),
		});
		const SettingsContent = defineComponent({
			props: { page: String },
			setup(props) {
				settingsMounts(props.page);
				return () => h('output', { 'data-testid': 'settings-content' }, props.page);
			},
		});
		const Profile = defineComponent({
			props: { acct: { type: String, required: true } },
			setup(props) {
				provide(accountContext, props.acct);
				return () => h('section', { 'data-testid': 'profile-parent' }, h(NestedRouterView));
			},
		});
		const ProfileContent = defineComponent({
			props: { page: String },
			setup(props) {
				const acct = inject(accountContext);
				if (acct == null) throw new Error('profile content is outside its account parent');
				profileMounts(acct, props.page);
				return () => h('output', { 'data-testid': 'profile-content' }, `${acct}/${props.page}`);
			},
		});
		const routes = [{
			path: '/settings', component: Settings,
			children: [{ path: '/:page', component: SettingsContent }],
		}, {
			path: '/@:acct', component: Profile,
			children: [{ path: '/:page?', component: ProfileContent }],
		}];
		const router = new Nirax(routes, '/settings/profile', true, Settings);
		const mounted = render(view, {
			props: { router: router as unknown as Router },
			global: {
				provide: { [DI.router as symbol]: router },
				stubs: { MkLoading: true },
				config: { errorHandler: errors },
			},
		});
		await waitFor(() => expect(mounted.getByTestId('settings-content').textContent).toBe('profile'));
		const settings = mounted.getByTestId('settings-content');
		router.pushByPath('/settings/profile#nickname');
		await nextTick();
		expect(mounted.getByTestId('settings-content')).toBe(settings);
		router.pushByPath('/@alice/notes');
		await waitFor(() => expect(mounted.getByTestId('profile-content').textContent).toBe('alice/notes'));
		expect(errors).not.toHaveBeenCalled();
		expect(settingsMounts.mock.calls).toEqual([['profile']]);
		expect(profileMounts.mock.calls).toEqual([['alice', 'notes']]);

		router.pushByPath('/@bob/files');
		await waitFor(() => expect(mounted.getAllByTestId('profile-content').at(-1)?.textContent).toBe('bob/files'));
		expect(errors).not.toHaveBeenCalled();
		expect(profileMounts.mock.calls).toEqual([['alice', 'notes'], ['bob', 'files']]);
		expect(settingsMounts.mock.calls).toEqual([['profile']]);

		router.replaceByPath('/settings/profile');
		await waitFor(() => expect(mounted.getByTestId('settings-content').textContent).toBe('profile'));
		router.pushByPath('/settings/privacy');
		await waitFor(() => expect(mounted.getByTestId('settings-content').textContent).toBe('privacy'));
		expect(errors).not.toHaveBeenCalled();
		expect(settingsMounts.mock.calls).toEqual([['profile'], ['privacy']]);
		expect(profileMounts.mock.calls).toEqual([['alice', 'notes'], ['bob', 'files']]);
	});
});

test('initializes a delayed settings layout from its own route while another stacked page is active', async () => {
	let complete!: () => void;
	const ready = new Promise<void>(resolve => { complete = resolve; });
	const settingsMounts = vi.fn();
	const errors = vi.fn();
	const settingsContext = Symbol() as InjectionKey<boolean>;
	const Settings = defineComponent({
		async setup() {
			const router = inject(DI.router)!;
			const initialRoute = router.current;
			provide(settingsContext, true);
			settingsMounts();
			await ready;
			return () => h('section', { 'data-testid': 'settings-parent' }, h(NestedRouterView, { initialRoute }));
		},
	});
	const SettingsContent = defineComponent({
		props: { page: String },
		setup(props) {
			if (!inject(settingsContext, false)) throw new Error('settings content is outside its settings parent');
			return () => h('output', { 'data-testid': 'settings-content' }, props.page);
		},
	});
	const Profile = defineComponent({
		setup: () => () => h('section', { 'data-testid': 'profile-parent' }, h(NestedRouterView)),
	});
	const ProfileContent = defineComponent({
		props: { page: String },
		setup(props) {
			if (inject(settingsContext, false)) throw new Error('profile content is inside the settings parent');
			return () => h('output', { 'data-testid': 'profile-content' }, props.page);
		},
	});
	const routes = [{
		path: '/settings', component: Settings,
		children: [{ path: '/:page', component: SettingsContent }],
	}, {
		path: '/@:acct', component: Profile,
		children: [{ path: '/:page?', component: ProfileContent }],
	}];
	const router = new Nirax(routes, '/settings/profile', true, Settings);
	const mounted = render(StackingRouterView, {
		props: { router: router as unknown as Router },
		global: {
			provide: { [DI.router as symbol]: router },
			stubs: { MkLoading: true },
			config: { errorHandler: errors },
		},
	});
	await waitFor(() => expect(settingsMounts).toHaveBeenCalledTimes(1));
	router.pushByPath('/@alice/notes');
	await waitFor(() => expect(mounted.getByTestId('profile-content').textContent).toBe('notes'));
	const profile = mounted.getByTestId('profile-parent');

	complete();
	await waitFor(() => expect(mounted.getByTestId('settings-content').textContent).toBe('profile'));
	const settings = mounted.getByTestId('settings-parent');
	expect(router.getCurrentFullPath()).toBe('/@alice/notes');
	expect(within(profile).getByTestId('profile-content').textContent).toBe('notes');
	expect(within(settings).queryByTestId('profile-content')).toBeNull();
	expect(errors).not.toHaveBeenCalled();

	router.pushByPath('/settings/profile');
	await waitFor(() => expect(mounted.queryByTestId('profile-parent')).toBeNull());
	expect(mounted.getByTestId('settings-parent')).toBe(settings);
	router.pushByPath('/settings/privacy');
	await waitFor(() => expect(within(settings).getByTestId('settings-content').textContent).toBe('privacy'));
	expect(mounted.getByTestId('settings-parent')).toBe(settings);
	expect(settingsMounts).toHaveBeenCalledTimes(1);
	expect(errors).not.toHaveBeenCalled();
});
