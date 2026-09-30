/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { calcPopupPosition } from '@/utility/popup-position.js';

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 800;

/**
 * happy-dom はレイアウトを計算しないので、offsetWidth/Height と
 * getBoundingClientRect を任意の値で差し替えて幾何だけを検証する。
 */
function mockEl(size: { width: number; height: number }): HTMLElement {
	const el = window.document.createElement('div');
	Object.defineProperty(el, 'offsetWidth', { value: size.width, configurable: true });
	Object.defineProperty(el, 'offsetHeight', { value: size.height, configurable: true });
	return el;
}

function mockAnchor(rect: { left: number; top: number; width: number; height: number }): HTMLElement {
	const el = mockEl({ width: rect.width, height: rect.height });
	el.getBoundingClientRect = () => ({
		left: rect.left,
		top: rect.top,
		right: rect.left + rect.width,
		bottom: rect.top + rect.height,
		width: rect.width,
		height: rect.height,
		x: rect.left,
		y: rect.top,
		toJSON: () => ({}),
	}) as DOMRect;
	return el;
}

describe('calcPopupPosition', () => {
	beforeEach(() => {
		window.innerWidth = VIEWPORT_WIDTH;
		window.innerHeight = VIEWPORT_HEIGHT;
		window.scrollX = 0;
		window.scrollY = 0;
	});

	test.each([
		{ anchorLeft: 260, boundaryLeft: 200, boundaryWidth: 400, expected: 260, origin: 'left top' },
		{ anchorLeft: 480, boundaryLeft: 200, boundaryWidth: 400, expected: 320, origin: 'right top' },
		{ anchorLeft: 480, boundaryLeft: 450, boundaryWidth: 150, expected: 480, origin: 'left top' },
		{ anchorLeft: 280, boundaryLeft: 200, boundaryWidth: 220, expected: 280, origin: 'left top' },
	])('keeps or flips the anchor alignment within a panel: $anchorLeft/$boundaryWidth', ({ anchorLeft, boundaryLeft, boundaryWidth, expected, origin }) => {
		window.scrollX = 80;
		const position = calcPopupPosition(mockEl({ width: 200, height: 100 }), {
			anchorElement: mockAnchor({ left: anchorLeft, top: 100, width: 40, height: 20 }),
			boundaryElement: mockAnchor({ left: boundaryLeft, top: 0, width: boundaryWidth, height: 500 }),
			direction: 'bottom', align: 'left', innerMargin: 8,
		});
		expect(position.left).toBe(expected + window.scrollX);
		expect(position.top).toBe(128);
		expect(position.transformOrigin).toBe(origin);
	});

	test('clamps to the viewport when a narrow panel cannot fit the popup', () => {
		const position = calcPopupPosition(mockEl({ width: 200, height: 100 }), {
			anchorElement: mockAnchor({ left: VIEWPORT_WIDTH - 80, top: 100, width: 40, height: 20 }),
			boundaryElement: mockAnchor({ left: VIEWPORT_WIDTH - 150, top: 0, width: 150, height: 500 }),
			direction: 'bottom', align: 'left', innerMargin: 8,
		});
		expect(position.left).toBe(VIEWPORT_WIDTH - 201);
	});

	test.each([20, 60])('keeps a 12px panel gap from a %ipx trigger border box', height => {
		const content = mockEl({ width: 100, height: 32 });
		const anchor = mockAnchor({ left: 400, top: 100, width: 40, height });
		const { top } = calcPopupPosition(content, {
			anchorElement: anchor, direction: 'bottom', align: 'center', innerMargin: 12,
		});
		expect(top - anchor.getBoundingClientRect().bottom).toBe(12);
	});

	test.each([
		{ direction: 'top', left: 330.5, top: 188.5 },
		{ direction: 'bottom', left: 330.5, top: 343 },
		{ direction: 'left', left: 188.25, top: 265.75 },
		{ direction: 'right', left: 472.75, top: 265.75 },
	] as const)('positions $direction against the displayed rectangle of a scaled trigger', ({ direction, left, top }) => {
		const content = mockEl({ width: 200, height: 100 });
		const anchor = mockAnchor({ left: 400.25, top: 300.5, width: 60.5, height: 30.5 });
		Object.defineProperty(anchor, 'offsetWidth', { value: 40 });
		Object.defineProperty(anchor, 'offsetHeight', { value: 20 });
		const position = calcPopupPosition(content, {
			anchorElement: anchor, direction, align: 'center', innerMargin: 12,
		});
		expect(position.left).toBe(left);
		expect(position.top).toBe(top);
	});

	describe('縦方向', () => {
		test('下に十分な余白があれば下に出す', () => {
			const content = mockEl({ width: 200, height: 300 });
			const anchor = mockAnchor({ left: 400, top: 100, width: 40, height: 20 });

			const { top, transformOrigin } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'bottom',
				align: 'center',
				innerMargin: 0,
			});

			expect(top).toBe(120);
			expect(transformOrigin).toBe('center top');
		});

		test('下に入り切らず上に余白があれば上へ反転する', () => {
			// アンカーは下端付近。下の余白は 100px しかないが上には 700px ある
			const content = mockEl({ width: 200, height: 300 });
			const anchor = mockAnchor({ left: 400, top: 680, width: 40, height: 20 });

			const { top, transformOrigin } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'bottom',
				align: 'center',
				innerMargin: 0,
			});

			// 反転してアンカーの真上に全高が収まる
			expect(top).toBe(380);
			expect(transformOrigin).toBe('center bottom');
		});

		test('上下どちらにも入り切らない場合は余白の広い側に寄せ、画面外には出さない', () => {
			// コンテンツが視口より高いので、どちらに置いてもはみ出る
			const content = mockEl({ width: 200, height: 900 });
			const anchor = mockAnchor({ left: 400, top: 600, width: 40, height: 20 });

			const { top } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'bottom',
				align: 'center',
				innerMargin: 0,
			});

			expect(top).toBeGreaterThanOrEqual(0);
			expect(top).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
		});

		test('direction: top でも上に入らなければ下へ反転する', () => {
			const content = mockEl({ width: 200, height: 300 });
			const anchor = mockAnchor({ left: 400, top: 10, width: 40, height: 20 });

			const { top, transformOrigin } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'top',
				align: 'center',
				innerMargin: 0,
			});

			expect(top).toBe(30);
			expect(transformOrigin).toBe('center top');
		});
	});

	describe('横方向', () => {
		test('右に入らなければ左へ反転する', () => {
			const content = mockEl({ width: 300, height: 200 });
			const anchor = mockAnchor({ left: 900, top: 300, width: 40, height: 20 });

			const { left, transformOrigin } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'right',
				align: 'center',
				innerMargin: 0,
			});

			expect(left).toBe(600);
			expect(transformOrigin).toBe('right center');
		});

		test('左に入らなければ右へ反転する', () => {
			const content = mockEl({ width: 300, height: 200 });
			const anchor = mockAnchor({ left: 20, top: 300, width: 40, height: 20 });

			const { left, transformOrigin } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'left',
				align: 'center',
				innerMargin: 0,
			});

			expect(left).toBe(60);
			expect(transformOrigin).toBe('left center');
		});

		test('左右どちらにも入り切らない場合も画面外には出さない', () => {
			const content = mockEl({ width: 1200, height: 200 });
			const anchor = mockAnchor({ left: 500, top: 300, width: 40, height: 20 });

			const { left } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'right',
				align: 'center',
				innerMargin: 0,
			});

			expect(left).toBeLessThanOrEqual(0);
		});
	});

	describe('交差軸のクランプ', () => {
		test('縦方向のとき、左端を突き抜けない', () => {
			// アンカーが左端にあり、中央揃えだと left が負になる状況
			const content = mockEl({ width: 400, height: 200 });
			const anchor = mockAnchor({ left: 0, top: 100, width: 20, height: 20 });

			const { left } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'bottom',
				align: 'center',
				innerMargin: 0,
			});

			expect(left).toBeGreaterThanOrEqual(0);
		});

		test('縦方向のとき、右端を突き抜けない', () => {
			const content = mockEl({ width: 400, height: 200 });
			const anchor = mockAnchor({ left: 980, top: 100, width: 20, height: 20 });

			const { left } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'bottom',
				align: 'center',
				innerMargin: 0,
			});

			expect(left + 400).toBeLessThanOrEqual(VIEWPORT_WIDTH);
		});

		test('横方向のとき、上端を突き抜けない', () => {
			// アンカーが上端にあり、中央揃えだと top が負になる状況
			const content = mockEl({ width: 200, height: 400 });
			const anchor = mockAnchor({ left: 100, top: 0, width: 20, height: 20 });

			const { top } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'right',
				align: 'center',
				innerMargin: 0,
			});

			expect(top).toBeGreaterThanOrEqual(0);
		});

		test('横方向のとき、下端を突き抜けない', () => {
			const content = mockEl({ width: 200, height: 400 });
			const anchor = mockAnchor({ left: 100, top: 780, width: 20, height: 20 });

			const { top } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'right',
				align: 'center',
				innerMargin: 0,
			});

			expect(top + 400).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
		});
	});

	describe('align', () => {
		test.each([
			{ direction: 'top', align: 'left', left: 400, top: 188, origin: 'left bottom', offsetSign: 1 },
			{ direction: 'top', align: 'right', left: 240, top: 188, origin: 'right bottom', offsetSign: -1 },
			{ direction: 'bottom', align: 'left', left: 400, top: 372, origin: 'left top', offsetSign: 1 },
			{ direction: 'bottom', align: 'right', left: 240, top: 372, origin: 'right top', offsetSign: -1 },
		] as const)('aligns $direction panels to the anchor $align edge with an inward offset', ({ direction, align, left, top, origin, offsetSign }) => {
			const content = mockEl({ width: 200, height: 100 });
			const anchor = mockAnchor({ left: 400, top: 300, width: 40, height: 60 });
			const options = { anchorElement: anchor, direction, align, innerMargin: 12 };

			expect(calcPopupPosition(content, options)).toEqual({ left, top, transformOrigin: origin });
			expect(calcPopupPosition(content, { ...options, alignOffset: 12 })).toEqual({
				left: left + offsetSign * 12, top, transformOrigin: origin,
			});
		});

		test('keeps the left edge aligned when a bottom panel flips above the anchor', () => {
			const content = mockEl({ width: 380, height: 56 });
			const anchor = mockAnchor({ left: 100, top: 750, width: 40, height: 32 });

			expect(calcPopupPosition(content, {
				anchorElement: anchor, direction: 'bottom', align: 'left', innerMargin: 12,
			})).toEqual({ left: 100, top: 682, transformOrigin: 'left bottom' });
		});

		test.each([
			{ anchorLeft: 0, align: 'right', expectedLeft: 0 },
			{ anchorLeft: 980, align: 'left', expectedLeft: 799 },
		] as const)('keeps a $align-aligned panel inside the horizontal viewport', ({ anchorLeft, align, expectedLeft }) => {
			const content = mockEl({ width: 200, height: 100 });
			const anchor = mockAnchor({ left: anchorLeft, top: 100, width: 20, height: 20 });

			const { left } = calcPopupPosition(content, {
				anchorElement: anchor, direction: 'bottom', align, innerMargin: 12,
			});

			expect(left).toBe(expectedLeft);
		});

		test.each(['left', 'right'] as const)('keeps coordinate-only panels centered when align is %s', align => {
			const content = mockEl({ width: 200, height: 100 });

			expect(calcPopupPosition(content, {
				x: 500, y: 300, direction: 'bottom', align, alignOffset: 12, innerMargin: 12,
			})).toEqual({ left: 400, top: 312, transformOrigin: 'center top' });
		});

		test('direction: right / align: bottom はアンカーの下端に揃える', () => {
			const content = mockEl({ width: 200, height: 100 });
			const anchor = mockAnchor({ left: 100, top: 300, width: 40, height: 60 });

			const { top } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'right',
				align: 'bottom',
				innerMargin: 0,
			});

			// アンカー下端 360 に content 高さ 100 を合わせる
			expect(top).toBe(260);
		});

		test('direction: right / align: top はアンカーの上端に揃える', () => {
			const content = mockEl({ width: 200, height: 100 });
			const anchor = mockAnchor({ left: 100, top: 300, width: 40, height: 60 });

			const { top } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'right',
				align: 'top',
				innerMargin: 0,
			});

			expect(top).toBe(300);
		});
	});

	describe('スクロール中', () => {
		test.each([
			{ align: 'left', left: 520 },
			{ align: 'right', left: 360 },
		] as const)('adds both scroll offsets to $align-aligned panels', ({ align, left }) => {
			window.scrollX = 120;
			window.scrollY = 500;
			const content = mockEl({ width: 200, height: 100 });
			const anchor = mockAnchor({ left: 400, top: 100, width: 40, height: 20 });

			expect(calcPopupPosition(content, {
				anchorElement: anchor, direction: 'bottom', align, innerMargin: 12,
			})).toEqual({ left, top: 632, transformOrigin: `${align} top` });
		});

		test('スクロール量を加味した絶対座標を返す', () => {
			window.scrollY = 500;
			const content = mockEl({ width: 200, height: 100 });
			const anchor = mockAnchor({ left: 400, top: 100, width: 40, height: 20 });

			const { top } = calcPopupPosition(content, {
				anchorElement: anchor,
				direction: 'bottom',
				align: 'center',
				innerMargin: 0,
			});

			// 視口内では 120 の位置。ドキュメント座標では +500
			expect(top).toBe(620);
		});
	});
});
