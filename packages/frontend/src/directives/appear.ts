/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { throttle } from 'throttle-debounce';
import type { Directive } from 'vue';
import type { Awaitable } from '@/types/misc.js';

const cleanups = new WeakMap<HTMLElement, () => void>();

export const appearDirective = {
	mounted(src, binding) {
		const fn = binding.value;
		if (fn == null) return;

		const check = throttle<IntersectionObserverCallback>(500, (entries) => {
			if (entries.at(-1)?.isIntersecting) {
				fn();
			}
		});

		const observer = new IntersectionObserver(check);
		observer.observe(src);

		cleanups.set(src, () => {
			check.cancel();
			observer.disconnect();
		});
	},

	beforeUnmount(src) {
		cleanups.get(src)?.();
		cleanups.delete(src);
	},
} as Directive<HTMLElement, (() => Awaitable<void>) | null | undefined>;
