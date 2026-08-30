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
