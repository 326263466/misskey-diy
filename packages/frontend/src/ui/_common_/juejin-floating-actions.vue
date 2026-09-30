<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<button v-if="showBackToTop" v-tooltip.left="i18n.ts.backToTop" type="button" class="_button" :class="$style.action" :aria-label="i18n.ts.backToTop" @click="backToTop">
		<i class="ti ti-arrow-bar-to-up" aria-hidden="true"></i>
	</button>
	<MkA v-tooltip.left="i18n.ts.feedback" to="/feedback" class="_button" :class="[$style.action, $style.feedback]" :aria-label="i18n.ts.feedback">
		<i class="ti ti-message-report" aria-hidden="true"></i>
	</MkA>
	<button v-tooltip.left="i18n.ts.more" type="button" class="_button" :class="$style.action" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="openInstanceMenu">
		<i class="ti ti-dots" aria-hidden="true"></i>
	</button>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { getScrollContainer } from '@@/js/scroll.js';
import { openInstanceMenu } from './common.js';
import { i18n } from '@/i18n.js';
import { mainRouter } from '@/router.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	content: HTMLElement | null;
}>();

const showBackToTop = ref(false);
const scrollThreshold = 300;
let scrollFrame: number | null = null;

function cancelScroll() {
	if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
	scrollFrame = null;
}

function isCurrentPage(element: HTMLElement, content: HTMLElement): boolean {
	let page = element.closest<HTMLElement>('[data-page-path]');
	while (page && content.contains(page)) {
		const stack = page.parentElement?.closest<HTMLElement>('[data-current-page]');
		if (stack && page.dataset.pagePath !== stack.dataset.currentPage) return false;
		page = stack?.parentElement?.closest<HTMLElement>('[data-page-path]') ?? null;
	}
	return true;
}

function getPageScrollContainer(): HTMLElement | null {
	const content = props.content;
	if (!content) return null;

	// PageWithHeader may delegate scrolling to a surrounding wide-page layout.
	// A narrow settings/admin index has only its navigation as page content.
	// In wide layouts, keep ignoring the independently scrollable side navigation.
	const candidates = content.querySelectorAll<HTMLElement>('[data-page-body], ._pageScrollable, ._pageScrollableReversed, ._pageLayoutWithSidebar, ._pageContainer, ._pageLayout:not(:has(> ._pageContent)) > ._pageNavigation');
	for (const candidate of candidates) {
		if (!isCurrentPage(candidate, content) || candidate.getClientRects().length === 0) continue;
		const container = getScrollContainer(candidate);
		if (container && content.contains(container) && container.scrollHeight > container.clientHeight) return container;
	}
	return null;
}

function getTop(container: HTMLElement): number {
	return window.getComputedStyle(container).flexDirection === 'column-reverse'
		? container.clientHeight - container.scrollHeight
		: 0;
}

function updateVisibility() {
	const container = getPageScrollContainer();
	showBackToTop.value = container !== null && container.scrollTop - getTop(container) > scrollThreshold;
}

function backToTop() {
	cancelScroll();
	const container = getPageScrollContainer();
	if (!container) return;
	const top = getTop(container);
	if (!prefer.s.animation) {
		container.scrollTo({ top, behavior: 'instant' });
		return;
	}

	const startTop = container.scrollTop;
	const path = mainRouter.getCurrentFullPath();
	const duration = 450;
	let elapsed = 0;
	let previousFrameTime: number | null = null;
	const step = (now: number) => {
		// Stop when navigation replaces the active page, including retained tabs.
		const content = props.content;
		if (mainRouter.getCurrentFullPath() !== path || !content?.contains(container) || !isCurrentPage(container, content)) {
			cancelScroll();
			return;
		}
		// Start with the first painted frame. Rendering a long timeline must not
		// consume the animation before it starts, or skip it after one slow frame.
		if (previousFrameTime !== null) elapsed += Math.min(Math.max(now - previousFrameTime, 0), 50);
		previousFrameTime = now;
		const progress = Math.min(elapsed / duration, 1);
		const eased = 1 - (1 - progress) ** 3;
		container.scrollTo({ top: startTop + (top - startTop) * eased, behavior: 'instant' });
		scrollFrame = progress < 1 ? requestAnimationFrame(step) : null;
	};
	scrollFrame = requestAnimationFrame(step);
}

watch(() => props.content, (content, _, onCleanup) => {
	showBackToTop.value = false;
	if (!content) return;

	let frame: number | null = null;
	const scheduleUpdate = () => {
		if (frame !== null) return;
		frame = requestAnimationFrame(() => {
			frame = null;
			updateVisibility();
		});
	};
	// Capture also sees scroll restoration after KeepAlive activation.
	content.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true });
	const interruptEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
	for (const event of interruptEvents) content.addEventListener(event, cancelScroll, { capture: true, passive: true });
	const mutations = new MutationObserver(scheduleUpdate);
	mutations.observe(content, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['data-current-page', 'data-page-path', 'class', 'style'],
	});
	const resize = new ResizeObserver(scheduleUpdate);
	resize.observe(content);
	window.addEventListener('resize', scheduleUpdate, { passive: true });
	scheduleUpdate();

	onCleanup(() => {
		cancelScroll();
		content.removeEventListener('scroll', scheduleUpdate, true);
		for (const event of interruptEvents) content.removeEventListener(event, cancelScroll, true);
		window.removeEventListener('resize', scheduleUpdate);
		mutations.disconnect();
		resize.disconnect();
		if (frame !== null) cancelAnimationFrame(frame);
	});
}, { immediate: true, flush: 'post' });
</script>

<style lang="scss" module>
.root {
	position: fixed;
	right: max(24px, env(safe-area-inset-right, 0px));
	bottom: max(24px, env(safe-area-inset-bottom, 0px));
	z-index: 100;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.action {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	box-sizing: border-box;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fgTransparentWeak);
	box-shadow: 0 2px 8px var(--MI_THEME-shadow);
	font-size: 16px;
	text-decoration: none;

	&:hover {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-panelHighlight);
		text-decoration: none;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 3px;
	}
}

.feedback {
	color: var(--MI_THEME-accent);
}
</style>
