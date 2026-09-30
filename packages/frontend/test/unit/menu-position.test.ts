/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { calcDropdownPosition, calcMenuPosition, MENU_GAP, MENU_PADDING_Y } from '@/utility/menu-position.js';

const viewport = { width: 1000, height: 800 };

describe('shared menu positioning', () => {
	test.each([
		{ x: 100, y: 100, left: 108, top: 108 },
		{ x: 900, y: 100, left: 692, top: 108 },
		{ x: 100, y: 700, left: 108, top: 392 },
		{ x: 900, y: 700, left: 692, top: 392 },
		{ x: 999, y: 799, left: 791, top: 491 },
	])('keeps the same gap at a cursor corner ($x, $y)', ({ x, y, left, top }) => {
		expect(calcMenuPosition({ width: 200, height: 300 }, { left: x, right: x, top: y, bottom: y }, viewport))
			.toMatchObject({ left, top, overlapsAnchor: false });
	});

	test.each([
		{ width: 200, height: 650, anchor: { left: 100, right: 124, top: 500, bottom: 524 } },
		{ width: 200, height: 650, anchor: { left: 900, right: 924, top: 500, bottom: 524 } },
		{ width: 800, height: 200, anchor: { left: 500, right: 524, top: 100, bottom: 124 } },
		{ width: 800, height: 200, anchor: { left: 500, right: 524, top: 700, bottom: 724 } },
	])('uses a side edge without covering the trigger or reducing $width × $height content', ({ width, height, anchor }) => {
		const pos = calcMenuPosition({ width, height }, anchor, viewport);
		expect(pos.overlapsAnchor).toBe(false);
		expect(pos.left).toBeGreaterThanOrEqual(0);
		expect(pos.top).toBeGreaterThanOrEqual(0);
		expect(pos.left + width).toBeLessThanOrEqual(viewport.width);
		expect(pos.top + height).toBeLessThanOrEqual(viewport.height);
		const gaps = [pos.left - anchor.right, anchor.left - (pos.left + width), pos.top - anchor.bottom, anchor.top - (pos.top + height)];
		expect(Math.max(...gaps)).toBe(MENU_GAP);
	});

	test.each([false, true])('keeps the trigger outside the scaled menu (preferSide=%s)', preferSide => {
		for (const x of [20, 400, 900]) {
			for (const y of [20, 400, 700]) {
				const anchor = { left: x, right: x + 24, top: y, bottom: y + 24 };
				const width = 200;
				const height = 650;
				const pos = calcMenuPosition({ width, height }, anchor, viewport, preferSide);
				const [originX, originY] = pos.transformOrigin.split(' ').map(Number.parseFloat);
				for (const scale of [0.9, 0.95, 1]) {
					const left = pos.left + originX * (1 - scale);
					const top = pos.top + originY * (1 - scale);
					expect(left >= anchor.right + 1 || left + width * scale <= anchor.left - 1 || top >= anchor.bottom + 1 || top + height * scale <= anchor.top - 1).toBe(true);
				}
			}
		}
	});

	test('opens a submenu beside the parent row, flipping left near the right edge', () => {
		const size = { width: 200, height: 300 };
		expect(calcMenuPosition(size, { left: 100, right: 300, top: 200, bottom: 230 }, viewport, true, -MENU_PADDING_Y)).toMatchObject({ left: 308, top: 192 });
		expect(calcMenuPosition(size, { left: 750, right: 950, top: 200, bottom: 230 }, viewport, true, -MENU_PADDING_Y)).toMatchObject({ left: 542, top: 192 });
		expect(calcMenuPosition(size, { left: 750, right: 950, top: 700, bottom: 730 }, viewport, true, -MENU_PADDING_Y)).toMatchObject({ left: 542, top: 484 });
	});

	test('offsets a submenu by the menu padding so its first row lines up with the parent row', () => {
		const anchor = { left: 100, right: 300, top: 200, bottom: 230 };
		const position = calcMenuPosition({ width: 200, height: 300 }, anchor, viewport, true, -MENU_PADDING_Y);
		expect(anchor.top - position.top).toBe(MENU_PADDING_Y);
	});

	test('keeps an 8px gap when a submenu falls back above its parent row', () => {
		const anchor = { left: 200, right: 400, top: 700, bottom: 730 };
		const position = calcMenuPosition({ width: 200, height: 100 }, anchor, { width: 600, height: 800 }, true, -MENU_PADDING_Y);
		expect(position).toMatchObject({ left: 200, top: 592, overlapsAnchor: false });
		expect(anchor.top - (position.top + 100)).toBe(MENU_GAP);
	});

	test.each([false, true])('requests pointer protection only when no edge can avoid the trigger (preferSide=%s)', preferSide => {
		expect(calcMenuPosition(
			{ width: 400, height: 650 },
			{ left: 300, right: 300, top: 400, bottom: 400 },
			{ width: 600, height: 800 },
			preferSide,
		)).toMatchObject({ left: 184, top: 134, overlapsAnchor: true });
	});
});

describe('trigger-anchored menu placement', () => {
	test('hangs below the trigger aligned to its start edge', () => {
		expect(calcDropdownPosition(
			{ width: 130, height: 96 },
			{ left: 740, right: 870, top: 72, bottom: 112 },
			viewport,
		)).toEqual({
			left: 740,
			top: 120,
			side: 'bottom',
			align: 'start',
			maxHeight: 664,
			transformOrigin: '65px 0px',
			overlapsAnchor: false,
		});
	});

	test('flips above the trigger when only that side fits', () => {
		expect(calcDropdownPosition(
			{ width: 130, height: 96 },
			{ left: 740, right: 870, top: 700, bottom: 740 },
			viewport,
		)).toEqual({
			left: 740,
			top: 596,
			side: 'top',
			align: 'start',
			maxHeight: 676,
			transformOrigin: '65px 96px',
			overlapsAnchor: false,
		});
	});

	test('flips the alignment edge instead of only sliding back into view', () => {
		// start 对齐会溢出右边缘，此时整体切到 end 对齐（贴锚点右边缘），而不是靠 shift 硬推
		const position = calcDropdownPosition(
			{ width: 300, height: 96 },
			{ left: 700, right: 980, top: 72, bottom: 112 },
			viewport,
		);
		expect(position).toMatchObject({ left: 680, top: 120, side: 'bottom', align: 'end' });
		// 纯 shift 会停在 684（视口边距），alignment flip 让菜单右边缘与锚点右边缘严格齐平
		expect(position.left + 300).toBe(980);
	});

	test('aligns to the trigger end edge in RTL', () => {
		const size = { width: 200, height: 96 };
		const anchor = { left: 740, right: 870, top: 72, bottom: 112 };
		expect(calcDropdownPosition(size, anchor, viewport)).toMatchObject({ left: 740, align: 'start' });
		expect(calcDropdownPosition(size, anchor, viewport, { rtl: true })).toMatchObject({ left: 670, align: 'start' });
	});

	test('flips to the side rather than shrinking when neither above nor below fits', () => {
		const position = calcDropdownPosition(
			{ width: 200, height: 300 },
			{ left: 400, right: 424, top: 180, bottom: 220 },
			{ width: 1000, height: 400 },
		);
		expect(position).toMatchObject({ left: 432, top: 84, side: 'right', align: 'start' });
		// 侧向方位放得下完整高度，不需要滚动条
		expect(position.maxHeight).toBeGreaterThanOrEqual(300);
	});

	test('stays vertical when no side is wide enough for the menu', () => {
		// 侧向空间宽度不够时必须排除该方位，否则会被 shift 推回来压住锚点
		const position = calcDropdownPosition(
			{ width: 400, height: 900 },
			{ left: 300, right: 340, top: 300, bottom: 340 },
			{ width: 600, height: 800 },
		);
		expect(position).toMatchObject({ left: 184, top: 348, side: 'bottom', maxHeight: 436 });
	});

	test.each([
		{ gap: 0, expectedTop: 112 },
		{ gap: 4, expectedTop: 116 },
		{ gap: 16, expectedTop: 128 },
	])('honours an overridden anchor gap of $gap', ({ gap, expectedTop }) => {
		expect(calcDropdownPosition(
			{ width: 130, height: 96 },
			{ left: 740, right: 870, top: 72, bottom: 112 },
			viewport,
			{ anchorGap: gap },
		)).toMatchObject({ top: expectedTop, side: 'bottom' });
	});

	test('honours an overridden collision padding', () => {
		expect(calcDropdownPosition(
			{ width: 130, height: 96 },
			{ left: 980, right: 1010, top: 72, bottom: 112 },
			viewport,
			{ collisionPadding: 0 },
		)).toMatchObject({ left: 870 });
	});
});

describe('select dropdown positioning', () => {
	test.each([
		{ top: 250, bottom: 290, expectedTop: 298, side: 'bottom', maxHeight: 486, originY: 0 },
		{ top: 500, bottom: 540, expectedTop: 16, side: 'top', maxHeight: 476, originY: 476 },
	])('limits a tall menu to the larger side of the input at $top', ({ top, bottom, expectedTop, side, maxHeight, originY }) => {
		expect(calcDropdownPosition(
			{ width: 130, height: 900 },
			{ left: 740, right: 870, top, bottom },
			viewport,
			{ allowSideFlip: false },
		)).toEqual({
			left: 740,
			top: expectedTop,
			side,
			align: 'start',
			maxHeight,
			transformOrigin: `65px ${originY}px`,
			overlapsAnchor: false,
		});
	});

	test.each([
		{ anchorLeft: -20, expectedLeft: 16 },
		{ anchorLeft: 940, expectedLeft: 854 },
	])('keeps the menu inside horizontal viewport margins at $anchorLeft', ({ anchorLeft, expectedLeft }) => {
		const position = calcDropdownPosition(
			{ width: 130, height: 96 },
			{ left: anchorLeft, right: anchorLeft + 130, top: 72, bottom: 112 },
			viewport,
			{ allowSideFlip: false },
		);
		expect(position).toMatchObject({ left: expectedLeft, top: 120, overlapsAnchor: false });
		expect(position.left + 130).toBeLessThanOrEqual(viewport.width - 16);
	});

	test('restores available height when the viewport grows', () => {
		const size = { width: 130, height: 600 };
		const anchor = { left: 740, right: 870, top: 150, bottom: 190 };
		expect(calcDropdownPosition(size, anchor, { width: 1000, height: 400 }, { allowSideFlip: false }))
			.toMatchObject({ left: 740, top: 198, maxHeight: 186 });
		expect(calcDropdownPosition(size, anchor, { width: 1000, height: 1000 }, { allowSideFlip: false }))
			.toMatchObject({ left: 740, top: 198, maxHeight: 786 });
	});

	test.each([
		{ top: -100, bottom: -60, expectedTop: 16 },
		{ top: 850, bottom: 890, expectedTop: 688 },
	])('keeps a menu on screen if its input scrolls outside the viewport at $top', ({ top, bottom, expectedTop }) => {
		expect(calcDropdownPosition(
			{ width: 130, height: 96 },
			{ left: 740, right: 870, top, bottom },
			viewport,
			{ allowSideFlip: false },
		)).toMatchObject({ left: 740, top: expectedTop, maxHeight: 768, overlapsAnchor: false });
	});

	test('reports no available height when the input spans the entire viewport', () => {
		expect(calcDropdownPosition(
			{ width: 130, height: 96 },
			{ left: 740, right: 870, top: 0, bottom: 800 },
			viewport,
			{ allowSideFlip: false },
		)).toMatchObject({ left: 740, top: 784, maxHeight: 0, overlapsAnchor: true });
	});

	test('escapes to the side when a button menu trigger spans the whole viewport', () => {
		// 同样的锚点，允许侧向翻转的按钮菜单可以完整显示，而不是退化成 maxHeight 0
		expect(calcDropdownPosition(
			{ width: 130, height: 96 },
			{ left: 740, right: 870, top: 0, bottom: 800 },
			viewport,
		)).toMatchObject({ left: 602, side: 'left', maxHeight: 768, overlapsAnchor: false });
	});
});
