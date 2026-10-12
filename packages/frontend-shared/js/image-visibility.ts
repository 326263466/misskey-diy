/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readonly, ref, watch } from 'vue';
import type { Ref } from 'vue';

type ObserverGroup = {
	observer: IntersectionObserver;
	listeners: Map<HTMLElement, Set<() => void>>;
};

const observers = new Map<Document, ObserverGroup>();

function disconnectWhenEmpty(root: Document, group: ObserverGroup): void {
	if (group.listeners.size !== 0) return;
	group.observer.disconnect();
	if (observers.get(root) === group) observers.delete(root);
}

function getObserver(root: Document, ownerWindow: NonNullable<Document['defaultView']>): ObserverGroup {
	const existing = observers.get(root);
	if (existing != null) return existing;
	const listeners = new Map<HTMLElement, Set<() => void>>();
	const observer = new ownerWindow.IntersectionObserver(entries => {
		for (const entry of entries) {
			if (!entry.isIntersecting) continue;
			const target = entry.target as HTMLElement;
			const callbacks = listeners.get(target);
			if (callbacks == null) continue;
			listeners.delete(target);
			observer.unobserve(target);
			for (const callback of callbacks) callback();
		}
		disconnectWhenEmpty(root, group);
	}, { root, rootMargin: '0px' });
	const group = { observer, listeners };
	observers.set(root, group);
	return group;
}

/** 所有图片按实际滚动容器判断可见性，不在屏外提前触发。 */
export function observeImageVisibility(element: HTMLElement, callback: () => void): () => void {
	const ownerWindow = element.ownerDocument.defaultView;
	if (ownerWindow == null || typeof ownerWindow.IntersectionObserver !== 'function') {
		callback();
		return () => {};
	}
	// 文档视口会同时计算所有祖先的裁剪，也适用于固定定位和多个嵌套滚动区。
	const root = element.ownerDocument;
	const group = getObserver(root, ownerWindow);
	const { observer, listeners } = group;
	let callbacks = listeners.get(element);
	if (callbacks == null) {
		callbacks = new Set([callback]);
		listeners.set(element, callbacks);
		observer.observe(element);
	} else {
		callbacks.add(callback);
	}

	return () => {
		callbacks.delete(callback);
		if (callbacks.size !== 0 || listeners.get(element) !== callbacks) return;
		listeners.delete(element);
		observer.unobserve(element);
		disconnectWhenEmpty(root, group);
	};
}

export function useImagePreload(
	root: Readonly<Ref<HTMLElement | null>>,
	eager: () => boolean,
): Readonly<Ref<boolean>> {
	const ready = ref(false);
	watch([root, eager], ([element, loadImmediately], _previous, onCleanup) => {
		if (ready.value) return;
		if (loadImmediately || typeof window === 'undefined') {
			ready.value = true;
			return;
		}
		if (element == null) return;
		onCleanup(observeImageVisibility(element, () => { ready.value = true; }));
	}, { immediate: true });
	return readonly(ready);
}
