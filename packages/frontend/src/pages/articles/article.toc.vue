<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section class="_panel" :class="[$style.root, { [$style.compact]: compact, [$style.expanded]: expanded }]">
	<button type="button" class="_button" :class="$style.summary" :aria-expanded="expanded" :aria-controls="contentsId" @click="expanded = !expanded">
		<span>{{ i18n.ts._article.tableOfContents }}</span>
		<i class="ti ti-chevron-down" :class="$style.chevron" aria-hidden="true"></i>
	</button>
	<div :id="contentsId" :class="$style.collapse" :inert="!expanded">
		<nav ref="contentsEl" :aria-label="i18n.ts._article.tableOfContents" :class="$style.contents">
			<div :class="$style.track">
				<span v-if="indicator" :class="$style.indicator" :style="{ transform: `translateY(${indicator.top}px)`, height: `${indicator.height}px` }" aria-hidden="true"></span>
				<ol :class="$style.list">
					<li v-for="heading in headings" :key="heading.id">
						<a
							:ref="el => setLinkEl(heading.id, el)"
							:href="`#${encodeURIComponent(heading.id)}`"
							:class="[$style.link, { [$style.active]: activeId === heading.id, [$style.sub]: heading.level > firstLevel }]"
							:style="{ paddingInlineStart: `${14 + (heading.level - firstLevel) * 14}px` }"
							:aria-current="activeId === heading.id ? 'location' : undefined"
							@click.prevent="scrollToHeading(heading.id)"
						>{{ heading.text }}</a>
					</li>
				</ol>
			</div>
		</nav>
	</div>
</section>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import type { MarkdownHeading } from '@/components/MkMarkdown.vue';
import { getScrollContainer, getStickyTop } from '@@/js/scroll.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{ headings: MarkdownHeading[]; previewId: string; compact: boolean }>();
const contentsId = useId();
const expanded = ref(!props.compact);
const activeId = ref<string | undefined>(props.headings[0]?.id);
const firstLevel = computed(() => Math.min(...props.headings.map(heading => heading.level)));
const contentsEl = useTemplateRef('contentsEl');
const linkEls = new Map<string, HTMLElement>();
const indicator = ref<{ top: number; height: number } | null>(null);
// 点击跳转的平滑滚动期间暂停滚动监听，避免高亮在途经标题间来回跳动。
let lockedUntil = 0;

watch(() => props.compact, compact => { expanded.value = !compact; });

function setLinkEl(id: string, el: Element | ComponentPublicInstance | null) {
	if (el instanceof HTMLElement) linkEls.set(id, el);
	else linkEls.delete(id);
}

function animated() {
	return prefer.s.animation && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function syncActiveLink() {
	const link = activeId.value ? linkEls.get(activeId.value) : undefined;
	indicator.value = link ? { top: link.offsetTop, height: link.offsetHeight } : null;
	const contents = contentsEl.value;
	if (!link || !contents || contents.scrollHeight <= contents.clientHeight) return;
	// 只滚动目录自身，不能用 scrollIntoView 带动页面滚动。
	const top = link.offsetTop;
	const bottom = top + link.offsetHeight;
	if (top < contents.scrollTop + 8) contents.scrollTo({ top: Math.max(0, top - 8), behavior: animated() ? 'smooth' : 'instant' });
	else if (bottom > contents.scrollTop + contents.clientHeight - 8) contents.scrollTo({ top: bottom - contents.clientHeight + 8, behavior: animated() ? 'smooth' : 'instant' });
}

watch([activeId, expanded, () => props.headings], () => { void nextTick(syncActiveLink); }, { flush: 'post', immediate: true });

function scrollToHeading(id: string) {
	const preview = window.document.getElementById(props.previewId);
	const heading = window.document.getElementById(id);
	if (!preview || !heading || !preview.contains(heading)) return;
	const container = getScrollContainer(preview);
	const top = heading.getBoundingClientRect().top - (container?.getBoundingClientRect().top ?? 0)
		+ (container?.scrollTop ?? window.scrollY) - getStickyTop(preview, container) - 16;
	const smooth = animated();
	lockedUntil = Date.now() + (smooth ? 800 : 100);
	(container ?? window).scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' });
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
		if (Date.now() < lockedUntil) return;
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
	const observer = new ResizeObserver(() => { scheduleUpdate(); syncActiveLink(); });
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
	width: 100%;
	box-sizing: border-box;
	padding-inline: var(--MI-cardPadding);
	text-align: start;
	transition: color .15s ease;

	&:hover { color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.chevron {
	font-size: .9em;
	transition: transform .2s ease;
}

.expanded .chevron { transform: rotate(180deg); }

// 用网格行高过渡实现展开收起动画，内容高度无需写死。
.collapse {
	display: grid;
	grid-template-rows: 0fr;
	transition: grid-template-rows .2s ease;

	> .contents { min-height: 0; }
}

.expanded > .collapse { grid-template-rows: 1fr; }

.contents {
	max-height: min(60dvh, 640px);
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: thin;
	padding: 0 var(--MI-cardPadding);
}

// 底部间距放在滚动内容里，收起时随内容一起隐藏。
.track {
	position: relative;
	margin-bottom: var(--MI-marginHalf);
	border-inline-start: 2px solid var(--MI_THEME-divider);
}

.indicator {
	position: absolute;
	top: 0;
	inset-inline-start: -2px;
	width: 2px;
	border-radius: 2px;
	background: var(--MI_THEME-accent);
	transition: transform .2s ease, height .2s ease;
}

.list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.link {
	display: block;
	padding-block: 6px;
	padding-inline-end: 4px;
	color: var(--MI_THEME-fg);
	line-height: 1.5;
	overflow-wrap: anywhere;
	transition: color .15s ease;

	// 悬停与当前位置同一主题色，当前位置额外由左侧指示条和字重区分。
	&:hover, &.active { text-decoration: none; color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; border-radius: var(--MI-radius); }
}

.sub:not(:hover, .active) { color: var(--MI_THEME-fgTransparentWeak); }
.active { font-weight: 600; }

@media (prefers-reduced-motion: reduce) {
	.summary, .chevron, .collapse, .indicator, .link { transition: none; }
}
</style>
