/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkTooltip from '@/components/MkTooltip.vue';

vi.mock('@/os.js', () => ({ claimZIndex: () => 100 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));

describe('tooltip arrow alignment', () => {
	beforeEach(() => {
		vi.stubGlobal('innerWidth', 1000);
		vi.stubGlobal('innerHeight', 800);
		vi.stubGlobal('scrollX', 0);
		vi.stubGlobal('scrollY', 0);
		vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test.each([
		{ direction: 'bottom', left: 400, top: 100, arrowPosition: '49px' },
		{ direction: 'bottom', left: 0, top: 100, arrowPosition: '10px' },
		{ direction: 'bottom', left: 980, top: 100, arrowPosition: '88px' },
		{ direction: 'bottom', left: 0, top: 780, arrowPosition: '10px' },
		{ direction: 'right', left: 100, top: 0, arrowPosition: '10px' },
		{ direction: 'right', left: 100, top: 780, arrowPosition: '88px' },
		{ direction: 'right', left: 980, top: 0, arrowPosition: '10px' },
	] as const)('keeps the arrow pointing at a trigger near ($left, $top), preferring $direction', async ({ direction, left, top, arrowPosition }) => {
		const anchor = document.createElement('button');
		anchor.getBoundingClientRect = () => new DOMRect(left, top, 20, 20);
		const view = render(MkTooltip, {
			props: { showing: true, anchorElement: anchor, direction, text: 'Tooltip' },
			global: { stubs: { Mfm: true } },
		});
		const panel = view.getByText('Tooltip').parentElement!;
		const arrow = panel.lastElementChild!;
		Object.defineProperties(panel, {
			offsetWidth: { value: 100 }, offsetHeight: { value: 100 },
			clientWidth: { value: 98 }, clientHeight: { value: 98 },
			clientLeft: { value: 1 }, clientTop: { value: 1 },
		});
		Object.defineProperties(arrow, {
			offsetWidth: { value: 10 }, offsetHeight: { value: 10 },
		});
		await nextTick();
		expect(panel.style.getPropertyValue('--MI-tooltip-arrow-position')).toBe(arrowPosition);
	});
});
