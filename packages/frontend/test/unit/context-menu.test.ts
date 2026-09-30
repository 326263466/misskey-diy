/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkContextMenu from '@/components/MkContextMenu.vue';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/components/MkMenu.vue', () => ({
	default: {
		props: ['items', 'align', 'maxHeight', 'guardInitialPointer'],
		template: '<div data-testid="menu" :data-max-height="maxHeight" :data-guarded="guardInitialPointer"/>',
	},
}));

const initialViewport = {
	innerWidth: window.innerWidth,
	innerHeight: window.innerHeight,
	scrollX: window.scrollX,
	scrollY: window.scrollY,
};

function renderMenu(x: number, y: number, { width = 200, height = 300 } = {}) {
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
		// happy-dom does not lay out the menu; model MkMenu's viewport-height limit.
		const maxHeight = this.querySelector('[data-max-height]')?.getAttribute('data-max-height');
		return Math.min(height, window.innerHeight - 32, maxHeight == null ? Infinity : Number(maxHeight));
	});
	const closed = vi.fn();
	const view = render(MkContextMenu, {
		props: {
			items: [],
			ev: { pageX: x + window.scrollX, pageY: y + window.scrollY } as PointerEvent,
			onClosed: closed,
		},
	});
	const menu = view.getByTestId('menu');
	return { ...view, menu, root: menu.parentElement!, closed };
}

beforeEach(() => {
	Object.assign(window, { innerWidth: 1000, innerHeight: 800, scrollX: 0, scrollY: 0 });
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	Object.assign(window, initialViewport);
});

describe('context menu cursor anchoring', () => {
	test.each([
		{ name: 'down and right when there is room', x: 100, y: 100, left: 108, top: 108, origin: '-8px -8px' },
		{ name: 'up from the cursor near the bottom', x: 100, y: 700, left: 108, top: 392, origin: '-8px 308px' },
		{ name: 'left from the cursor near the right edge', x: 900, y: 100, left: 692, top: 108, origin: '208px -8px' },
		{ name: 'up and left at the bottom-right corner', x: 900, y: 700, left: 692, top: 392, origin: '208px 308px' },
		{ name: 'down when the menu exactly fits below', x: 100, y: 492, left: 108, top: 500, origin: '-8px -8px' },
	])('opens $name', ({ x, y, left, top, origin }) => {
		const { root } = renderMenu(x, y);
		expect(root.style.left).toBe(`${left}px`);
		expect(root.style.top).toBe(`${top}px`);
		expect(root.style.transformOrigin).toBe(origin);
	});

	test('keeps the same cursor anchor after the document has scrolled', () => {
		Object.assign(window, { scrollX: 120, scrollY: 600 });
		const { root } = renderMenu(900, 700);
		expect(root.style.left).toBe('812px');
		expect(root.style.top).toBe('992px');
		expect(root.style.transformOrigin).toBe('208px 308px');
	});

	test.each([
		{ y: 200, height: 600, top: 184 },
		{ y: 600, height: 650, top: 134 },
	])('keeps a tall menu fully expanded with the cursor along its side at y=$y', ({ y, top, height }) => {
		const { root, menu } = renderMenu(100, y, { height });
		expect(menu.getAttribute('data-max-height')).toBeNull();
		expect(root.offsetHeight).toBe(height);
		expect(root.style.top).toBe(`${top}px`);
		expect(root.style.left).toBe('108px');
		expect(top).toBeLessThanOrEqual(y);
		expect(top + height).toBeGreaterThanOrEqual(y);
		expect(top + height).toBeLessThanOrEqual(window.innerHeight - 16);
		expect(root.style.transformOrigin).toBe(`-8px ${y - top}px`);
	});

	test('uses only the existing viewport limit when a menu is taller than the screen', () => {
		const { root, menu } = renderMenu(100, 600, { height: 1000 });
		expect(menu.getAttribute('data-max-height')).toBeNull();
		expect(root.offsetHeight).toBe(768);
		expect(root.style.top).toBe('16px');
		expect(root.style.left).toBe('108px');
		expect(root.style.transformOrigin).toBe('-8px 584px');
	});

	test('protects the initial pointer when a narrow viewport cannot avoid it', async () => {
		window.innerWidth = 600;
		const { root, menu } = renderMenu(300, 400, { width: 400, height: 650 });
		await nextTick();
		expect(menu.getAttribute('data-guarded')).toBe('true');
		expect(menu.getAttribute('data-max-height')).toBeNull();
		expect(root.style.left).toBe('184px');
		expect(root.style.top).toBe('134px');
	});

	test('keeps a wide menu fully visible with the cursor along its top edge', () => {
		Object.assign(window, { scrollX: 120, scrollY: 600 });
		const { root } = renderMenu(600, 100, { width: 800 });
		expect(root.style.left).toBe('304px');
		expect(root.style.top).toBe('708px');
		expect(root.style.transformOrigin).toBe('416px -8px');
	});

	test.each([
		{ x: 100, y: 100, height: 300 },
		{ x: 100, y: 700, height: 300 },
		{ x: 900, y: 700, height: 300 },
		{ x: 100, y: 600, height: 650 },
		{ x: 900, y: 600, height: 1000 },
	])('keeps the original right-click point outside the menu at ($x, $y), height=$height', ({ x, y, height }) => {
		const { root } = renderMenu(x, y, { height });
		const left = Number.parseFloat(root.style.left);
		const top = Number.parseFloat(root.style.top);
		const containsCursor = x >= left && x < left + root.offsetWidth && y >= top && y < top + root.offsetHeight;
		expect(containsCursor).toBe(false);
		expect(Math.min(Math.abs(x - left), Math.abs(x - (left + root.offsetWidth)))).toBe(8);
	});

	test('still closes only on outside mousedown and removes the listener on unmount', async () => {
		const removeListener = vi.spyOn(document.body, 'removeEventListener');
		const { menu, root, closed, unmount } = renderMenu(100, 700);
		await fireEvent.mouseDown(menu);
		await fireEvent.mouseDown(root);
		expect(closed).not.toHaveBeenCalled();
		await fireEvent.mouseDown(document.body);
		expect(closed).toHaveBeenCalledOnce();
		unmount();
		expect(removeListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
		await fireEvent.mouseDown(document.body);
		expect(closed).toHaveBeenCalledOnce();
	});
});
