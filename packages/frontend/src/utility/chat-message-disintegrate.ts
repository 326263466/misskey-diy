/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const CLONE_NODE_BUDGET = 6000;
const MAX_PARTICLE_LAYERS = 24;
const MAX_PARTICLES = 36000;
const TARGET_FRAGMENT_SIZE = 3;
const MIN_DURATION = 140;
const MAX_DURATION = 210;
const COLLAPSE_DURATION = 140;

/**
 * 将聊天气泡拆成小块 DOM 快照，让它们向外散开并淡出。
 *
 * 动画期间只隐藏原气泡，保留它占用的布局空间。调用方可以在 Promise
 * 结束后删除消息，不会因为动画期间的布局变化留下空白。
 */
export async function animateChatMessageDisintegration(element: HTMLElement, signal?: AbortSignal, onStart?: () => void): Promise<void> {
	if (typeof window === 'undefined' || typeof window.document === 'undefined') return;
	if (!element.isConnected || window.document.hidden || signal?.aborted) return;
	const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
	if (reduceMotion?.matches) return;

	const source = element.matches('[data-chat-bubble]')
		? element
		: element.querySelector<HTMLElement>('[data-chat-bubble]') ?? element;
	if (!source.isConnected) return;

	const computedStyle = window.getComputedStyle(source);
	const bounds = source.getBoundingClientRect();
	if (
		computedStyle.display === 'none'
		|| computedStyle.visibility === 'hidden'
		|| computedStyle.opacity === '0'
		|| bounds.width <= 0
		|| bounds.height <= 0
		|| bounds.right <= 0
		|| bounds.bottom <= 0
		|| bounds.left >= window.innerWidth
		|| bounds.top >= window.innerHeight
	) return;
	if (typeof source.animate !== 'function') return;

	const ownerDocument = source.ownerDocument;
	if (!ownerDocument.body) return;
	const overlay = ownerDocument.createElement('div');
	overlay.setAttribute('data-chat-message-disintegrate-overlay', '');
	overlay.setAttribute('aria-hidden', 'true');
	overlay.setAttribute('inert', '');
	overlay.style.position = 'fixed';
	overlay.style.inset = '0';
	overlay.style.width = '100vw';
	overlay.style.height = '100vh';
	overlay.style.overflow = 'visible';
	overlay.style.pointerEvents = 'none';
	overlay.style.zIndex = '2147483647';
	overlay.style.contain = 'strict';

	const oldVisibility = source.style.visibility;
	const animations: Animation[] = [];
	const particles: Array<{ element: HTMLElement; tint: HTMLElement; x: number; y: number; angle: number; duration: number; delay: number }> = [];
	let abortHandler: (() => void) | undefined;
	let cleanedUp = false;

	const cleanup = () => {
		if (cleanedUp) return;
		cleanedUp = true;
		for (const animation of animations) {
			try {
				animation.cancel();
			} catch {
				// 即使浏览器拒绝取消动画，也必须继续清理覆盖层。
			}
		}
		if (abortHandler && signal) signal.removeEventListener('abort', abortHandler);
		overlay.remove();
		source.style.visibility = oldVisibility;
	};

	try {
		const cloneNodeCount = countDomNodes(source);
		const visible = getVisibleBounds(source, bounds);
		if (visible.width <= 0 || visible.height <= 0) return;
		const layerCount = Math.min(MAX_PARTICLE_LAYERS, Math.max(8, Math.floor(CLONE_NODE_BUDGET / cloneNodeCount)));
		const fragmentSize = Math.max(TARGET_FRAGMENT_SIZE, Math.sqrt(visible.width * visible.height / MAX_PARTICLES));
		const columns = Math.max(1, Math.ceil(visible.width / fragmentSize));
		const rows = Math.max(1, Math.ceil(visible.height / fragmentSize));
		const tileWidth = visible.width / columns;
		const tileHeight = visible.height / rows;
		// 每层只保留随机分布的微小像素，密度与消息面积无关，避免大消息变成大块矩形。
		// 多个粒子共用一份 DOM 快照，图片、代码与视频也不必复制成数万个节点。
		const masks = Array.from({ length: Math.min(layerCount, columns * rows) }, () => '');
		const sectors = Math.max(1, Math.min(8, Math.floor(masks.length / 2)));
		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				const direction = Math.atan2(row + 0.5 - rows / 2, column + 0.5 - columns / 2) + (Math.random() - 0.5) * 0.6;
				const sector = Math.floor(((direction + Math.PI * 4) % (Math.PI * 2)) / (Math.PI * 2) * sectors);
				const layer = sector + sectors * Math.floor(Math.random() * Math.ceil((masks.length - sector) / sectors));
				masks[layer] += `M${(column * tileWidth).toFixed(2)} ${(row * tileHeight).toFixed(2)}h${tileWidth.toFixed(2)}v${tileHeight.toFixed(2)}h-${tileWidth.toFixed(2)}z`;
			}
		}
		let template = source.cloneNode(true) as HTMLElement;
		freezeSnapshotStyles(source, template);
		template = sanitizeSnapshot(template, source);

		for (const [index, mask] of masks.entries()) {
			if (!mask) continue;
			const fragment = ownerDocument.createElement('div');
			fragment.setAttribute('data-chat-message-disintegrate-fragment', '');
			fragment.setAttribute('aria-hidden', 'true');
			fragment.style.position = 'absolute';
			fragment.style.left = `${visible.left}px`;
			fragment.style.top = `${visible.top}px`;
			fragment.style.width = `${visible.width}px`;
			fragment.style.height = `${visible.height}px`;
			fragment.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${visible.width}" height="${visible.height}" viewBox="0 0 ${visible.width} ${visible.height}"><path fill="white" d="${mask}"/></svg>`)}")`;
			fragment.style.maskRepeat = 'no-repeat';
			fragment.style.maskSize = '100% 100%';
			fragment.style.overflow = 'hidden';
			fragment.style.contain = 'paint';
			fragment.style.pointerEvents = 'none';
			fragment.style.willChange = 'transform, opacity';

			const snapshot = template.cloneNode(true) as HTMLElement;
			copyCanvasBitmaps(template, snapshot);
			snapshot.setAttribute('data-chat-message-disintegrate-snapshot', '');
			snapshot.setAttribute('data-image-fade', 'off');
			snapshot.setAttribute('aria-hidden', 'true');
			snapshot.style.position = 'absolute';
			snapshot.style.left = `${bounds.left - visible.left}px`;
			snapshot.style.top = `${bounds.top - visible.top}px`;
			snapshot.style.width = `${bounds.width}px`;
			snapshot.style.height = `${bounds.height}px`;
			snapshot.style.boxSizing = 'border-box';
			snapshot.style.maxWidth = 'none';
			snapshot.style.maxHeight = 'none';
			snapshot.style.pointerEvents = 'none';
			fragment.append(snapshot);
			const tint = ownerDocument.createElement('div');
			tint.style.cssText = `position:absolute;inset:0;opacity:0;pointer-events:none;background:hsl(${index * 137.5 % 360} 78% 62%)`;
			fragment.append(tint);
			overlay.append(fragment);

			const angle = (Math.random() - 0.5) * 5;
			const direction = (index % sectors + 0.5) / sectors * Math.PI * 2;
			const spread = 18 + Math.random() * 28;
			const x = Math.cos(direction) * spread;
			const y = Math.sin(direction) * spread;
			const duration = MIN_DURATION + Math.random() * (MAX_DURATION - MIN_DURATION);
			const delay = Math.random() * 18;
			particles.push({ element: fragment, tint, x, y, angle, duration, delay });
		}

		overlay.ownerDocument.body.append(overlay);
		source.style.visibility = 'hidden';

		for (const particle of particles) {
			if (typeof particle.element.animate !== 'function') return;
			try {
				animations.push(particle.element.animate([
					{ opacity: 1, transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)' },
					{ opacity: 0.75, transform: `translate3d(${particle.x * 0.35}px, ${particle.y * 0.35}px, 0) rotate(${particle.angle * 0.35}deg) scale(1)` },
					{ opacity: 0, transform: `translate3d(${particle.x}px, ${particle.y}px, 0) rotate(${particle.angle}deg) scale(1)` },
				], {
					duration: particle.duration,
					delay: particle.delay,
					easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)',
					fill: 'forwards',
				}));
				animations.push(particle.tint.animate([
					{ opacity: 0 },
					{ opacity: 0.65, offset: 0.45 },
					{ opacity: 1 },
				], { duration: particle.duration, delay: particle.delay, easing: 'ease-out', fill: 'forwards' }));
			} catch {
				return;
			}
		}

		if (animations.length === 0) return;
		if (animations.some(animation => typeof animation.finished?.then !== 'function')) return;
		try { onStart?.(); } catch { /* 音效等附加反馈失败时继续动画。 */ }

		const animationDone = Promise.allSettled(animations.map(animation => animation.finished));
		const abort = new Promise<void>((resolve) => {
			if (!signal) return;
			abortHandler = resolve;
			if (signal.aborted) resolve();
			else signal.addEventListener('abort', abortHandler, { once: true });
		});
		await Promise.race([animationDone, abort]);
	} finally {
		cleanup();
	}
}

/** 碎片消散后收拢消息行及一个相邻间距，完成后由调用方移除消息。 */
export async function collapseChatMessageSpace(element: HTMLElement, signal?: AbortSignal): Promise<void> {
	if (!element.isConnected || window.document.hidden || signal?.aborted || typeof element.animate !== 'function') return;
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
	const computedStyle = window.getComputedStyle(element);
	const height = element.offsetHeight;
	if (height <= 0 || computedStyle.display === 'none') return;
	const parent = element.parentElement;
	const gap = parent ? parseFloat(window.getComputedStyle(parent).rowGap) || 0 : 0;
	const marginTop = parseFloat(computedStyle.marginTop) || 0;
	const marginBottom = parseFloat(computedStyle.marginBottom) || 0;
	// 保留 flex gap，只用本行的负边距抵消一个间距，兄弟消息不需要位移动画。
	const endMarginTop = marginTop - (!element.nextElementSibling && element.previousElementSibling ? gap : 0);
	const endMarginBottom = marginBottom - (element.nextElementSibling ? gap : 0);
	const originalStyle = element.style.cssText;
	element.style.visibility = 'hidden';
	element.style.pointerEvents = 'none';
	element.style.overflow = 'clip';
	element.style.boxSizing = 'border-box';
	element.style.minHeight = '0';
	element.style.flexShrink = '0';
	let animation: Animation | undefined;
	let abortHandler: (() => void) | undefined;
	let completed = false;
	try {
		animation = element.animate([
			{
				height: `${height}px`,
				paddingTop: computedStyle.paddingTop,
				paddingBottom: computedStyle.paddingBottom,
				borderTopWidth: computedStyle.borderTopWidth,
				borderBottomWidth: computedStyle.borderBottomWidth,
				marginTop: `${marginTop}px`,
				marginBottom: `${marginBottom}px`,
			},
			{
				height: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px',
				marginTop: `${endMarginTop}px`, marginBottom: `${endMarginBottom}px`,
			},
		], { duration: COLLAPSE_DURATION, easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)', fill: 'forwards' });
		const abort = new Promise<void>(resolve => {
			if (!signal) return;
			abortHandler = resolve;
			if (signal.aborted) resolve();
			else signal.addEventListener('abort', abortHandler, { once: true });
		});
		await Promise.race([animation.finished, abort]);
		completed = !signal?.aborted && element.isConnected;
	} finally {
		if (abortHandler && signal) signal.removeEventListener('abort', abortHandler);
		if (completed) {
			// 取消 WAAPI 后仍保持最终占位，避免 splice 前闪回原高度。
			element.style.height = '0px';
			element.style.paddingTop = '0px';
			element.style.paddingBottom = '0px';
			element.style.borderTopWidth = '0px';
			element.style.borderBottomWidth = '0px';
			element.style.marginTop = `${endMarginTop}px`;
			element.style.marginBottom = `${endMarginBottom}px`;
		} else {
			element.style.cssText = originalStyle;
		}
		animation?.cancel();
	}
}

function getVisibleBounds(source: HTMLElement, bounds: DOMRect) {
	let left = Math.max(0, bounds.left);
	let top = Math.max(0, bounds.top);
	let right = Math.min(window.innerWidth, bounds.right);
	let bottom = Math.min(window.innerHeight, bounds.bottom);
	for (let parent = source.parentElement; parent; parent = parent.parentElement) {
		const style = window.getComputedStyle(parent);
		const rect = parent.getBoundingClientRect();
		if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
			left = Math.max(left, rect.left);
			right = Math.min(right, rect.right);
		}
		if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
			top = Math.max(top, rect.top);
			bottom = Math.min(bottom, rect.bottom);
		}
	}
	return { left, top, width: right - left, height: bottom - top };
}

function countDomNodes(root: Node): number {
	let count = 1;
	for (let child = root.firstChild; child != null; child = child.nextSibling) {
		count += countDomNodes(child);
	}
	return count;
}

function freezeSnapshotStyles(source: HTMLElement, snapshot: HTMLElement): void {
	const sourceNodes = [source, ...source.querySelectorAll('*')];
	const snapshotNodes = [snapshot, ...snapshot.querySelectorAll('*')];
	const length = Math.min(sourceNodes.length, snapshotNodes.length);

	for (let index = 0; index < length; index++) {
		const sourceStyle = window.getComputedStyle(sourceNodes[index]);
		const snapshotStyle = (snapshotNodes[index] as HTMLElement).style;
		for (let propertyIndex = 0; propertyIndex < sourceStyle.length; propertyIndex++) {
			const property = sourceStyle.item(propertyIndex);
			snapshotStyle.setProperty(property, sourceStyle.getPropertyValue(property), sourceStyle.getPropertyPriority(property));
		}
	}
}

function sanitizeSnapshot(snapshot: HTMLElement, source: HTMLElement): HTMLElement {
	if (source.tagName === 'VIDEO') {
		const mediaSnapshot = createVideoSnapshot(source as HTMLVideoElement, snapshot);
		stripSnapshotIdentity(mediaSnapshot);
		return mediaSnapshot;
	}
	if (source.tagName === 'AUDIO' || source.tagName === 'IFRAME') {
		const mediaSnapshot = createStaticMediaPlaceholder(snapshot, source.tagName === 'IFRAME' ? 'iframe' : 'audio');
		stripSnapshotIdentity(mediaSnapshot);
		return mediaSnapshot;
	}

	copyCanvasBitmaps(source, snapshot);
	const sourceMedia = [...source.querySelectorAll('video, audio, iframe')];
	const snapshotMedia = [...snapshot.querySelectorAll('video, audio, iframe')];
	const mediaCount = Math.min(sourceMedia.length, snapshotMedia.length);

	for (let index = 0; index < mediaCount; index++) {
		const sourceNode = sourceMedia[index];
		const snapshotNode = snapshotMedia[index] as HTMLElement;
		const replacement = sourceNode.tagName === 'VIDEO'
			? createVideoSnapshot(sourceNode as HTMLVideoElement, snapshotNode)
			: createStaticMediaPlaceholder(snapshotNode, sourceNode.tagName === 'IFRAME' ? 'iframe' : 'audio');
		snapshotNode.replaceWith(replacement);
	}

	stripSnapshotIdentity(snapshot);
	return snapshot;
}

function stripSnapshotIdentity(snapshot: HTMLElement): void {
	const identityNodes = [snapshot, ...snapshot.querySelectorAll<HTMLElement>('*')];
	for (const node of identityNodes) {
		node.removeAttribute('id');
		node.removeAttribute('aria-describedby');
		node.removeAttribute('aria-labelledby');
		node.removeAttribute('data-chat-message-id');
	}
}

function copyCanvasBitmaps(source: HTMLElement, snapshot: HTMLElement): void {
	const sourceCanvases = [
		...(source.tagName === 'CANVAS' ? [source as HTMLCanvasElement] : []),
		...source.querySelectorAll<HTMLCanvasElement>('canvas'),
	];
	const snapshotCanvases = [
		...(snapshot.tagName === 'CANVAS' ? [snapshot as HTMLCanvasElement] : []),
		...snapshot.querySelectorAll<HTMLCanvasElement>('canvas'),
	];
	const canvasCount = Math.min(sourceCanvases.length, snapshotCanvases.length);

	for (let index = 0; index < canvasCount; index++) {
		const sourceCanvas = sourceCanvases[index];
		const snapshotCanvas = snapshotCanvases[index];
		snapshotCanvas.width = sourceCanvas.width;
		snapshotCanvas.height = sourceCanvas.height;
		const context = snapshotCanvas.getContext('2d');
		if (!context) continue;
		try {
			context.drawImage(sourceCanvas, 0, 0);
		} catch {
			// 被污染的 canvas 无法读取像素，保留空白快照并继续动画。
		}
	}
}

function createVideoSnapshot(video: HTMLVideoElement, frozenNode: HTMLElement): HTMLElement {
	const ownerDocument = video.ownerDocument;
	const canvas = ownerDocument.createElement('canvas');
	const width = video.videoWidth;
	const height = video.videoHeight;
	if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && width > 0 && height > 0) {
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (context) {
			try {
				context.drawImage(video, 0, 0, width, height);
				canvas.style.cssText = frozenNode.style.cssText;
				return canvas;
			} catch {
				// 跨域视频不能读取当前帧，继续退回静态 poster。
			}
		}
	}

	const placeholder = createStaticMediaPlaceholder(frozenNode, 'video');
	const poster = video.getAttribute('poster');
	if (poster) {
		placeholder.style.backgroundImage = `url(${JSON.stringify(poster)})`;
		placeholder.style.backgroundPosition = 'center';
		placeholder.style.backgroundRepeat = 'no-repeat';
		placeholder.style.backgroundSize = 'cover';
	}
	return placeholder;
}

function createStaticMediaPlaceholder(frozenNode: HTMLElement, kind: 'audio' | 'iframe' | 'video'): HTMLElement {
	const placeholder = frozenNode.ownerDocument.createElement('div');
	placeholder.setAttribute('aria-hidden', 'true');
	placeholder.style.cssText = frozenNode.style.cssText;
	placeholder.style.pointerEvents = 'none';
	placeholder.dataset.chatMessageDisintegrateMedia = kind;
	return placeholder;
}
