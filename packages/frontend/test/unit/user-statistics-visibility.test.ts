/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, KeepAlive, nextTick, ref, shallowRef } from 'vue';
import type { Ref } from 'vue';
import { useUserStatisticsVisibility } from '@/composables/use-user-statistics-visibility.js';
import { DI } from '@/di.js';

const observers: VisibilityObserver[] = [];
let documentVisibility: DocumentVisibilityState = 'visible';

class VisibilityObserver {
	readonly observe = vi.fn();
	readonly unobserve = vi.fn();
	readonly disconnect = vi.fn();

	constructor(readonly callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) {
		observers.push(this);
	}

	setVisible(target: HTMLElement, visible: boolean) {
		const bounds = target.getBoundingClientRect();
		this.callback([{
			target, isIntersecting: visible, intersectionRatio: visible ? 1 : 0,
			boundingClientRect: bounds, intersectionRect: bounds, rootBounds: null, time: 0,
		}], this as unknown as IntersectionObserver);
	}
}

function mountVisibility(root: Ref<HTMLElement | null> | undefined, pageActive = ref(true), inheritedPageActive = ref(true)) {
	let active!: Readonly<Ref<boolean>>;
	const view = render(defineComponent({
		setup() {
			active = useUserStatisticsVisibility(root, pageActive);
			return () => h('div');
		},
	}), { global: { provide: { [DI.pageActive as symbol]: inheritedPageActive } } });
	return { ...view, active, pageActive, inheritedPageActive };
}

describe('user statistics visibility', () => {
	beforeEach(() => {
		documentVisibility = 'visible';
		vi.spyOn(window.document, 'visibilityState', 'get').mockImplementation(() => documentVisibility);
		vi.stubGlobal('IntersectionObserver', VisibilityObserver);
		observers.length = 0;
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test('uses a shared observer with a 200% viewport margin and releases the last listener', () => {
		const element = window.document.createElement('div');
		const root = shallowRef<HTMLElement | null>(element);
		const first = mountVisibility(root);
		const second = mountVisibility(root);
		expect(observers).toHaveLength(1);
		expect(observers[0].options.rootMargin).toBe('200% 0px');
		expect(observers[0].observe).toHaveBeenCalledExactlyOnceWith(element);
		expect(first.active.value).toBe(false);
		observers[0].setVisible(element, true);
		expect(first.active.value).toBe(true);
		expect(second.active.value).toBe(true);
		first.unmount();
		expect(observers[0].unobserve).not.toHaveBeenCalled();
		second.unmount();
		expect(observers[0].unobserve).toHaveBeenCalledExactlyOnceWith(element);
		expect(observers[0].disconnect).toHaveBeenCalledOnce();
	});

	test('requires both inherited and explicit page activity even while the element intersects', () => {
		const element = window.document.createElement('div');
		const view = mountVisibility(shallowRef(element), ref(true), ref(false));
		observers[0].setVisible(element, true);
		expect(view.active.value).toBe(false);
		view.inheritedPageActive.value = true;
		expect(view.active.value).toBe(true);
		view.pageActive.value = false;
		expect(view.active.value).toBe(false);
		view.inheritedPageActive.value = false;
		view.pageActive.value = true;
		expect(view.active.value).toBe(false);
	});

	test('pauses on document hiding and follows a reused component root', async () => {
		const oldElement = window.document.createElement('div');
		const newElement = window.document.createElement('div');
		const root = shallowRef<HTMLElement | null>(oldElement);
		const view = mountVisibility(root);
		observers[0].setVisible(oldElement, true);
		documentVisibility = 'hidden';
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(view.active.value).toBe(false);
		documentVisibility = 'visible';
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(view.active.value).toBe(true);
		root.value = newElement;
		await nextTick();
		expect(view.active.value).toBe(false);
		expect(observers[0].unobserve).toHaveBeenCalledWith(oldElement);
		observers.at(-1)!.setVisible(newElement, true);
		expect(view.active.value).toBe(true);
		root.value = null;
		await nextTick();
		expect(view.active.value).toBe(false);
	});

	test('pauses cached components when KeepAlive deactivates and resumes on activation', async () => {
		const showing = ref(true);
		let active!: Readonly<Ref<boolean>>;
		const child = defineComponent({
			setup() {
				active = useUserStatisticsVisibility();
				return () => h('div');
			},
		});
		render(defineComponent({ setup: () => () => h(KeepAlive, null, { default: () => showing.value ? h(child) : h('span') }) }));
		expect(active.value).toBe(true);
		showing.value = false;
		await nextTick();
		expect(active.value).toBe(false);
		showing.value = true;
		await nextTick();
		expect(active.value).toBe(true);
	});

	test('falls back to document and page activity when IntersectionObserver is unavailable', () => {
		vi.stubGlobal('IntersectionObserver', undefined);
		const view = mountVisibility(shallowRef(window.document.createElement('div')));
		expect(view.active.value).toBe(true);
		view.inheritedPageActive.value = false;
		expect(view.active.value).toBe(false);
	});
});
