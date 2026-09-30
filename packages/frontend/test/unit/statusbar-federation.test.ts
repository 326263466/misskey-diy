/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import tinycolor from 'tinycolor2';
import StatusbarFederation from '@/ui/_common_/statusbar-federation.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/media-proxy.js', () => ({ getProxiedImageUrlNullable: () => null }));

function renderStatusbar(themeColor: string | null, colored = true) {
	mocks.api.mockResolvedValue([{ id: 'remote', host: 'remote.test', themeColor }]);
	return render(StatusbarFederation, {
		props: { display: 'marquee', colored, refreshIntervalSec: 60 },
		global: {
			stubs: {
				MkA: { props: ['to'], template: '<a :href="to"><slot /></a>' },
				MkMarqueeText: { template: '<div><slot /></div>' },
			},
		},
	});
}

describe('federation statusbar colors', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(cleanup);

	test.each(['#ffffff', '#000000', '#47bfe8', '#808080', '#86b300'])('keeps the instance link readable on %s', async themeColor => {
		const view = renderStatusbar(themeColor);
		const link = await view.findByRole('link', { name: 'remote.test' });
		const item = link.parentElement!;
		expect(link.getAttribute('href')).toBe('/instance-info/remote.test');
		expect(tinycolor(item.style.backgroundColor).toHexString()).toBe(themeColor);
		expect(tinycolor.readability(item.style.backgroundColor, item.style.color)).toBeGreaterThanOrEqual(4.5);
	});

	test.each([null, '', 'not-a-color', 'transparent', 'rgba(255, 255, 255, 0.5)', '#00000080'])('inherits the statusbar colors for %s', async themeColor => {
		const view = renderStatusbar(themeColor);
		const item = (await view.findByRole('link', { name: 'remote.test' })).parentElement!;
		expect(item.style.backgroundColor).toBe('');
		expect(item.style.color).toBe('');
	});

	test('updates both colors when colored display is toggled', async () => {
		const view = renderStatusbar('#ffffff', false);
		const item = (await view.findByRole('link', { name: 'remote.test' })).parentElement!;
		expect(item.style.backgroundColor).toBe('');
		expect(item.style.color).toBe('');

		await view.rerender({ colored: true });
		expect(tinycolor(item.style.backgroundColor).toHexString()).toBe('#ffffff');
		expect(tinycolor(item.style.color).toHexString()).toBe('#000000');

		await view.rerender({ colored: false });
		expect(item.style.backgroundColor).toBe('');
		expect(item.style.color).toBe('');
	});
});
