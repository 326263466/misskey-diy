/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { instanceName } from '@@/js/config.js';
import Welcome from '@/pages/welcome.vue';
import MobileFooter from '@/ui/_common_/mobile-footer-menu.vue';
import { useLike } from '@/composables/use-like.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	instance: { requireSetup: false, ugcVisibilityForVisitor: 'local', clientOptions: { entrancePageStyle: 'classic', openGuestAccess: true as boolean | undefined } },
	login: vi.fn(), push: vi.fn(), api: vi.fn(), emit: vi.fn(), definePage: vi.fn(),
}));
vi.mock('@/page.js', () => ({ definePage: mocks.definePage }));
vi.mock('@/instance.js', () => ({ instance: mocks.instance, fetchInstance: async () => mocks.instance }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/pages/timeline.vue', () => ({ default: { template: '<main data-testid="public-timeline"/>' } }));
vi.mock('@/pages/welcome.setup.vue', () => ({ default: { template: '<main data-testid="setup"/>' } }));
vi.mock('@/pages/welcome.entrance.classic.vue', () => ({ default: { template: '<main data-testid="classic-entrance"/>' } }));
vi.mock('@/pages/welcome.entrance.simple.vue', () => ({ default: { template: '<main data-testid="simple-entrance"/>' } }));
vi.mock('@/router.js', () => ({ mainRouter: { push: mocks.push } }));
vi.mock('@/navbar.js', () => ({ navbarItemDef: {} }));
vi.mock('@/os.js', () => ({ post: vi.fn(), apiWithDialog: mocks.api }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: mocks.login }));
vi.mock('@/utility/show-moved-dialog.js', () => ({ showMovedDialog: vi.fn() }));
vi.mock('@/events.js', () => ({ globalEvents: { emit: mocks.emit } }));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.instance.requireSetup = false;
	mocks.instance.ugcVisibilityForVisitor = 'local';
	mocks.instance.clientOptions.entrancePageStyle = 'classic';
	mocks.instance.clientOptions.openGuestAccess = true;
	mocks.login.mockResolvedValue(false);
});
afterEach(cleanup);

describe('public browsing and authenticated interactions', () => {
	test('opens the content feed for a visitor', () => {
		const view = render(Welcome);
		expect(view.getByTestId('public-timeline')).toBeTruthy();
		expect(view.queryByTestId('setup')).toBeNull();
		expect(mocks.login).not.toHaveBeenCalled();
		expect(mocks.definePage).not.toHaveBeenCalled();
	});

	test('preserves initial instance setup', async () => {
		mocks.instance.requireSetup = true;
		const view = render(Welcome);
		await waitFor(() => expect(view.getByTestId('setup')).toBeTruthy());
		expect(view.queryByTestId('public-timeline')).toBeNull();
		expect(mocks.definePage.mock.calls[0][0]()).toEqual({ title: instanceName, icon: null });
	});

	test.each(['classic', 'simple'])('uses the saved %s login entrance by default without changing content visibility', async style => {
		mocks.instance.clientOptions.openGuestAccess = undefined;
		mocks.instance.clientOptions.entrancePageStyle = style;
		const view = render(Welcome);
		await waitFor(() => expect(view.getByTestId(`${style}-entrance`)).toBeTruthy());
		expect(view.queryByTestId('public-timeline')).toBeNull();
		expect(mocks.definePage.mock.calls[0][0]()).toEqual({ title: instanceName, icon: null });
	});

	test('offers public search and login instead of private mobile destinations', async () => {
		const view = render(MobileFooter);
		expect(view.queryByRole('button', { name: i18n.ts.notifications })).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.widgets })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.search }));
		expect(mocks.push).toHaveBeenCalledWith('/search');
		expect(mocks.login).not.toHaveBeenCalled();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.login }));
		expect(mocks.login).toHaveBeenCalledWith({ message: '' });
	});

	test('asks a visitor to log in before sending a like mutation', async () => {
		const { toggleLike, liking } = useLike('public-note', { isLiked: false, likesCount: 0 });
		await toggleLike();
		expect(mocks.login).toHaveBeenCalledOnce();
		expect(mocks.api).not.toHaveBeenCalled();
		expect(mocks.emit).not.toHaveBeenCalled();
		expect(liking.value).toBe(false);
	});
});
