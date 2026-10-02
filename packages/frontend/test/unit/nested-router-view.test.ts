/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor, within } from '@testing-library/vue';
import { defineComponent, h, inject, provide } from 'vue';
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
])('nested routes retained by $name', ({ view }) => {
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
