/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';

type HighlightTargetOptions = {
	scroll?: {
		container: HTMLElement | Window;
		top: number;
	};
};

const activeHighlights = new WeakMap<HTMLElement, () => void>();
const highlightDuration = 1800;

/**
 * 定位后单次淡入、停留、淡出，只改变底色；返回的函数同时取消滚动等待和提示。
 */
export function highlightTarget(target: HTMLElement, options: HighlightTargetOptions = {}): (() => void) | null {
	activeHighlights.get(target)?.();
	if (!target.isConnected) return null;

	const animated = prefer.s.animation && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const controller = new AbortController();
	const animations: Animation[] = [];
	let cancelled = false;
	const cancel = () => {
		if (cancelled) return;
		cancelled = true;
		controller.abort();
		for (const animation of animations) animation.cancel();
		if (activeHighlights.get(target) === cancel) activeHighlights.delete(target);
	};
	activeHighlights.set(target, cancel);

	const show = () => {
		controller.abort();
		if (cancelled || !target.isConnected) { cancel(); return; }
		const animateColor = (element: Element, property: 'backgroundColor' | 'fill') => {
			const original = window.getComputedStyle(element)[property];
			const color = `color-mix(in srgb, var(--MI_THEME-accent) 14%, ${original})`;
			const frames = animated ? [
				{ [property]: original, offset: 0, easing: 'ease-out' },
				{ [property]: color, offset: 0.08 },
				{ [property]: color, offset: 0.6, easing: 'ease-in' },
				{ [property]: original, offset: 1 },
			] : [{ [property]: color }, { [property]: color }];
			animations.push(element.animate(frames, { duration: highlightDuration }));
		};
		animateColor(target, 'backgroundColor');
		// 气泡箭头与底色同步，不覆盖文字、图片，也不修改任何定位和圆角。
		for (const fill of target.querySelectorAll<SVGElement>('[data-target-highlight-fill]')) animateColor(fill, 'fill');
		void Promise.all(animations.map(animation => animation.finished)).then(cancel, cancel);
	};

	if (options.scroll) {
		const { container, top } = options.scroll;
		const element = container instanceof HTMLElement ? container : window.document.documentElement;
		const destination = Math.max(0, Math.min(top, element.scrollHeight - element.clientHeight));
		const move = Math.abs(element.scrollTop - destination) > 1;
		if (animated && move) {
			const events = container instanceof HTMLElement ? container : window.document;
			events.addEventListener('scrollend', show, { once: true, signal: controller.signal });
			for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
				events.addEventListener(event, cancel, { passive: true, signal: controller.signal });
			}
			container.scrollTo({ top: destination, behavior: 'smooth' });
		} else {
			if (move) container.scrollTo({ top: destination, behavior: 'instant' });
			show();
		}
	} else {
		show();
	}

	return cancel;
}
