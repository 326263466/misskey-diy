/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { observeImageVisibility } from './image-visibility.js';

type ImageState = {
	source: string;
	target: HTMLElement;
	pending: boolean;
	decoding: boolean;
	visible: boolean;
	stopObserving?: () => void;
	animation?: Animation;
};

const pendingClass = '_imageFadePending';
const managedSelector = '[data-image-fade="managed"], [data-image-fade="off"], #splash';
const splashWaits = new WeakMap<HTMLElement, Promise<void>>();

/** 首屏图片先解码，等启动遮罩退场后再淡入，避免动画被遮罩盖住。 */
export function waitForImageReveal(image: HTMLImageElement): Promise<void> {
	const splash = image.ownerDocument.getElementById('splash');
	if (splash == null) return Promise.resolve();
	const existing = splashWaits.get(splash);
	if (existing != null) return existing;
	const ownerWindow = image.ownerDocument.defaultView!;
	const ready = new Promise<void>(resolve => {
		const waiting = new Set<Animation>();
		const observer = new MutationObserver(check);

		function check(): void {
			if (!splash!.isConnected || Number(ownerWindow.getComputedStyle(splash!).opacity) === 0) {
				observer.disconnect();
				resolve();
				return;
			}
			for (const animation of splash!.getAnimations()) {
				if (waiting.has(animation)) continue;
				waiting.add(animation);
				void animation.finished.then(check, check);
			}
		}

		observer.observe(splash, { attributes: true, attributeFilter: ['style', 'class'] });
		if (splash.parentNode != null) observer.observe(splash.parentNode, { childList: true });
		check();
	});
	splashWaits.set(splash, ready);
	return ready;
}

/** 普通图片的加载淡入；已有媒体动画的组件通过 data-image-fade 声明自行管理。 */
export function initializeImageFade(options: {
	animationsEnabled: () => boolean;
	root?: Document | HTMLElement;
}): { refresh: () => void; disconnect: () => void } {
	const root = options.root ?? window.document;
	const ownerDocument = root instanceof Document ? root : root.ownerDocument;
	const ownerWindow = ownerDocument.defaultView!;
	const reducedMotion = ownerWindow.matchMedia('(prefers-reduced-motion: reduce)');
	const states = new Map<HTMLImageElement, ImageState>();
	let disconnected = false;

	function enabled(): boolean {
		return options.animationsEnabled() && !reducedMotion.matches;
	}

	function included(image: HTMLImageElement): boolean {
		return root.contains(image) && image.closest(managedSelector) == null;
	}

	function sourceOf(image: HTMLImageElement): string {
		const sources = image.parentElement?.tagName === 'PICTURE'
			? Array.from(image.parentElement.querySelectorAll('source')).map(source => [source.srcset, source.sizes, source.media, source.type])
			: [];
		const deferred = image.hasAttribute('data-image-lazy');
		return JSON.stringify([image.getAttribute(deferred ? 'data-image-src' : 'src'), image.getAttribute(deferred ? 'data-image-srcset' : 'srcset'), image.getAttribute('sizes'), sources]);
	}

	function applySource(image: HTMLImageElement): void {
		if (!image.hasAttribute('data-image-lazy')) return;
		for (const attribute of ['srcset', 'src']) {
			const source = image.getAttribute(`data-image-${attribute}`);
			if (source === image.getAttribute(attribute)) continue;
			if (source) image.setAttribute(attribute, source);
			else image.removeAttribute(attribute);
		}
	}

	function targetOf(image: HTMLImageElement): HTMLElement {
		return image.hasAttribute('data-image-fade-background') ? image.parentElement ?? image : image;
	}

	function release(state: ImageState): void {
		state.pending = false;
		state.animation?.cancel();
		state.animation = undefined;
		state.target.classList.remove(pendingClass);
	}

	function forget(image: HTMLImageElement): void {
		const state = states.get(image);
		if (state != null) {
			state.stopObserving?.();
			release(state);
		}
		states.delete(image);
	}

	function prepare(image: HTMLImageElement): ImageState | undefined {
		if (!included(image)) {
			forget(image);
			applySource(image);
			return;
		}
		const source = sourceOf(image);
		const target = targetOf(image);
		const previous = states.get(image);
		if (previous?.source === source && previous.target === target) return previous;
		if (previous != null) {
			previous.stopObserving?.();
			release(previous);
		}
		const state: ImageState = { source, target, pending: false, decoding: false, visible: false };
		states.set(image, state);
		const deferred = image.hasAttribute('data-image-lazy');
		if (deferred) {
			image.removeAttribute('src');
			image.removeAttribute('srcset');
		}
		if (!image.getAttribute(deferred ? 'data-image-src' : 'src') && !image.getAttribute(deferred ? 'data-image-srcset' : 'srcset')) {
			applySource(image);
			return state;
		}
		if (enabled() && typeof image.animate === 'function' && (deferred || !image.complete || image.naturalWidth > 0)) {
			state.pending = true;
			target.classList.add(pendingClass);
		}
		state.stopObserving = observeImageVisibility(target, () => {
			if (states.get(image) !== state || !included(image)) return;
			state.visible = true;
			applySource(image);
			if (image.complete && image.naturalWidth > 0) void reveal(image, state);
		});
		return state;
	}

	async function reveal(image: HTMLImageElement, state: ImageState): Promise<void> {
		if (state.decoding || !state.visible) return;
		state.decoding = true;
		try {
			await image.decode();
		} catch {
			// 个别格式拒绝 decode，但已成功加载的图片仍可正常显示。
		}
		if (enabled()) await waitForImageReveal(image);
		if (disconnected || states.get(image) !== state || sourceOf(image) !== state.source || !included(image)) return;
		state.decoding = false;
		if (!image.complete || image.naturalWidth === 0) return;
		const wasPending = state.pending;
		release(state);
		if (!wasPending || !enabled()) return;
		const target = state.target;
		const style = ownerWindow.getComputedStyle(target);
		if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
		// 仅临时合成透明度，不改写业务样式，也不影响 transform 等交互动画。
		const animation = target.animate([{ opacity: 0 }, { opacity: style.opacity }], { duration: 400, easing: 'ease' });
		state.animation = animation;
		animation.onfinish = () => {
			if (state.animation !== animation) return;
			state.animation = undefined;
			animation.cancel();
		};
	}

	function onLoad(event: Event): void {
		if (!(event.target instanceof HTMLImageElement)) return;
		const image = event.target;
		const state = prepare(image);
		if (state == null || !image.complete || image.naturalWidth === 0) return;
		if (state.visible && state.pending) void reveal(image, state);
	}

	function onError(event: Event): void {
		if (!(event.target instanceof HTMLImageElement)) return;
		const image = event.target;
		const state = prepare(image);
		if (state != null && image.complete && image.naturalWidth === 0) {
			// 失败后保留浏览器的 alt / 错误呈现，不能把图片永久留在透明状态。
			release(state);
		}
	}

	function collect(node: Node, callback: (image: HTMLImageElement) => void): void {
		if (node instanceof HTMLImageElement) callback(node);
		if (node instanceof Element || node instanceof Document) {
			for (const image of node.querySelectorAll('img')) callback(image);
		}
	}

	const observer = new MutationObserver(records => {
		const changed = new Set<HTMLImageElement>();
		for (const record of records) {
			if (record.type === 'attributes') {
				if (record.attributeName === 'data-image-fade') collect(record.target, image => changed.add(image));
				if (record.target instanceof HTMLImageElement) changed.add(record.target);
				if (record.target instanceof HTMLSourceElement) {
					const image = record.target.closest('picture')?.querySelector('img');
					if (image != null) changed.add(image);
				}
			} else {
				for (const node of record.removedNodes) collect(node, image => { if (!root.contains(image)) forget(image); });
				for (const node of record.addedNodes) collect(node, image => changed.add(image));
				if (record.target instanceof HTMLPictureElement) collect(record.target, image => changed.add(image));
			}
		}
		for (const image of changed) prepare(image);
	});
	observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset', 'sizes', 'media', 'type', 'data-image-fade', 'data-image-lazy', 'data-image-src', 'data-image-srcset', 'data-image-fade-background'] });
	root.addEventListener('load', onLoad, true);
	root.addEventListener('error', onError, true);
	collect(root, prepare);

	function refresh(): void {
		for (const [image, state] of states) {
			if (!included(image)) forget(image);
			else if (!enabled()) release(state);
		}
	}

	reducedMotion.addEventListener('change', refresh);

	return {
		refresh,
		disconnect() {
			disconnected = true;
			observer.disconnect();
			root.removeEventListener('load', onLoad, true);
			root.removeEventListener('error', onError, true);
			reducedMotion.removeEventListener('change', refresh);
			for (const image of states.keys()) forget(image);
		},
	};
}
