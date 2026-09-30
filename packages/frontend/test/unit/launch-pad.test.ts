/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import MkLaunchPad from '@/components/MkLaunchPad.vue';
import { prefer } from '@/preferences.js';

vi.mock('@/components/MkModal.vue', () => ({
	default: { template: '<div><slot type="dialog" :maxHeight="800"/></div>' },
}));

vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));

vi.mock('@/navbar.js', () => ({
	navbarItemDef: {
		drive: { title: 'Drive', icon: 'ti ti-cloud', to: '/my/drive' },
		games: { title: 'Games', icon: 'ti ti-device-gamepad', to: '/games' },
		search: { title: 'Search', icon: 'ti ti-search', to: '/search' },
		chat: { title: 'Chat', icon: 'ti ti-message-dots', to: '/chat', show: false },
	},
}));

function renderLaunchPad(props: { includeMenuItems?: boolean; excludedItems?: string[] } = {}) {
	return render(MkLaunchPad, {
		props,
		global: {
			components: { MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' } },
			directives: { 'click-anime': {} },
		},
	});
}

describe('MkLaunchPad navigation', () => {
	beforeEach(() => {
		prefer.s.menu = ['drive', 'chat'];
	});

	afterEach(cleanup);

	test('keeps configured navigation items out of the default menu', () => {
		const view = renderLaunchPad();
		expect(view.queryByRole('link', { name: 'Drive' })).toBeNull();
		expect(view.getByRole('link', { name: 'Games' }).getAttribute('href')).toBe('/games');
	});

	test('includes hidden dock entries while preserving explicit exclusions and availability', () => {
		const view = renderLaunchPad({ includeMenuItems: true, excludedItems: ['search'] });
		expect(view.getByRole('link', { name: 'Drive' }).getAttribute('href')).toBe('/my/drive');
		expect(view.getByRole('link', { name: 'Games' }).getAttribute('href')).toBe('/games');
		expect(view.queryByRole('link', { name: 'Search' })).toBeNull();
		expect(view.queryByRole('link', { name: 'Chat' })).toBeNull();
	});
});
