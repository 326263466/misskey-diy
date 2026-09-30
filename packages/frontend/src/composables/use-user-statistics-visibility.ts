/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, inject, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { DI } from '@/di.js';

type VisibilityListener = (visible: boolean) => void;
const listeners = new Map<HTMLElement, Set<VisibilityListener>>();
const states = new WeakMap<HTMLElement, boolean>();
let observer: IntersectionObserver | null = null;
const documentVisible = ref(window.document.visibilityState === 'visible');
let visibilityReferences = 0;

function onVisibilityChange(): void {
	documentVisible.value = window.document.visibilityState === 'visible';
}

function observe(element: HTMLElement, listener: VisibilityListener): () => void {
	if (typeof window.IntersectionObserver !== 'function') {
		listener(true);
		return () => {};
	}
	observer ??= new window.IntersectionObserver(entries => {
		for (const entry of entries) {
			const target = entry.target as HTMLElement;
			states.set(target, entry.isIntersecting);
			for (const callback of listeners.get(target) ?? []) callback(entry.isIntersecting);
		}
	}, { rootMargin: '200% 0px' });
	let callbacks = listeners.get(element);
	if (callbacks == null) {
		callbacks = new Set();
		listeners.set(element, callbacks);
		observer.observe(element);
	}
	callbacks.add(listener);
	listener(states.get(element) ?? false);
	return () => {
		callbacks.delete(listener);
		if (callbacks.size > 0) return;
		listeners.delete(element);
		states.delete(element);
		observer?.unobserve(element);
		if (listeners.size === 0) {
			observer?.disconnect();
			observer = null;
		}
	};
}

export function useUserStatisticsVisibility(
	rootEl?: Readonly<Ref<HTMLElement | null | undefined>>,
	pageActive?: Readonly<Ref<boolean>>,
): Readonly<Ref<boolean>> {
	const inheritedPageActive = inject(DI.pageActive, ref(true));
	const activated = ref(true);
	const nearViewport = ref(rootEl == null);
	if (visibilityReferences++ === 0) {
		onVisibilityChange();
		window.document.addEventListener('visibilitychange', onVisibilityChange);
	}
	onActivated(() => { activated.value = true; });
	onDeactivated(() => { activated.value = false; });
	onScopeDispose(() => {
		if (--visibilityReferences === 0) window.document.removeEventListener('visibilitychange', onVisibilityChange);
	});
	if (rootEl != null) {
		watch(rootEl, (element, _previous, onCleanup) => {
			nearViewport.value = false;
			if (element) onCleanup(observe(element, visible => { nearViewport.value = visible; }));
		}, { immediate: true });
	}
	return computed(() => activated.value && inheritedPageActive.value && (pageActive?.value ?? true) && documentVisible.value && nearViewport.value);
}
