/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { Router } from '@/router.js';
import { DI } from '@/di.js';

type ScrollPosition = {
	target: WeakRef<HTMLElement>;
	path: number[];
	className: string;
	top: number;
	left: number;
	anchorId: string | null;
	anchorOffset: number;
};

const histories = new WeakMap<Router, Map<string, ScrollPosition[]>>();
const scrollSelector = '._pageContainer, ._pageScrollable, ._pageScrollableReversed, ._pageContent, ._pageNavigation';
const maxEntries = 100;

function visible(el: HTMLElement): boolean {
	return el.isConnected && el.getClientRects().length > 0 && !el.closest('[data-route-active="false"], [inert]');
}

function containers(root: HTMLElement): HTMLElement[] {
	return [root, ...root.querySelectorAll<HTMLElement>(scrollSelector)].filter(el => visible(el)
		&& (el === root || /auto|scroll/.test(window.getComputedStyle(el).overflowY) || el.scrollTop !== 0 || el.scrollLeft !== 0));
}

function elementPath(root: HTMLElement, el: HTMLElement): number[] {
	const path: number[] = [];
	let current: Element | null = el;
	while (current !== root && current?.parentElement) {
		path.unshift(Array.prototype.indexOf.call(current.parentElement.children, current));
		current = current.parentElement;
	}
	return path;
}

function resolvePath(root: HTMLElement, path: number[]): HTMLElement | null {
	let current: Element | undefined = root;
	for (const index of path) current = current?.children[index];
	return current instanceof HTMLElement ? current : null;
}

function anchorFor(el: HTMLElement, scopes: Set<HTMLElement>): HTMLElement | null {
	const middle = el.getBoundingClientRect().top + el.clientHeight / 2;
	const anchors = el.querySelectorAll<HTMLElement>('[data-scroll-anchor]');
	for (let i = anchors.length - 1; i >= 0; i--) {
		const anchor = anchors[i];
		if (!visible(anchor) || anchor.getBoundingClientRect().top > middle) continue;
		let parent = anchor.parentElement;
		while (parent && !scopes.has(parent)) parent = parent.parentElement;
		if (parent === el) return anchor;
	}
	return null;
}

export function useRouteScrollRestoration(rootRef: Ref<HTMLElement | null | undefined>, router: Router) {
	let history = histories.get(router);
	if (!history) {
		history = new Map();
		histories.set(router, history);
	}
	const saved = history;
	let generation = 0;
	let observer: MutationObserver | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let frame: number | null = null;
	let timer: number | null = null;
	let retryTimer: number | null = null;
	let pendingEntry: string | null = null;
	let settledEntry: string | null = null;
	let cancelListeners: (() => void) | null = null;
	const restoring = ref(false);

	const hasSnapshot = computed(() => router.navigationRef.value.type === 'traverse' && saved.has(router.navigationRef.value.entryId));
	provide(DI.routeScrollHasSnapshot, hasSnapshot);
	provide(DI.routeScrollPending, restoring);
	provide(DI.routeScrollCancel, cancel);

	function stop() {
		observer?.disconnect();
		resizeObserver?.disconnect();
		observer = null;
		resizeObserver = null;
		if (frame != null) window.cancelAnimationFrame(frame);
		if (timer != null) window.clearTimeout(timer);
		if (retryTimer != null) window.clearTimeout(retryTimer);
		frame = null;
		timer = null;
		retryTimer = null;
		cancelListeners?.();
		cancelListeners = null;
		pendingEntry = null;
		restoring.value = false;
	}

	function cancel() {
		generation++;
		settledEntry = router.navigationRef.value.entryId;
		stop();
	}

	function capture(entryId: string) {
		const root = rootRef.value;
		if (!root?.isConnected) return;
		const elements = containers(root);
		const scopes = new Set(elements);
		const positions = elements.map(el => {
			const anchor = el.scrollTop > 100 ? anchorFor(el, scopes) : null;
			return {
				target: new WeakRef(el), path: elementPath(root, el), className: el.className,
				top: el.scrollTop, left: el.scrollLeft, anchorId: anchor?.getAttribute('data-scroll-anchor') ?? null,
				anchorOffset: anchor ? anchor.getBoundingClientRect().top - el.getBoundingClientRect().top : 0,
			};
		});
		if (positions.length === 0) return;
		saved.delete(entryId);
		saved.set(entryId, positions);
		if (saved.size > maxEntries) saved.delete(saved.keys().next().value!);
	}

	function targetFor(root: HTMLElement, position: ScrollPosition): HTMLElement | null {
		const original = position.target.deref();
		// 缓存页尚未激活时等待原容器，不把旧位置写到相同结构的其他页面。
		if (original && root.contains(original)) return visible(original) ? original : null;
		const fallback = resolvePath(root, position.path);
		return fallback && fallback.className === position.className && visible(fallback) ? fallback : null;
	}

	function apply(root: HTMLElement, positions: ScrollPosition[]): boolean {
		let complete = true;
		for (const position of positions) {
			const el = targetFor(root, position);
			if (!el) { complete = false; continue; }
			const anchor = position.anchorId ? Array.from(el.querySelectorAll<HTMLElement>('[data-scroll-anchor]'))
				.find(item => item.getAttribute('data-scroll-anchor') === position.anchorId && visible(item)) : null;
			const top = anchor
				? el.scrollTop + anchor.getBoundingClientRect().top - el.getBoundingClientRect().top - position.anchorOffset
				: position.top;
			el.scrollTo({ top, left: position.left, behavior: 'instant' });
			if (Math.abs(el.scrollTop - top) > 1 || Math.abs(el.scrollLeft - position.left) > 1) complete = false;
		}
		return complete;
	}

	function reset(root: HTMLElement) {
		for (const el of containers(root)) {
			// 左侧菜单是独立导航，不随右侧的新页面回顶；反向聊天由会话组件管理。
			if (el.matches('._pageNavigation, ._pageScrollableReversed') || el.closest('._pageNavigation')) continue;
			el.scrollTo({ top: 0, left: 0, behavior: 'instant' });
		}
	}

	function restorePageScroll() {
		const navigation = router.navigationRef.value;
		if (settledEntry === navigation.entryId || pendingEntry === navigation.entryId) return;
		stop();
		pendingEntry = navigation.entryId;
		restoring.value = navigation.type === 'traverse';
		const request = ++generation;
		void nextTick(() => {
			const root = rootRef.value;
			if (request !== generation || !root?.isConnected) {
				if (request === generation) pendingEntry = null;
				return;
			}
			const positions = navigation.type === 'traverse' ? saved.get(navigation.entryId) : undefined;
			let route = router.currentRef.value;
			while (route.child) route = route.child;
			// 标签参数由页面处理，普通锚点和设置搜索标记不参与归顶。
			let hash = route.route.hash ? null : route._parsedRoute.hash;
			if (hash) {
				try { hash = decodeURIComponent(hash); } catch { /* 保留原始 hash。 */ }
			}
			let passes = 0;
			const attempt = () => {
				frame = null;
				if (retryTimer != null) window.clearTimeout(retryTimer);
				retryTimer = null;
				if (request !== generation || navigation.entryId !== router.navigationRef.value.entryId) return;
				const currentRoot = rootRef.value;
				if (!currentRoot?.isConnected) return;
				let complete: boolean;
				if (positions) {
					complete = apply(currentRoot, positions);
				} else if (hash) {
					const target = Array.from(currentRoot.querySelectorAll<HTMLElement>('[id], [data-in-app-search-marker-id]'))
						.find(el => visible(el) && (el.id === hash || el.getAttribute('data-in-app-search-marker-id') === hash));
					complete = target != null;
					// SearchMarker 自己负责居中和高亮，避免两个滚动逻辑相互覆盖。
					if (target && !target.hasAttribute('data-in-app-search-marker-id')) target.scrollIntoView({ block: 'start', behavior: 'instant' });
				} else {
					reset(currentRoot);
					complete = true;
				}
				// 两次绘制覆盖缓存激活和布局测量；异步高度不足时再等内容变化。
				const loading = Array.from(currentRoot.querySelectorAll<HTMLElement>('[data-splash-gate]')).some(visible);
				if (complete && ++passes >= 2 && !loading) {
					settledEntry = navigation.entryId;
					stop();
				} else if (complete) schedule();
				else retryTimer = window.setTimeout(schedule, 80);
			};
			const schedule = () => {
				if (frame == null) frame = window.requestAnimationFrame(attempt);
			};
			observer = new MutationObserver(schedule);
			observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'data-route-active'] });
			resizeObserver = new ResizeObserver(schedule);
			resizeObserver.observe(root);
			const cancelOnInput = () => cancel();
			for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) root.addEventListener(event, cancelOnInput, { passive: true });
			cancelListeners = () => {
				for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) root.removeEventListener(event, cancelOnInput);
			};
			// 缓存逐出或锚点失效时只恢复现有范围，不撑高页面或无限请求分页。
			timer = window.setTimeout(() => { settledEntry = navigation.entryId; stop(); }, 2000);
			schedule();
		});
	}

	router.useListener('before-change', ({ beforeNavigation }) => {
		// 快速前进后退中，未恢复完的夹断位置不能覆盖原历史快照。
		const restoreInProgress = restoring.value && pendingEntry === beforeNavigation.entryId && saved.has(beforeNavigation.entryId);
		stop();
		generation++;
		if (!restoreInProgress) capture(beforeNavigation.entryId);
		settledEntry = null;
		restoring.value = true;
	});
	router.useListener('change', restorePageScroll);
	onMounted(restorePageScroll);
	watch(rootRef, restorePageScroll, { flush: 'post' });
	onBeforeUnmount(() => { generation++; stop(); });
}
