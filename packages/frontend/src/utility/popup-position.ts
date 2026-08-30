/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function calcPopupPosition(el: HTMLElement, props: {
	anchorElement?: HTMLElement | null;
	innerMargin: number;
	direction: 'top' | 'bottom' | 'left' | 'right';
	align: 'top' | 'bottom' | 'left' | 'right' | 'center';
	alignOffset?: number;
	x?: number;
	y?: number;
}): { top: number; left: number; transformOrigin: string; } {
	const contentWidth = el.offsetWidth;
	const contentHeight = el.offsetHeight;

	let rect: DOMRect;

	if (props.anchorElement) {
		rect = props.anchorElement.getBoundingClientRect();
	}

	const calcPosWhenTop = () => {
		let left: number;
		let top: number;

		if (props.anchorElement) {
			left = rect.left + window.scrollX + (props.anchorElement.offsetWidth / 2);
			top = (rect.top + window.scrollY - contentHeight) - props.innerMargin;
		} else {
			left = props.x!;
			top = (props.y! - contentHeight) - props.innerMargin;
		}

		left -= (el.offsetWidth / 2);

		if (left + contentWidth - window.scrollX > window.innerWidth) {
			left = window.innerWidth - contentWidth + window.scrollX - 1;
		}

		if (left < window.scrollX) {
			left = window.scrollX;
		}

		return [left, top];
	};

	const calcPosWhenBottom = () => {
		let left: number;
		let top: number;

		if (props.anchorElement) {
			left = rect.left + window.scrollX + (props.anchorElement.offsetWidth / 2);
			top = (rect.top + window.scrollY + props.anchorElement.offsetHeight) + props.innerMargin;
		} else {
			left = props.x!;
			top = (props.y!) + props.innerMargin;
		}

		left -= (el.offsetWidth / 2);

		if (left + contentWidth - window.scrollX > window.innerWidth) {
			left = window.innerWidth - contentWidth + window.scrollX - 1;
		}

		if (left < window.scrollX) {
			left = window.scrollX;
		}

		return [left, top];
	};

	const calcPosWhenLeft = () => {
		let left: number;
		let top: number;

		if (props.anchorElement) {
			left = (rect.left + window.scrollX - contentWidth) - props.innerMargin;
			top = rect.top + window.scrollY + (props.anchorElement.offsetHeight / 2);
		} else {
			left = (props.x! - contentWidth) - props.innerMargin;
			top = props.y!;
		}

		top -= (el.offsetHeight / 2);

		if (top + contentHeight - window.scrollY > window.innerHeight) {
			top = window.innerHeight - contentHeight + window.scrollY - 1;
		}

		if (top < window.scrollY) {
			top = window.scrollY;
		}

		// 主轴（横向）不在这里钳制：钳住了溢出量就恒为 0，翻转判断会被屏蔽，统一交给 clamp
		return [left, top];
	};

	const calcPosWhenRight = () => {
		let left = 0; // TSを黙らすためとりあえず初期値を0に
		let top = 0; // TSを黙らすためとりあえず初期値を0に

		if (props.anchorElement) {
			left = (rect.left + props.anchorElement.offsetWidth + window.scrollX) + props.innerMargin;

			if (props.align === 'top') {
				top = rect.top + window.scrollY;
				if (props.alignOffset != null) top += props.alignOffset;
			} else if (props.align === 'bottom') {
				// 锚点底边对齐，与 align: 'top' 对称
				top = (rect.top + window.scrollY + props.anchorElement.offsetHeight) - contentHeight;
				if (props.alignOffset != null) top -= props.alignOffset;
			} else { // center
				top = rect.top + window.scrollY + (props.anchorElement.offsetHeight / 2);
				top -= (el.offsetHeight / 2);
			}
		} else {
			left = props.x! + props.innerMargin;
			top = props.y!;
			top -= (el.offsetHeight / 2);
		}

		if (top + contentHeight - window.scrollY > window.innerHeight) {
			top = window.innerHeight - contentHeight + window.scrollY - 1;
		}

		if (top < window.scrollY) {
			top = window.scrollY;
		}

		// 主轴（横向）不在这里钳制，理由同 calcPosWhenLeft
		return [left, top];
	};

	const viewportTop = window.scrollY;
	const viewportBottom = window.scrollY + window.innerHeight;
	const viewportLeft = window.scrollX;
	const viewportRight = window.scrollX + window.innerWidth;

	/**
	 * 优先侧放不下就翻转到反侧，两侧都放不下则留在溢出较少（空间较大）的一侧。
	 * 各 calcPos* 已经处理过交叉轴，这里只决定主轴。
	 */
	const resolve = (preferred: number[], flipped: number[], axis: 'vertical' | 'horizontal') => {
		const size = axis === 'vertical' ? contentHeight : contentWidth;
		const start = axis === 'vertical' ? viewportTop : viewportLeft;
		const end = axis === 'vertical' ? viewportBottom : viewportRight;
		const i = axis === 'vertical' ? 1 : 0;

		// 主轴上超出视口起点/终点的量，取较大者作为该侧的溢出量
		const overflowOf = (pos: number[]) => Math.max(start - pos[i], (pos[i] + size) - end);

		const preferredOverflow = overflowOf(preferred);
		if (preferredOverflow <= 0) return { pos: preferred, flipped: false };

		const flippedOverflow = overflowOf(flipped);
		if (flippedOverflow <= 0) return { pos: flipped, flipped: true };

		return flippedOverflow < preferredOverflow
			? { pos: flipped, flipped: true }
			: { pos: preferred, flipped: false };
	};

	// 两侧都放不下时至少贴住视口边缘，不要整体飘到屏幕外
	const clamp = (pos: number[], axis: 'vertical' | 'horizontal') => {
		const size = axis === 'vertical' ? contentHeight : contentWidth;
		const start = axis === 'vertical' ? viewportTop : viewportLeft;
		const end = axis === 'vertical' ? viewportBottom : viewportRight;
		const i = axis === 'vertical' ? 1 : 0;

		const result = [...pos];
		if (result[i] + size > end) result[i] = end - size - 1;
		if (result[i] < start) result[i] = start;
		return result;
	};

	const calc = (): {
		left: number;
		top: number;
		transformOrigin: string;
	} => {
		switch (props.direction) {
			case 'top':
			case 'bottom': {
				const preferTop = props.direction === 'top';
				const { pos, flipped } = resolve(
					preferTop ? calcPosWhenTop() : calcPosWhenBottom(),
					preferTop ? calcPosWhenBottom() : calcPosWhenTop(),
					'vertical',
				);
				const [left, top] = clamp(pos, 'vertical');
				// 实际展开方向决定动画原点：向下展开时从顶部展开
				const towardsBottom = preferTop ? flipped : !flipped;
				return { left, top, transformOrigin: towardsBottom ? 'center top' : 'center bottom' };
			}

			case 'left':
			case 'right': {
				const preferLeft = props.direction === 'left';
				const { pos, flipped } = resolve(
					preferLeft ? calcPosWhenLeft() : calcPosWhenRight(),
					preferLeft ? calcPosWhenRight() : calcPosWhenLeft(),
					'horizontal',
				);
				const [left, top] = clamp(pos, 'horizontal');
				const towardsRight = preferLeft ? flipped : !flipped;
				return { left, top, transformOrigin: towardsRight ? 'left center' : 'right center' };
			}
		}
	};

	return calc();
}
