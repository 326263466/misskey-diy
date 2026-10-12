/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import type { PageMetadata } from '@/page.js';
import Universal from '@/ui/universal.vue';
import { mainRouter } from '@/router.js';
import { readAuthorCard, saveAuthorCard } from '@/utility/author-card-cache.js';
import type { AuthorCardSnapshot } from '@/utility/author-card-cache.js';

const mocks = vi.hoisted(() => ({
	receiveMetadata: null as ((getter: () => PageMetadata | null) => void) | null,
	signedIn: false,
}));

vi.mock('@/router.js', async () => {
	const { computed, shallowRef } = await import('vue');
	const currentRoute = shallowRef({ path: '/settings' });
	return { mainRouter: {
		currentRoute,
		currentRef: computed(() => ({ _parsedRoute: { fullPath: currentRoute.value.path } })),
		on: vi.fn(),
	} };
});
vi.mock('@/page.js', () => ({
	provideMetadataReceiver: (receiver: typeof mocks.receiveMetadata) => { mocks.receiveMetadata = receiver; },
	provideReactiveMetadata: vi.fn(),
}));
vi.mock('@/preferences.js', () => ({ prefer: { s: {}, r: { showTitlebar: { value: false } } } }));
vi.mock('@/preferences/utility.js', () => ({ shouldSuggestRestoreBackup: false }));
vi.mock('@/utility/reload-suggest.js', () => ({ shouldSuggestReload: false }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null } }));
vi.mock('@/theme.js', () => ({ isPreviewMode: false }));
vi.mock('@/i.js', () => ({ get $i() { return mocks.signedIn ? { id: 'self' } : null; } }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/components/MkUserCardMini.vue', () => ({ default: { props: ['user'], template: '<div>{{ user.name }}</div>' } }));
vi.mock('@/ui/_common_/common.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/mobile-footer-menu.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/PreferenceRestore.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/ReloadSuggestion.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/ThemePreviewing.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/titlebar.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/header.vue', () => ({
	default: { props: ['dockHidden'], template: '<header data-testid="header" :data-dock-hidden="dockHidden"/>' },
}));
vi.mock('@/ui/_common_/dock.vue', () => ({ default: { template: '<nav/>' } }));
vi.mock('@/ui/_common_/floating-actions.vue', () => ({
	default: { props: ['content'], template: '<div data-testid="floating-actions"/>' },
}));
vi.mock('@/ui/_common_/widgets.vue', () => ({ default: { template: '<aside/>' } }));
vi.mock('@/ui/_common_/statusbars.vue', () => ({ __esModule: true, default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/announcements.vue', () => ({ default: { template: '<div/>' } }));

function setRoute(path: string) {
	mainRouter.currentRoute.value = { path } as typeof mainRouter.currentRoute.value;
}

function renderShell() {
	const view = render(Universal, {
		global: {
			components: { RouterView: { template: '<main data-testid="page"/>' } },
		},
	});
	const columns = view.getByTestId('page').parentElement!.parentElement!;
	return { view, columns };
}

async function publishMetadata(needWideArea: boolean) {
	expect(mocks.receiveMetadata).not.toBeNull();
	mocks.receiveMetadata!(() => ({ title: 'Page', needWideArea }));
	await nextTick();
}

beforeEach(() => {
	vi.stubGlobal('innerWidth', 1440);
	mocks.receiveMetadata = null;
	mocks.signedIn = false;
	window.sessionStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('desktop navigation page layout', () => {
	test('restores the author on refresh without storing account secrets or mixing accounts and routes', () => {
		mocks.signedIn = true;
		const snapshot = {
			path: '/articles/example', user: { id: 'self', name: 'Cached author', username: 'author', token: 'do-not-store' },
			bannerUrl: '/banner.png', stats: { articlesCount: 3, articleViewsCount: 8 }, followersCount: 2,
		} as unknown as AuthorCardSnapshot;
		saveAuthorCard(snapshot);
		expect(readAuthorCard(snapshot.path)?.user.name).toBe('Cached author');
		expect(window.sessionStorage.getItem('author-card:self')).not.toContain('do-not-store');
		expect(readAuthorCard('/articles/other')).toBeNull();
		mainRouter.currentRoute.value = { name: 'article', path: snapshot.path } as typeof mainRouter.currentRoute.value;
		const { view } = renderShell();
		expect(view.getByText('Cached author')).toBeTruthy();
		mocks.signedIn = false;
		expect(readAuthorCard(snapshot.path)).toBeNull();
		mocks.signedIn = true;
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000);
		expect(readAuthorCard(snapshot.path)).toBeNull();
	});

	test('ignores an unreadable author snapshot', () => {
		window.sessionStorage.setItem('author-card:guest', '{broken');
		expect(readAuthorCard('/articles/example')).toBeNull();
	});

	test.each(['/articles/new', '/articles/edit/:articleId'])('keeps %s in a single column before and after metadata arrives', async path => {
		setRoute(path);
		const { view, columns } = renderShell();
		const initialClasses = columns.className;
		expect(initialClasses).toContain('articleEditor');
		expect(initialClasses).toContain('singleColumn');
		expect(view.container.querySelector('nav')).toBeNull();
		expect(view.container.querySelector('aside')).toBeNull();
		expect(view.queryByTestId('header')).toBeNull();
		await publishMetadata(true);
		expect(columns.className).toBe(initialClasses);
		await publishMetadata(false);
		expect(columns.className).toBe(initialClasses);
		setRoute('/timeline');
		await nextTick();
		expect(view.getByTestId('header')).toBeTruthy();
	});

	test('uses the wallet navigation layout before its benefits child loads', async () => {
		setRoute('/wallet');
		const { view, columns } = renderShell();
		const initialClasses = columns.className;
		expect(initialClasses).toContain('navigationLayout');
		expect(initialClasses).not.toContain('singleColumn');
		expect(view.container.querySelector('nav')).toBeNull();
		expect(view.container.querySelector('aside')).toBeNull();
		await publishMetadata(true);
		expect(columns.className).toBe(initialClasses);
		await publishMetadata(false);
		expect(columns.className).toBe(initialClasses);
	});

	test.each(['/checkin', '/community-ranking', '/my/achievements'])('keeps %s in its own layout while metadata changes', async path => {
		setRoute('/timeline');
		const { view, columns } = renderShell();
		await publishMetadata(true);
		setRoute(path);
		await nextTick();
		const loadingClasses = columns.className;
		expect(view.container.querySelector('nav')).toBeNull();
		expect(view.container.querySelector('aside')).toBeNull();
		expect(view.getByTestId('header').getAttribute('data-dock-hidden')).toBe('true');
		await publishMetadata(false);
		expect(columns.className).toBe(loadingClasses);
		await publishMetadata(true);
		expect(columns.className).toBe(loadingClasses);
	});

	test.each(['/settings', '/admin', '/wallet', '/feedback'])('keeps %s at its final width before async metadata arrives', async path => {
		setRoute(path);
		const { columns } = renderShell();
		const initialClasses = columns.className;

		await publishMetadata(true);
		expect(columns.className).toBe(initialClasses);
		await publishMetadata(false);
		expect(columns.className).toBe(initialClasses);
	});

	test.each(['/settings', '/admin'])('keeps the profile layout stable while metadata from %s is still present', async path => {
		setRoute(path);
		const { columns } = renderShell();
		await publishMetadata(true);

		setRoute('/@:acct');
		await nextTick();
		const loadingClasses = columns.className;
		await publishMetadata(false);
		expect(columns.className).toBe(loadingClasses);
	});

	test('still honors wide-area metadata on other pages', async () => {
		setRoute('/timeline');
		const { columns } = renderShell();
		const initialClasses = columns.className;
		await publishMetadata(true);
		expect(columns.className).not.toBe(initialClasses);
		await publishMetadata(false);
		expect(columns.className).toBe(initialClasses);
	});

	test('omits the navigation dock on a note detail route before its metadata loads', async () => {
		setRoute('/settings');
		const { view, columns } = renderShell();
		await publishMetadata(true);
		mainRouter.currentRoute.value = { name: 'note', path: '/notes/:noteId/:initialTab?' } as typeof mainRouter.currentRoute.value;
		await nextTick();
		const loadingClasses = columns.className;
		expect(loadingClasses).not.toContain('wide');
		expect(view.container.querySelector('nav')).toBeNull();
		expect(view.container.querySelector('aside')).toBeNull();
		expect(view.getByTestId('header').getAttribute('data-dock-hidden')).toBe('true');
		await publishMetadata(false);
		expect(columns.className).toBe(loadingClasses);
		await publishMetadata(true);
		expect(columns.className).toBe(loadingClasses);
		setRoute('/timeline');
		await publishMetadata(false);
		expect(view.container.querySelector('nav')).not.toBeNull();
	});
});

describe('header dock visibility', () => {
	test.each([
		{ width: 500, hidden: true },
		{ width: 501, hidden: true },
		{ width: 751, hidden: true },
		{ width: 752, hidden: false },
		{ width: 1440, hidden: false },
	])('matches the mobile and dock boundaries at $width px', ({ width, hidden }) => {
		vi.stubGlobal('innerWidth', width);
		setRoute('/timeline');
		const { view } = renderShell();
		expect(view.getByTestId('header').getAttribute('data-dock-hidden')).toBe(String(hidden));
	});

	test.each(['/@:acct', '/@:acct/following', '/@:acct/followers', '/settings', '/admin', '/wallet'])('reports the hidden dock on %s even at desktop width', path => {
		setRoute(path);
		const { view } = renderShell();
		expect(view.getByTestId('header').getAttribute('data-dock-hidden')).toBe('true');
	});

	test('updates the header when the window crosses dock and mobile boundaries', async () => {
		setRoute('/timeline');
		const { view } = renderShell();
		for (const { width, hidden } of [
			{ width: 751, hidden: true },
			{ width: 500, hidden: true },
			{ width: 501, hidden: true },
			{ width: 752, hidden: false },
		]) {
			vi.stubGlobal('innerWidth', width);
			window.dispatchEvent(new Event('resize'));
			await nextTick();
			expect(view.getByTestId('header').getAttribute('data-dock-hidden')).toBe(String(hidden));
		}
	});

	test('preserves the signed-in mobile layout without a guest header', () => {
		mocks.signedIn = true;
		vi.stubGlobal('innerWidth', 375);
		setRoute('/timeline');
		const { view } = renderShell();
		expect(view.queryByTestId('header')).toBeNull();
	});

	test('updates the header when page metadata hides or restores the dock', async () => {
		setRoute('/timeline');
		const { view } = renderShell();
		expect(view.getByTestId('header').getAttribute('data-dock-hidden')).toBe('false');
		await publishMetadata(true);
		expect(view.getByTestId('header').getAttribute('data-dock-hidden')).toBe('true');
		await publishMetadata(false);
		expect(view.getByTestId('header').getAttribute('data-dock-hidden')).toBe('false');
	});

	test('removes the resize listener when the shell unmounts', () => {
		const addListener = vi.spyOn(window, 'addEventListener');
		const removeListener = vi.spyOn(window, 'removeEventListener');
		setRoute('/timeline');
		const { view } = renderShell();
		const resizeListener = addListener.mock.calls.find(([type]) => String(type) === 'resize')?.[1];
		expect(resizeListener).toEqual(expect.any(Function));
		view.unmount();
		expect(removeListener).toHaveBeenCalledWith('resize', resizeListener);
	});
});
