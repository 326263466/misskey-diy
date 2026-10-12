/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkReactionEffect from '@/components/MkReactionEffect.vue';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { normalizeReaction } from '@/utility/normalize-reaction.js';

function canAnimate(element: HTMLElement | null | undefined): element is HTMLElement {
	return element?.isConnected === true && prefer.s.animation && !window.document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function playReactionEffect(reaction: string, element: HTMLElement | null | undefined): void {
	if (!canAnimate(element)) return;
	const rect = element.getBoundingClientRect();
	const { dispose } = os.popup(MkReactionEffect, {
		reaction: normalizeReaction(reaction),
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2,
	}, { end: () => dispose() });
}

export function animateReactionRemoval(element: HTMLElement | null | undefined): Animation | undefined {
	if (!canAnimate(element) || !element.animate) return;
	return element.animate([
		{ opacity: 1, transform: 'scale(1)' },
		{ opacity: 0, transform: 'scale(0.6)' },
	], { duration: 160, easing: 'cubic-bezier(.3, 0, .7, 1)', fill: 'forwards' });
}
