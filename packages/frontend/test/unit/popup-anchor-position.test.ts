/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkSpot from '@/components/MkSpot.vue';
import MkUrlPreviewPopup from '@/components/MkUrlPreviewPopup.vue';

vi.mock('@/os.js', () => ({ claimZIndex: () => 100 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { template: '<div>Preview</div>' } }));

let scroller: HTMLDivElement;
let anchor: HTMLButtonElement;
let anchorRect: DOMRect;

describe('popup anchor positions', () => {
	beforeEach(() => {
		vi.stubGlobal('innerWidth', 1000);
		vi.stubGlobal('innerHeight', 800);
		vi.stubGlobal('scrollX', 120);
		vi.stubGlobal('scrollY', 500);
		vi.stubGlobal('ResizeObserver', class {
			observe() {}
			disconnect() {}
		});
		vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
		vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
		vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
		scroller = document.createElement('div');
		anchor = document.createElement('button');
		anchorRect = new DOMRect(400, 100, 40, 20);
		anchor.getBoundingClientRect = vi.fn(() => anchorRect);
		scroller.append(anchor);
		document.body.append(scroller);
	});

	afterEach(() => {
		cleanup();
		scroller.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test('keeps a URL preview attached while its ancestor scrolls and the viewport shrinks', async () => {
		const view = render(MkUrlPreviewPopup, {
			props: { showing: true, url: 'https://example.test', anchorElement: anchor },
		});
		await nextTick();
		const panel = view.container.firstElementChild as HTMLElement;
		expect([panel.style.left, panel.style.top]).toEqual(['520px', '628px']);
		expect(panel.querySelector<HTMLElement>('._popup')!.style.transformOrigin).toBe('left top');

		anchorRect = new DOMRect(100, 300, 40, 20);
		await fireEvent.scroll(scroller);
		expect([panel.style.left, panel.style.top]).toEqual(['220px', '828px']);

		anchorRect = new DOMRect(700, 150, 40, 20);
		vi.stubGlobal('innerWidth', 800);
		vi.stubGlobal('innerHeight', 250);
		await fireEvent.resize(window);
		expect([panel.style.left, panel.style.top]).toEqual(['719px', '542px']);
		expect(panel.querySelector<HTMLElement>('._popup')!.style.transformOrigin).toBe('left bottom');

		view.unmount();
		vi.mocked(anchor.getBoundingClientRect).mockClear();
		await fireEvent.scroll(scroller);
		await fireEvent.resize(window);
		expect(anchor.getBoundingClientRect).not.toHaveBeenCalled();
	});

	test('positions the fixed tour panel in viewport coordinates after document scrolling', async () => {
		const view = render(MkSpot, {
			props: { title: 'Tour', description: 'Description', anchorElement: anchor, hasPrev: false, hasNext: false, direction: 'bottom' },
		});
		await nextTick();
		const panel = view.container.querySelector<HTMLElement>('._panel')!;
		expect([panel.style.left, panel.style.top]).toEqual(['320px', '136px']);
	});
});
