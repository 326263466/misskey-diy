/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkPopupMenu from '@/components/MkPopupMenu.vue';
import MkModal from '@/components/MkModal.vue';
import { prefer } from '@/preferences.js';

const menuMeasurements = vi.hoisted(() => ({ naturalHeight: 300 }));

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
// lastPointerX 为 NaN 时回退到锚点元素的矩形，即指针位置未知时的默认行为
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false, lastPointerX: NaN }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: vi.fn() }) }));
vi.mock('@/utility/focus.js', () => ({ focusParent: vi.fn() }));
vi.mock('@/components/MkMenu.vue', () => ({
	default: {
		props: ['width', 'maxHeight', 'asDrawer', 'guardInitialPointer'],
		methods: { getContentHeight: () => menuMeasurements.naturalHeight },
		template: '<div data-testid="menu" :data-width="width" :data-max-height="maxHeight" :data-drawer="asDrawer" :data-guarded="guardInitialPointer"/>',
	},
}));

const initialViewport = {
	innerWidth: window.innerWidth,
	innerHeight: window.innerHeight,
	scrollX: window.scrollX,
	scrollY: window.scrollY,
};
let anchor: HTMLButtonElement;

function prepareAnchor(left: number, top: number, height = 300, fixed = false, width = 200, anchorSize = { width: 24, height: 24 }) {
	menuMeasurements.naturalHeight = height;
	anchor = document.createElement('button');
	if (fixed) anchor.style.position = 'fixed';
	document.body.append(anchor);
	vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(left, top, anchorSize.width, anchorSize.height));
	vi.spyOn(anchor, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
		return this === anchor ? anchorSize.width : width;
	});
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
		if (this === anchor) return anchorSize.height;
		const menu = this.matches('[data-testid="menu"]') ? this : this.querySelector('[data-testid="menu"]');
		const maxHeight = menu?.getAttribute('data-max-height');
		return Math.min(height, window.innerHeight - 32, maxHeight == null ? Infinity : Number(maxHeight));
	});
	vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
		return this === anchor ? anchorSize.height : height;
	});
}

async function renderMenu(props: { matchAnchorWidth?: boolean; width?: number } = {}) {
	const view = render(MkPopupMenu, {
		props: { items: [], anchorElement: anchor, ...props },
		global: { directives: { hotkey: () => {} } },
	});
	await nextTick();
	await nextTick();
	const menu = view.getByTestId('menu');
	return { ...view, menu, content: menu.parentElement! };
}

async function renderPopup(props: { anchor?: { x: string; y: string }; align?: 'left' | 'center' | 'right'; preferType?: 'popup' | 'dialog' | 'drawer' } = {}) {
	const view = render(MkModal, {
		props: { anchorElement: anchor, ...props },
		slots: { default: '<div data-testid="content"/>' },
		global: { directives: { hotkey: () => {} } },
	});
	await nextTick();
	await nextTick();
	return { ...view, content: view.getByTestId('content').parentElement! };
}

beforeEach(() => {
	Object.assign(window, { innerWidth: 1000, innerHeight: 800, scrollX: 0, scrollY: 0 });
	prefer.s.menuStyle = 'popup';
});

afterEach(() => {
	cleanup();
	anchor?.remove();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	Object.assign(window, initialViewport);
});

describe('select dropdown menus', () => {
	test('left-aligns an anchored panel and follows the trigger after scrolling', async () => {
		prepareAnchor(280, 100, 200, false, 460, { width: 120, height: 32 });
		const { content } = await renderPopup({ align: 'left' });
		expect([content.style.left, content.style.top]).toEqual(['280px', '140px']);
		vi.mocked(anchor.getBoundingClientRect).mockReturnValue(new DOMRect(320, 150, 120, 32));
		document.dispatchEvent(new Event('scroll'));
		await nextTick();
		expect([content.style.left, content.style.top]).toEqual(['320px', '190px']);
	});

	test('restores its trigger when a composer disposes the panel directly', async () => {
		prepareAnchor(280, 100, 200);
		const view = await renderPopup({ align: 'left' });
		expect(anchor.style.pointerEvents).toBe('none');
		view.unmount();
		expect(anchor.style.pointerEvents).toBe('auto');
	});

	test('stays inside the viewport when a panel is clamped horizontally and flipped above', async () => {
		prepareAnchor(800, 650, 200, false, 460, { width: 120, height: 32 });
		const { content } = await renderPopup({ align: 'left' });
		expect([content.style.left, content.style.top]).toEqual(['524px', '442px']);
	});

	test('end-aligns account-style menus near the screen edge', async () => {
		prepareAnchor(920, 30, 300, false, 200, { width: 40, height: 40 });
		const { content } = await renderMenu();
		expect([content.style.left, content.style.top]).toEqual(['760px', '78px']);
	});

	test('opens directly below the select and preserves its supplied width', async () => {
		prepareAnchor(600, 100, 96, false, 160, { width: 160, height: 36 });
		const { content, menu } = await renderMenu({ matchAnchorWidth: true, width: 160 });
		expect(content.style.left).toBe('600px');
		expect(content.style.top).toBe('144px');
		expect(menu.getAttribute('data-width')).toBe('160');
		expect(menu.getAttribute('data-guarded')).toBe('false');
	});

	test.each([false, true])('uses the correct coordinates on a scrolled document (fixed=%s)', async fixed => {
		Object.assign(window, { scrollX: 120, scrollY: 600 });
		prepareAnchor(600, 100, 96, fixed, 160, { width: 160, height: 36 });
		const { content } = await renderMenu({ matchAnchorWidth: true });
		expect(content.style.left).toBe(`${600 + (fixed ? 0 : 120)}px`);
		expect(content.style.top).toBe(`${144 + (fixed ? 0 : 600)}px`);
	});

	test('opens above the select when there is insufficient room below', async () => {
		prepareAnchor(600, 700, 120, false, 160, { width: 160, height: 36 });
		const { content, menu } = await renderMenu({ matchAnchorWidth: true });
		expect(content.style.left).toBe('600px');
		expect(content.style.top).toBe('572px');
		expect(menu.getAttribute('data-guarded')).toBe('false');
	});

	test.each([
		{ top: 300, expectedTop: 344, availableHeight: 440 },
		{ top: 450, expectedTop: 16, availableHeight: 426 },
	])('limits tall menus to the roomier side of the select at y=$top', async ({ top, expectedTop, availableHeight }) => {
		prepareAnchor(600, top, 900, false, 160, { width: 160, height: 36 });
		const { content, menu } = await renderMenu({ matchAnchorWidth: true });
		expect(content.style.left).toBe('600px');
		expect(content.style.top).toBe(`${expectedTop}px`);
		expect(Number(menu.getAttribute('data-max-height'))).toBe(availableHeight);
		expect(Number.parseFloat(content.style.top) + content.offsetHeight).toBeLessThanOrEqual(window.innerHeight - 16);
		expect(menu.getAttribute('data-guarded')).toBe('false');
	});

	test('keeps the complete menu within the viewport when the select is near the right edge', async () => {
		prepareAnchor(910, 100, 96, false, 160, { width: 160, height: 36 });
		const { content } = await renderMenu({ matchAnchorWidth: true });
		expect(content.style.left).toBe('824px');
		expect(content.style.top).toBe('144px');
	});

	test('follows its anchor when a containing scroller scrolls', async () => {
		prepareAnchor(600, 100, 96, false, 160, { width: 160, height: 36 });
		const scroller = document.createElement('div');
		document.body.append(scroller);
		scroller.append(anchor);
		try {
			const { content } = await renderMenu({ matchAnchorWidth: true });
			vi.mocked(anchor.getBoundingClientRect).mockReturnValue(new DOMRect(500, 180, 160, 36));
			scroller.dispatchEvent(new Event('scroll', { bubbles: false }));
			await nextTick();
			await nextTick();
			expect(content.style.left).toBe('500px');
			expect(content.style.top).toBe('224px');
		} finally {
			scroller.remove();
		}
	});

	test('repositions on resize and restores the natural height when there is enough room', async () => {
		window.innerHeight = 400;
		prepareAnchor(600, 170, 300, false, 160, { width: 160, height: 36 });
		const { content, menu } = await renderMenu({ matchAnchorWidth: true });
		expect(content.style.top).toBe('214px');
		expect(Number(menu.getAttribute('data-max-height'))).toBe(170);
		Object.assign(window, { innerWidth: 700, innerHeight: 800 });
		window.dispatchEvent(new Event('resize'));
		await nextTick();
		await nextTick();
		expect(content.style.left).toBe('524px');
		expect(content.style.top).toBe('214px');
		expect(content.offsetHeight).toBe(300);
	});

	test('updates its width when the select resizes without a window resize', async () => {
		const observedElements = new Map<Element, () => void>();
		vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
			constructor(private callback: ResizeObserverCallback) {}
			observe(target: Element) {
				observedElements.set(target, () => this.callback([], this));
			}
			unobserve(target: Element) {
				observedElements.delete(target);
			}
			disconnect() {
				observedElements.clear();
			}
		});
		prepareAnchor(600, 100, 96, false, 160, { width: 160, height: 36 });
		const { content, menu } = await renderMenu({ matchAnchorWidth: true, width: 160 });
		expect(menu.getAttribute('data-width')).toBe('160');
		expect(observedElements.has(anchor)).toBe(true);
		vi.mocked(anchor.getBoundingClientRect).mockReturnValue(new DOMRect(500, 100, 210.5, 36));
		observedElements.get(anchor)!();
		await nextTick();
		await nextTick();
		expect(content.style.left).toBe('500px');
		expect(content.style.top).toBe('144px');
		expect(menu.getAttribute('data-width')).toBe('210.5');
	});

	test('retains drawer positioning and height limits when dropdown placement is requested', async () => {
		prefer.s.menuStyle = 'drawer';
		prepareAnchor(600, 100, 300, false, 160, { width: 160, height: 36 });
		const { content, menu } = await renderMenu({ matchAnchorWidth: true });
		expect(menu.getAttribute('data-drawer')).toBe('true');
		expect(Number(menu.getAttribute('data-max-height'))).toBeCloseTo(800 / 1.5);
		expect(content.style.left).toBe('');
		expect(content.style.top).toBe('');
		window.dispatchEvent(new Event('resize'));
		await nextTick();
		expect(content.style.left).toBe('');
		expect(content.style.top).toBe('');
	});
});

describe('button-triggered menus', () => {
	test.each([
		{ x: 100, y: 100, left: 100, top: 132 },
		{ x: 900, y: 100, left: 724, top: 132 },
		{ x: 100, y: 700, left: 100, top: 392 },
		{ x: 900, y: 700, left: 724, top: 392 },
	])('hangs below the start edge at ($x, $y), flipping above or to the end edge when short on room', async ({ x, y, left, top }) => {
		prepareAnchor(x, y);
		const { content } = await renderMenu();
		expect(content.style.left).toBe(`${left}px`);
		expect(content.style.top).toBe(`${top}px`);
	});

	test.each([false, true])('positions a menu correctly on a scrolled document (fixed=%s)', async fixed => {
		Object.assign(window, { scrollX: 120, scrollY: 600 });
		prepareAnchor(900, 700, 300, fixed);
		const { content } = await renderMenu();
		expect(content.style.left).toBe(`${724 + (fixed ? 0 : 120)}px`);
		expect(content.style.top).toBe(`${392 + (fixed ? 0 : 600)}px`);
	});

	test('follows its anchor when a containing scroller scrolls', async () => {
		prepareAnchor(100, 100, 96, false, 160);
		const scroller = document.createElement('div');
		document.body.append(scroller);
		scroller.append(anchor);
		try {
			const { content } = await renderMenu();
			vi.mocked(anchor.getBoundingClientRect).mockReturnValue(new DOMRect(500, 180, 24, 24));
			scroller.dispatchEvent(new Event('scroll', { bubbles: false }));
			await nextTick();
			await nextTick();
			expect(content.style.left).toBe('500px');
			expect(content.style.top).toBe('212px');
		} finally {
			scroller.remove();
		}
	});

	test('keeps the complete menu within the viewport after a window resize', async () => {
		prepareAnchor(600, 300, 96, false, 160);
		const { content } = await renderMenu();
		Object.assign(window, { innerWidth: 700, innerHeight: 400 });
		window.dispatchEvent(new Event('resize'));
		await nextTick();
		await nextTick();
		const left = Number.parseFloat(content.style.left);
		const top = Number.parseFloat(content.style.top);
		expect(left).toBeGreaterThanOrEqual(0);
		expect(top).toBeGreaterThanOrEqual(0);
		expect(left + content.offsetWidth).toBeLessThanOrEqual(window.innerWidth);
		expect(top + content.offsetHeight).toBeLessThanOrEqual(window.innerHeight);
	});

	test('keeps tall content fully expanded beside the button instead of covering it', async () => {
		prepareAnchor(100, 500, 650);
		const { content, menu } = await renderMenu();
		expect(content.style.left).toBe('132px');
		expect(content.style.top).toBe('134px');
		expect(menu.getAttribute('data-max-height')).toBeNull();
		expect(menu.getAttribute('data-guarded')).toBe('false');
	});

	test('falls back to the roomiest side without covering the button when nothing fits', async () => {
		window.innerWidth = 600;
		prepareAnchor(288, 388, 650, false, 400);
		const { content, menu } = await renderMenu();
		expect(content.style.left).toBe('184px');
		expect(content.style.top).toBe('420px');
		expect(menu.getAttribute('data-guarded')).toBe('false');
		expect(Number(menu.getAttribute('data-max-height'))).toBe(364);
	});

	test('does not change drawer positioning or its existing height limit', async () => {
		prefer.s.menuStyle = 'drawer';
		prepareAnchor(100, 500);
		const { content, menu } = await renderMenu();
		expect(menu.getAttribute('data-drawer')).toBe('true');
		expect(menu.getAttribute('data-guarded')).toBe('false');
		expect(Number(menu.getAttribute('data-max-height'))).toBeCloseTo(800 / 1.5);
		expect(content.style.left).toBe('');
		expect(content.style.top).toBe('');
	});

	test('does not change positioning for non-menu popups', async () => {
		prepareAnchor(100, 100);
		const view = render(MkModal, {
			props: { anchorElement: anchor },
			slots: { default: '<div data-testid="content"/>' },
			global: { directives: { hotkey: () => {} } },
		});
		await nextTick();
		await nextTick();
		const content = view.getByTestId('content').parentElement!;
		expect(content.style.left).toBe('12px');
		expect(content.style.top).toBe('132px');
	});
});

describe('non-menu anchored popups', () => {
	test('aligns vertical centers when the anchor requests center positioning', async () => {
		prepareAnchor(400, 300, 96, false, 160);
		const { content } = await renderPopup({ anchor: { x: 'center', y: 'center' } });
		expect(Number.parseFloat(content.style.top) + content.offsetHeight / 2).toBe(312);
	});

	test('opens above its anchor when there is enough room above but not below', async () => {
		prepareAnchor(400, 700, 120, false, 160);
		const { content } = await renderPopup();
		expect(content.style.top).toBe('572px');
		expect(Number.parseFloat(content.style.top) + content.offsetHeight).toBeLessThanOrEqual(anchor.getBoundingClientRect().top);
	});

	test('uses the visible bounds of a scaled anchor', async () => {
		prepareAnchor(400, 300, 96, false, 160);
		vi.mocked(anchor.getBoundingClientRect).mockReturnValue(new DOMRect(400, 300, 48, 48));
		const { content } = await renderPopup();
		expect(content.style.left).toBe('344px');
		expect(content.style.top).toBe('356px');
	});
});
