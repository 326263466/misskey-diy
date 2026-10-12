<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<details :open="expanded" class="_panel" :class="[$style.root, { [$style.compact]: compact }]" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
	<summary :class="$style.summary"><span>{{ i18n.ts._article.tableOfContents }}</span><i class="ti ti-chevron-down" aria-hidden="true"></i></summary>
	<nav :aria-label="i18n.ts._article.tableOfContents" :class="$style.contents">
		<ol>
			<li v-for="heading in headings" :key="heading.id">
				<a :href="`#${encodeURIComponent(heading.id)}`" :class="[$style.link, { [$style.active]: activeId === heading.id }]" :style="{ paddingInlineStart: `${12 + (heading.level - firstLevel) * 12}px` }" :aria-current="activeId === heading.id ? 'location' : undefined" @click.prevent="scrollToHeading(heading.id)">{{ heading.text }}</a>
			</li>
		</ol>
	</nav>
</details>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue';
import type { MarkdownHeading } from '@/components/MkMarkdown.vue';
import { getScrollContainer, getStickyTop } from '@@/js/scroll.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{ headings: MarkdownHeading[]; previewId: string; compact: boolean }>();
const expanded = ref(!props.compact);
const activeId = ref<string | undefined>(props.headings[0]?.id);
const firstLevel = computed(() => Math.min(...props.headings.map(heading => heading.level)));

watch(() => props.compact, compact => { expanded.value = !compact; });

function scrollToHeading(id: string) {
	const preview = window.document.getElementById(props.previewId);
	const heading = window.document.getElementById(id);
	if (!preview || !heading || !preview.contains(heading)) return;
	const container = getScrollContainer(preview);
	const top = heading.getBoundingClientRect().top - (container?.getBoundingClientRect().top ?? 0)
		+ (container?.scrollTop ?? window.scrollY) - getStickyTop(preview, container) - 16;
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	(container ?? window).scrollTo({ top, behavior: prefer.s.animation && !reducedMotion ? 'smooth' : 'instant' });
	heading.setAttribute('tabindex', '-1');
	heading.focus({ preventScroll: true });
	activeId.value = id;
}

watch([() => props.headings, () => props.previewId], async (_value, _previous, onCleanup) => {
	let disposed = false;
	let frame = 0;
	let removeListeners = () => {};
	onCleanup(() => {
		disposed = true;
		cancelAnimationFrame(frame);
		removeListeners();
	});
	// 目录事件来自 Markdown 渲染，等本轮 DOM 更新后再读取标题位置。
	await nextTick();
	if (disposed) return;
	const preview = window.document.getElementById(props.previewId);
	if (!preview) return;
	const container = getScrollContainer(preview);
	const scrollTarget = container ?? window;
	const headings = props.headings.map(heading => window.document.getElementById(heading.id))
		.filter((heading): heading is HTMLElement => heading != null && preview.contains(heading));
	const updateActive = () => {
		frame = 0;
		const top = (container?.getBoundingClientRect().top ?? 0) + getStickyTop(preview, container) + 24;
		let current: HTMLElement | undefined = headings[0];
		for (const heading of headings) {
			if (heading.getBoundingClientRect().top > top) break;
			current = heading;
		}
		const scrollTop = container?.scrollTop ?? window.scrollY;
		const viewportHeight = container?.clientHeight ?? window.innerHeight;
		const scrollHeight = container?.scrollHeight ?? window.document.documentElement.scrollHeight;
		if (scrollTop > 0 && scrollTop + viewportHeight >= scrollHeight - 2) current = headings.at(-1);
		activeId.value = current?.id;
	};
	const scheduleUpdate = () => { if (!frame) frame = requestAnimationFrame(updateActive); };
	const observer = new ResizeObserver(scheduleUpdate);
	observer.observe(preview);
	scrollTarget.addEventListener('scroll', scheduleUpdate, { passive: true });
	window.addEventListener('resize', scheduleUpdate, { passive: true });
	removeListeners = () => {
		observer.disconnect();
		scrollTarget.removeEventListener('scroll', scheduleUpdate);
		window.removeEventListener('resize', scheduleUpdate);
	};
	updateActive();
}, { immediate: true, flush: 'post' });
</script>

<style lang="scss" module>
@use '@/styles/card-header.scss';

.root { min-width: 0; overflow: hidden; }
.compact { background: var(--MI_THEME-bg); }
.summary {
	@include card-header.title;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--MI-marginHalf);
	padding-inline: var(--MI-cardPadding);
	cursor: pointer;
	list-style: none;
	&::-webkit-details-marker { display: none; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}
.root[open] > .summary > i { transform: rotate(180deg); }
.contents {
	max-height: min(60dvh, 640px);
	overflow-y: auto;
	overscroll-behavior: contain;
	padding: 0 var(--MI-marginHalf) var(--MI-marginHalf);
	ol { margin: 0; padding: 0; list-style: none; }
}
.link {
	display: block;
	padding: 8px 12px;
	border-inline-start: 2px solid transparent;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .9em;
	line-height: 1.5;
	overflow-wrap: anywhere;
	&:hover { text-decoration: none; color: var(--MI_THEME-accent); background: var(--MI_THEME-buttonHoverBg); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}
.active { border-inline-start-color: var(--MI_THEME-accent); color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
</style>
