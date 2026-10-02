/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/vue';
import { nextTick } from 'vue';
import Header from '@/ui/_common_/juejin-header.vue';
import Dock from '@/ui/_common_/juejin-dock.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const mocks = vi.hoisted(() => ({ popupAsyncWithDialog: vi.fn(), login: vi.fn(), session: { signedIn: true }, announcement: { indicated: false }, instance: { name: 'Test instance', iconUrl: null, disableRegistration: false } }));

vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: vi.fn() }) }));
vi.mock('@/os.js', () => ({ popupAsyncWithDialog: mocks.popupAsyncWithDialog, popupMenu: vi.fn(), post: vi.fn() }));
vi.mock('@/ui/_common_/common.js', () => ({ openInstanceMenu: vi.fn(), toggleRealtimeMode: vi.fn() }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: mocks.instance }));
vi.mock('@/i.js', () => ({ get $i() { return mocks.session.signedIn ? { id: 'user', username: 'user' } : null; } }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: mocks.login }));
vi.mock('@/components/MkSignupDialog.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/store.js', () => ({ store: { r: { realtimeMode: { value: false } } } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/components/MkModal.vue', () => ({
	default: { template: '<div><slot type="popup" :maxHeight="800"/></div>' },
}));
vi.mock('@/preferences.js', async () => {
	const { reactive, toRef } = await import('vue');
	const state = reactive({ menu: [] as string[] });
	return { prefer: { s: state, r: { menu: toRef(state, 'menu') } } };
});
vi.mock('@/navbar.js', async () => {
	const { computed, reactive } = await import('vue');
	mocks.announcement = reactive(mocks.announcement);
	mocks.session = reactive(mocks.session);
	return { navbarItemDef: reactive({
		explore: { title: 'Explore', icon: 'ti ti-hash', to: '/explore' },
		channels: { title: 'Channels', icon: 'ti ti-device-tv', to: '/channels' },
		announcements: { title: 'Announcements', icon: 'ti ti-speakerphone', to: '/announcements', indicated: computed(() => mocks.announcement.indicated) },
		drive: { title: 'Drive', icon: 'ti ti-cloud', to: '/my/drive', show: computed(() => mocks.session.signedIn) },
		games: { title: 'Games', icon: 'ti ti-device-gamepad', to: '/games' },
		about: { title: 'About', icon: 'ti ti-info-circle', to: '/about' },
		notifications: { title: 'Notifications', icon: 'ti ti-bell', to: '/my/notifications' },
		search: { title: 'Search', icon: 'ti ti-search', to: '/search' },
		checkin: { title: 'Daily check-in', icon: 'ti ti-calendar-check', to: '/checkin', show: computed(() => mocks.session.signedIn) },
		communityRanking: { title: 'Community ranking', icon: 'ti ti-trophy', to: '/community-ranking' },
	}) };
});

const linkStub = { props: ['to'], template: '<a :href="to"><slot/></a>' };
let media: EventTarget & { matches: boolean };

function renderHeader(dockHidden = false) {
	const view = render(Header, {
		props: { dockHidden },
		global: {
			components: { MkA: linkStub },
			stubs: { MkAvatar: true },
			directives: { tooltip: {} },
		},
	});
	if (!(view.container instanceof HTMLElement)) throw new TypeError('Expected an HTML header container');
	return { ...view, container: view.container };
}

function headerLinks(view: ReturnType<typeof renderHeader>) {
	const navigation = within(view.container).getByRole('navigation', { name: i18n.ts.navbar });
	return within(navigation).getAllByRole('link').map(link => link.getAttribute('href'));
}

function moreButton(view: ReturnType<typeof renderHeader>) {
	return within(view.container).getByRole('button', { name: i18n.ts.more });
}

async function setCompact(matches: boolean) {
	media.matches = matches;
	media.dispatchEvent(Object.assign(new Event('change'), { matches }));
	await nextTick();
}

async function openMore(view: ReturnType<typeof renderHeader>) {
	await fireEvent.click(moreButton(view));
	const [componentPromise, props] = mocks.popupAsyncWithDialog.mock.lastCall!;
	const menu = render(await componentPromise, {
		props,
		global: {
			components: { MkA: linkStub },
			directives: { 'click-anime': {} },
		},
	});
	if (!(menu.container instanceof HTMLElement)) throw new TypeError('Expected an HTML menu container');
	return { ...menu, props, content: within(menu.container) };
}

describe('responsive header navigation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.popupAsyncWithDialog.mockResolvedValue({ dispose: vi.fn() });
		mocks.session.signedIn = true;
		mocks.instance.disableRegistration = false;
		prefer.s.menu = [];
		mocks.announcement.indicated = false;
		media = Object.assign(new EventTarget(), { matches: false });
		vi.spyOn(window, 'matchMedia').mockReturnValue(media as MediaQueryList);
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('keeps home and timeline while compact and restores secondary links when the media query changes', async () => {
		const view = renderHeader();
		expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 760px)');
		expect(headerLinks(view)).toEqual(['/', '/timeline', '/explore', '/channels', '/announcements']);
		await setCompact(true);
		expect(headerLinks(view)).toEqual(['/', '/timeline']);
		await setCompact(false);
		expect(headerLinks(view)).toEqual(['/', '/timeline', '/explore', '/channels', '/announcements']);
	});

	test.each([false, true])('keeps collapsed secondary destinations available in More when they are configured in the menu (dockHidden=%s)', async dockHidden => {
		media.matches = true;
		prefer.s.menu = ['explore', 'channels', 'announcements', 'drive'];
		const view = renderHeader(dockHidden);
		expect(headerLinks(view)).toEqual(['/', '/timeline']);
		const menu = await openMore(view);
		expect(menu.props.includeMenuItems).toBe(true);
		for (const [name, path] of [['Explore', '/explore'], ['Channels', '/channels'], ['Announcements', '/announcements']]) {
			expect(menu.content.getByRole('link', { name }).getAttribute('href')).toBe(path);
		}
	});

	test('excludes visible dock destinations and restores them when the parent hides the dock', async () => {
		prefer.s.menu = ['drive'];
		const view = renderHeader(false);
		const visibleDockMenu = await openMore(view);
		for (const name of ['Drive', 'Games', 'About', 'Community ranking']) {
			expect(visibleDockMenu.content.queryByRole('link', { name })).toBeNull();
		}
		expect(visibleDockMenu.content.getByRole('link', { name: 'Daily check-in' }).getAttribute('href')).toBe('/checkin');
		visibleDockMenu.unmount();

		await view.rerender({ dockHidden: true });
		const hiddenDockMenu = await openMore(view);
		for (const name of ['Drive', 'Games', 'About', 'Daily check-in', 'Community ranking']) {
			expect(hiddenDockMenu.content.getByRole('link', { name })).toBeTruthy();
		}
		for (const name of ['Explore', 'Channels', 'Announcements', 'Notifications', 'Search']) {
			expect(hiddenDockMenu.content.queryByRole('link', { name })).toBeNull();
		}
	});

	test.each([false, true])('keeps check-in in More even if configured in the menu (dockHidden=%s)', async dockHidden => {
		prefer.s.menu = ['checkin', 'communityRanking'];
		const view = renderHeader(dockHidden);
		const menu = await openMore(view);
		expect(menu.content.getByRole('link', { name: 'Daily check-in' }).getAttribute('href')).toBe('/checkin');
		if (dockHidden) expect(menu.content.getByRole('link', { name: 'Community ranking' }).getAttribute('href')).toBe('/community-ranking');
		else expect(menu.content.queryByRole('link', { name: 'Community ranking' })).toBeNull();
	});

	test('keeps only the ranking destination in the dock when check-in is also configured in the menu', () => {
		prefer.s.menu = ['checkin', 'communityRanking'];
		const view = render(Dock, { global: { components: { MkA: linkStub } } });
		expect(view.queryByRole('link', { name: i18n.ts._checkin.dailyCheckin })).toBeNull();
		expect(view.getAllByRole('link', { name: i18n.ts.communityRanking })).toHaveLength(1);
		expect(view.getByRole('link', { name: i18n.ts.communityRanking }).getAttribute('href')).toBe('/community-ranking');
	});

	test('keeps the public ranking available and hides check-in from signed-out dock visitors', () => {
		mocks.session.signedIn = false;
		prefer.s.menu = ['checkin', 'communityRanking'];
		const view = render(Dock, { global: { components: { MkA: linkStub } } });
		expect(view.queryByRole('link', { name: i18n.ts._checkin.dailyCheckin })).toBeNull();
		expect(view.getByRole('link', { name: i18n.ts.communityRanking }).getAttribute('href')).toBe('/community-ranking');
	});

	test('hides private dock entries whose reactive visibility is false', () => {
		mocks.session.signedIn = false;
		prefer.s.menu = ['drive', 'checkin', 'about'];
		const view = render(Dock, { global: { components: { MkA: linkStub } } });
		expect(view.queryByRole('link', { name: 'Drive' })).toBeNull();
		expect(view.getByRole('link', { name: 'About' })).toBeTruthy();
	});

	test.each([false, true])('provides guest login and the existing registration flow (invitation required=%s)', async invitationRequired => {
		mocks.session.signedIn = false;
		mocks.instance.disableRegistration = invitationRequired;
		const view = renderHeader();
		expect(view.queryByTestId('open-post-form')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.login }));
		expect(mocks.login).toHaveBeenCalledWith({ message: '' });
		const signup = view.getByRole('button', { name: i18n.ts.signup });
		expect(signup.getAttribute('title')).toBe(invitationRequired ? i18n.ts.invitationRequiredToRegister : i18n.ts.signup);
		await fireEvent.click(signup);
		expect(mocks.popupAsyncWithDialog).toHaveBeenCalledWith(expect.any(Promise), { autoSet: true }, expect.any(Object));
		expect(mocks.instance.disableRegistration).toBe(invitationRequired);
	});

	test('moves an unread announcement indicator to More while its header link is collapsed', async () => {
		prefer.s.menu = ['announcements'];
		mocks.announcement.indicated = true;
		const view = renderHeader();
		expect(within(view.container).getByRole('link', { name: 'Announcements' }).querySelector('._indicatorCircle')).not.toBeNull();
		expect(moreButton(view).querySelector('._indicatorCircle')).toBeNull();

		await setCompact(true);
		expect(within(view.container).queryByRole('link', { name: 'Announcements' })).toBeNull();
		expect(moreButton(view).querySelector('._indicatorCircle')).not.toBeNull();
		mocks.announcement.indicated = false;
		await nextTick();
		expect(moreButton(view).querySelector('._indicatorCircle')).toBeNull();
		mocks.announcement.indicated = true;
		await setCompact(false);
		expect(moreButton(view).querySelector('._indicatorCircle')).toBeNull();
	});

	test('removes the navigation media listener when the header unmounts', () => {
		const removeListener = vi.spyOn(media, 'removeEventListener');
		const view = renderHeader();
		view.unmount();
		expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function));
	});
});
