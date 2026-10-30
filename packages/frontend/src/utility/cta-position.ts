/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;
type Side = 'top' | 'bottom' | 'left' | 'right';

export type CtaPosition = {
	left: number;
	top: number;
	arrow: Side;
	/** 人物放在气泡的哪一侧；总在箭头对面，不挡住箭头和入口。 */
	mascot: 'start' | 'end';
};

export function calcCtaPosition(options: {
	anchor: Rect;
	viewport: Rect;
	width: number;
	height: number;
	/** 人物占用的宽度，从浮窗左右边缘算起。 */
	mascotWidth?: number;
}): CtaPosition | null {
	const { anchor, viewport, width, height, mascotWidth = 0 } = options;
	const gap = 12;
	const centerX = (anchor.left + anchor.right) / 2;
	const centerY = (anchor.top + anchor.bottom) / 2;
	if (width > viewport.right - viewport.left || height > viewport.bottom - viewport.top ||
		centerX < viewport.left || centerX > viewport.right || centerY < viewport.top || centerY > viewport.bottom) return null;

	const clampX = (left: number) => Math.max(viewport.left, Math.min(viewport.right - width, left));
	const clampY = (top: number) => Math.max(viewport.top, Math.min(viewport.bottom - height, top));
	// 只由入口与视口决定位置；列表增删、加载或切换分类都不能把引导推走。
	// 气泡在右侧时箭头朝左，人物放到右端，不夹在入口和气泡之间。
	if (anchor.right + gap + width <= viewport.right) {
		return { left: anchor.right + gap, top: clampY(centerY - height / 2), arrow: 'left', mascot: 'end' };
	}
	// 向外侧展开，尽量利用页面边缘，而不是居中压住正文。
	const left = clampX(anchor.right - 48);
	// 气泡在上下方时箭头对准入口；人物所在一侧与入口横向重叠、另一侧不重叠时换到另一侧。
	const overlaps = (start: number) => start < anchor.right && start + mascotWidth > anchor.left;
	const mascot = overlaps(left) && !overlaps(left + width - mascotWidth) ? 'end' : 'start';
	if (anchor.top - gap - height >= viewport.top) {
		return { left, top: anchor.top - gap - height, arrow: 'bottom', mascot };
	}
	if (anchor.bottom + gap + height <= viewport.bottom) {
		return { left, top: anchor.bottom + gap, arrow: 'top', mascot };
	}
	return null;
}
