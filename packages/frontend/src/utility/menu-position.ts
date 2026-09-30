/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 主轴上锚点与浮层之间的间距。
 * 对应 Floating UI 的 `offset()` / Radix 的 `sideOffset`。
 */
export const MENU_GAP = 8;

/**
 * 浮层与视口边缘之间的最小距离。
 * 对应 Floating UI 的 `shift({ padding })` / Radix 的 `collisionPadding`。
 */
export const VIEWPORT_MARGIN = 16;

/**
 * 菜单自身的纵向 padding（见 MkMenu 的 `.menu`）。
 * 子菜单用它做交叉轴偏移，抵消掉这段 padding 后首项才能与触发它的父项对齐，
 * 对应 Radix `SubContent` 的 `alignOffset`。
 */
export const MENU_PADDING_Y = 8;

/** 浮层相对锚点所在的边 */
export type MenuSide = 'bottom' | 'top' | 'right' | 'left';

/** 浮层沿该边的对齐方式。`start` 是书写方向的起始边，RTL 下即锚点右边缘 */
export type MenuAlign = 'start' | 'end';

type Size = { width: number; height: number };
type Rect = { left: number; right: number; top: number; bottom: number };
type Viewport = { width: number; height: number };

export function calcMenuPosition(
	size: Size,
	anchor: Rect,
	viewport: Viewport,
	preferSide = false,
	sideOffsetY = 0,
): { left: number; top: number; transformOrigin: string; overlapsAnchor: boolean } {
	const { width, height } = size;
	const rightEdge = viewport.width - VIEWPORT_MARGIN;
	const bottomEdge = viewport.height - VIEWPORT_MARGIN;
	const clampX = (x: number) => Math.max(0, Math.min(x, rightEdge - width));
	const clampY = (y: number) => Math.max(0, Math.min(y, bottomEdge - height));
	const right = anchor.right + MENU_GAP;
	const left = anchor.left - width - MENU_GAP;
	const below = anchor.bottom + MENU_GAP;
	const above = anchor.top - height - MENU_GAP;

	const corners = [
		{ left: right, top: below },
		{ left: right, top: above },
		{ left, top: below },
		{ left, top: above },
	];
	const sides = [
		{ left: right, top: clampY(anchor.top + sideOffsetY) },
		{ left, top: clampY(anchor.top + sideOffsetY) },
		{ left: clampX(anchor.left), top: below },
		{ left: clampX(anchor.left), top: above },
	];
	const candidates = preferSide ? [...sides, ...corners] : [...corners, ...sides];
	const position = candidates.find(pos => (
		pos.left >= 0 && pos.top >= 0 && pos.left + width <= viewport.width && pos.top + height <= viewport.height
	)) ?? { left: clampX(right), top: clampY(below) };

	const originX = position.left >= anchor.right ? anchor.right
		: position.left + width <= anchor.left ? anchor.left
		: (anchor.left + anchor.right) / 2;
	const originY = position.top >= anchor.bottom ? anchor.bottom
		: position.top + height <= anchor.top ? anchor.top
		: (anchor.top + anchor.bottom) / 2;

	return {
		...position,
		transformOrigin: `${originX - position.left}px ${originY - position.top}px`,
		overlapsAnchor: position.left < anchor.right + MENU_GAP && position.left + width > anchor.left - MENU_GAP &&
			position.top < anchor.bottom + MENU_GAP && position.top + height > anchor.top - MENU_GAP,
	};
}

/**
 * 触发元素锚定的菜单（kebab 按钮、下拉等）。
 *
 * 走主流浮层库的 offset → flip → shift → size 管线：
 * - offset：默认挂在锚点下方并与其起始边对齐（`bottom-start`，同 Radix 的下拉默认值），间距 {@link MENU_GAP}
 * - flip：主轴放不下才整体换方位，顺序为下 → 上 → 右 → 左
 * - shift：交叉轴先换对齐边（start ⇄ end），两边都溢出才夹进视口
 * - size：以上都放不下时才给出 maxHeight 让菜单内部滚动
 *
 * 换方位先于压缩高度，所以只有菜单在任何方位都装不进视口时才会出现滚动条。
 */
export function calcDropdownPosition(
	size: Size,
	anchor: Rect,
	viewport: Viewport,
	options: {
		/** 是否允许翻到锚点左右两侧。宽度跟随锚点的 select 类下拉应关掉，甩到侧面很怪 */
		allowSideFlip?: boolean;
		/** 书写方向。RTL 下 `start` 对齐的是锚点右边缘 */
		rtl?: boolean;
		/** 覆盖锚点间距，对应 Radix 的 `sideOffset` */
		anchorGap?: number;
		/** 覆盖视口边距，对应 Radix 的 `collisionPadding` */
		collisionPadding?: number;
	} = {},
): {
	left: number;
	top: number;
	side: MenuSide;
	align: MenuAlign;
	/** 菜单全高装不进所选方位时的内部滚动上限；装得下时为 null（不设限） */
	maxHeight: number | null;
	transformOrigin: string;
	overlapsAnchor: boolean;
} {
	const gap = options.anchorGap ?? MENU_GAP;
	const collisionPadding = options.collisionPadding ?? VIEWPORT_MARGIN;
	const rtl = options.rtl ?? false;

	// 视口比边距本身还小时按半宽/半高退让，避免上下界反向
	const minX = Math.min(collisionPadding, viewport.width / 2);
	const minY = Math.min(collisionPadding, viewport.height / 2);
	const maxX = viewport.width - minX;
	const maxY = viewport.height - minY;
	const boundaryHeight = Math.max(0, maxY - minY);

	const isVertical = (s: MenuSide) => s === 'bottom' || s === 'top';

	// 主轴可用空间：纵向方位比高度，横向方位比宽度
	const mainSpace: Record<MenuSide, number> = {
		bottom: maxY - (anchor.bottom + gap),
		top: (anchor.top - gap) - minY,
		right: maxX - (anchor.right + gap),
		left: (anchor.left - gap) - minX,
	};
	const mainFits = (s: MenuSide) => (isVertical(s) ? size.height : size.width) <= mainSpace[s];
	// 横向方位可以用满整条边界高度，纵向方位受锚点上下的空间限制
	const availableHeight = (s: MenuSide) => Math.max(0, Math.min(isVertical(s) ? mainSpace[s] : boundaryHeight, boundaryHeight));

	const candidateSides: MenuSide[] = (options.allowSideFlip ?? true)
		? ['bottom', 'top', 'right', 'left']
		: ['bottom', 'top'];
	// 横向方位的主轴是宽度，宽度放不下就不可用；否则 shift 会把菜单夹回来压住锚点。
	// 纵向方位恒定可用（高度不够就限高滚动），所以 sides 不会为空。
	const sides = candidateSides.filter(s => isVertical(s) || size.width <= mainSpace[s]);

	// flip：只有主轴放不下才换方位（交叉轴溢出交给下面的对齐和 shift，否则菜单会莫名跳到侧面）。
	// 任何方位都装不下时退化成 bestFit，取可见高度最大的那个。
	const side = sides.find(mainFits)
		?? sides.reduce((best, s) => (availableHeight(s) > availableHeight(best) ? s : best));

	const heightCap = availableHeight(side);
	const height = Math.min(size.height, heightCap);
	// 装得下就不设限，只有放不下才给出限高让菜单内部滚动
	const maxHeight = size.height <= heightCap ? null : heightCap;

	// 交叉轴：纵向方位按水平边对齐（受书写方向影响），横向方位按垂直边对齐（不受影响）
	const crossStart = isVertical(side)
		? (rtl ? anchor.right - size.width : anchor.left)
		: anchor.top;
	const crossEnd = isVertical(side)
		? (rtl ? anchor.left : anchor.right - size.width)
		: anchor.bottom - height;
	const crossMin = isVertical(side) ? minX : minY;
	const crossMax = isVertical(side) ? maxX : maxY;
	const crossSize = isVertical(side) ? size.width : height;
	const crossFits = (value: number) => value >= crossMin && value + crossSize <= crossMax;

	// 对齐边溢出时先翻到另一边（alignment flip），两边都装不下才靠 shift 夹紧
	const align: MenuAlign = crossFits(crossStart) || !crossFits(crossEnd) ? 'start' : 'end';
	const cross = align === 'start' ? crossStart : crossEnd;

	let left: number;
	let top: number;
	if (isVertical(side)) {
		left = cross;
		top = side === 'bottom' ? anchor.bottom + gap : anchor.top - gap - height;
	} else {
		left = side === 'right' ? anchor.right + gap : anchor.left - gap - size.width;
		top = cross;
	}
	// shift：两轴统一夹进视口。夹到压住锚点时由 overlapsAnchor 通知调用方开指针守卫
	left = Math.max(minX, Math.min(left, maxX - size.width));
	top = Math.max(minY, Math.min(top, maxY - height));

	// 动画原点取菜单盒上离锚点中心最近的点，让菜单从触发元素那一侧展开
	const originX = Math.max(left, Math.min((anchor.left + anchor.right) / 2, left + size.width));
	const originY = Math.max(top, Math.min((anchor.top + anchor.bottom) / 2, top + height));

	return {
		left,
		top,
		side,
		align,
		maxHeight,
		transformOrigin: `${originX - left}px ${originY - top}px`,
		overlapsAnchor: left < anchor.right + gap && left + size.width > anchor.left - gap &&
			top < anchor.bottom + gap && top + height > anchor.top - gap,
	};
}
