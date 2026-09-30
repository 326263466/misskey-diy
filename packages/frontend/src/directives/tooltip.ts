/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// TODO: useTooltip関数使うようにしたい
// ただディレクティブ内でonUnmountedなどのcomposition api使えるのか不明

import { defineAsyncComponent, ref } from 'vue';
import type { Directive } from 'vue';
import { isTouchUsing } from '@/utility/touch.js';
import { popup, alert } from '@/os.js';

const start = isTouchUsing ? 'touchstart' : 'mouseenter';
const end = isTouchUsing ? 'touchend' : 'mouseleave';

const SHOW_DELAY = 600;

type TooltipDirectiveState = {
	text: string | null | undefined;
	_close: null | (() => void);
	show: () => void;
	close: () => void;

	abortController: AbortController;
	dismissController: AbortController | null;
	showTimer: number | null;
};

const states = new WeakMap<HTMLElement, TooltipDirectiveState>();

type TooltipDirectiveModifiers = 'left' | 'right' | 'top' | 'bottom' | 'mfm' | 'noDelay' | 'icon';
type TooltipDirectiveArg = 'dialog';

export const tooltipDirective = {
	mounted(el, binding) {
		const delay = binding.modifiers.noDelay ? 0 : SHOW_DELAY;

		const state = {
			text: binding.value,
			_close: null,
			abortController: new AbortController(),
			dismissController: null,
			showTimer: null,
		} as TooltipDirectiveState;

		state.close = () => {
			if (state.showTimer != null) window.clearTimeout(state.showTimer);
			state.showTimer = null;
			state.dismissController?.abort();
			state.dismissController = null;
			if (state._close) {
				state._close();
				state._close = null;
			}
		};

		if (binding.arg === 'dialog') {
			el.addEventListener('click', (ev) => {
				const text = state.text ?? undefined;
				if (!text) return;
				ev.preventDefault();
				ev.stopPropagation();
				alert({
					type: 'info',
					text,
				});
				return false;
			}, { signal: state.abortController.signal });
		}

		state.show = () => {
			state.showTimer = null;
			if (!window.document.body.contains(el)) return;
			if (state._close) return;
			if (!state.text) return;

			const icon = binding.modifiers.icon ? el.querySelector<HTMLElement>(':scope > i') : null;
			const anchorElement = icon ?? el;
			const showing = ref(true);
			const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkTooltip.vue')), {
				showing,
				text: state.text,
				asMfm: binding.modifiers.mfm,
				direction: binding.modifiers.left ? 'left' : binding.modifiers.right ? 'right' : binding.modifiers.top ? 'top' : 'bottom',
				anchorElement,
			}, {
				closed: () => dispose(),
			});

			state._close = () => {
				showing.value = false;
			};
		};

		el.addEventListener('selectstart', (ev) => {
			if (!state.text) return;
			ev.preventDefault();
		}, { signal: state.abortController.signal });

		const schedule = (wait: number) => {
			if (state.showTimer != null) window.clearTimeout(state.showTimer);
			state.showTimer = null;
			if (state._close) return;
			if (!state.text) return;
			state.dismissController?.abort();
			state.dismissController = new AbortController();
			const { signal } = state.dismissController;
			window.addEventListener('scroll', state.close, { passive: true, capture: true, signal });
			window.addEventListener('blur', state.close, { signal });
			window.document.addEventListener('keydown', (event) => {
				if (event.key === 'Escape') state.close();
			}, { signal });
			if (wait === 0) {
				state.show();
			} else {
				state.showTimer = window.setTimeout(state.show, wait);
			}
		};

		el.addEventListener(start, () => schedule(delay), { passive: true, signal: state.abortController.signal });
		el.addEventListener('focusin', () => {
			if (el.matches(':focus-visible')) schedule(0);
		}, { passive: true, signal: state.abortController.signal });
		for (const event of [end, 'touchcancel', 'focusout', 'click']) {
			el.addEventListener(event, state.close, { passive: true, signal: state.abortController.signal });
		}

		states.set(el, state);
	},

	updated(el, binding) {
		const state = states.get(el);
		if (!state) return;
		state.text = binding.value;
		if (!state.text) {
			state.close();
		}
	},

	beforeUnmount(el) {
		const state = states.get(el);
		if (!state) return;

		state.close();
		state.abortController.abort();

		states.delete(el);
	},
} as Directive<HTMLElement, string | null | undefined, TooltipDirectiveModifiers, TooltipDirectiveArg>;
