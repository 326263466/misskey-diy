/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, render } from '@testing-library/vue';
import { defineComponent, nextTick, ref } from 'vue';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useNoteCaptureVisibility } from '@/composables/use-note-capture.js';

describe('useNoteCaptureVisibility', () => {
	afterEach(() => {
		cleanup();
	});

	test('tracks the viewport and document visibility', async () => {
		const observerState: {
			callback: IntersectionObserverCallback | null;
			options: IntersectionObserverInit | undefined;
			instance: IntersectionObserver | null;
			observedElement: Element | null;
		} = {
			callback: null,
			options: undefined,
			instance: null,
			observedElement: null,
		};
		const unobserve = vi.fn();
		let documentVisibility: DocumentVisibilityState = 'visible';

		class IntersectionObserverMock {
			readonly root = null;
			readonly rootMargin = '';
			readonly scrollMargin = '';
			readonly thresholds = [0];
			readonly observe = vi.fn((element: Element) => {
				observerState.observedElement = element;
			});
			readonly unobserve = unobserve;
			readonly disconnect = vi.fn();
			readonly takeRecords = vi.fn(() => []);

			constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
				observerState.callback = callback;
				observerState.options = options;
				observerState.instance = this as unknown as IntersectionObserver;
			}
		}

		vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
		Object.defineProperty(window.document, 'visibilityState', {
			configurable: true,
			get: () => documentVisibility,
		});

		const component = defineComponent({
			setup() {
				const rootEl = ref<HTMLElement | null>(null);
				const active = useNoteCaptureVisibility(rootEl);
				return { rootEl, active };
			},
			template: '<div ref="rootEl" :data-active="active ? \'true\' : \'false\'"></div>',
		});
		const view = render(component);
		await nextTick();

		expect(observerState.options?.rootMargin).toBe('200% 0px');
		expect(observerState.observedElement).not.toBeNull();
		expect(view.container.firstElementChild?.getAttribute('data-active')).toBe('false');

		observerState.callback!([{ target: observerState.observedElement!, isIntersecting: true } as IntersectionObserverEntry], observerState.instance!);
		await nextTick();
		expect(view.container.firstElementChild?.getAttribute('data-active')).toBe('true');

		documentVisibility = 'hidden';
		window.document.dispatchEvent(new Event('visibilitychange'));
		await nextTick();
		expect(view.container.firstElementChild?.getAttribute('data-active')).toBe('false');

		documentVisibility = 'visible';
		window.document.dispatchEvent(new Event('visibilitychange'));
		await nextTick();
		expect(view.container.firstElementChild?.getAttribute('data-active')).toBe('true');

		observerState.callback!([{ target: observerState.observedElement!, isIntersecting: false } as IntersectionObserverEntry], observerState.instance!);
		await nextTick();
		expect(view.container.firstElementChild?.getAttribute('data-active')).toBe('false');

		view.unmount();
		expect(unobserve).toHaveBeenCalledWith(observerState.observedElement);
	});
});
