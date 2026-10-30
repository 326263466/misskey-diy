<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button v-if="floating" type="button" class="_button _shadow" :class="$style.floatingButton" :aria-label="i18n.ts._article.tableOfContents" aria-haspopup="menu" :aria-expanded="menuOpen" @click="showFloatingContents"><i class="ti ti-list-details" aria-hidden="true"></i></button>
<section v-else class="_panel" :class="[$style.root, { [$style.compact]: compact, [$style.expanded]: expanded }]">
	<button type="button" class="_button" :class="$style.summary" :aria-expanded="expanded" :aria-controls="contentsId" @click="expanded = !expanded">
		<span :class="$style.title">{{ i18n.ts._article.tableOfContents }}</span>
		<i class="ti ti-chevron-down" :class="$style.chevron" aria-hidden="true"></i>
	</button>
	<div :id="contentsId" :class="$style.collapse" :inert="!expanded">
		<div :class="$style.collapseInner">
			<nav ref="contentsEl" :aria-label="i18n.ts._article.tableOfContents" :class="$style.contents">
				<div :class="$style.track">
					<ol :class="$style.list">
						<li v-for="heading in headings" :key="heading.id">
							<a
								:ref="el => setLinkEl(heading.id, el)"
								:href="`#${encodeURIComponent(heading.id)}`"
								:class="[$style.link, { [$style.active]: activeId === heading.id, [$style.sub]: heading.level > firstLevel }]"
								:style="{
									'--toc-selection-start': `${TEXT_INSET + (heading.level - firstLevel) * INDENT - SELECTION_INSET}px`,
									paddingInlineStart: `${TEXT_INSET + (heading.level - firstLevel) * INDENT}px`,
								}"
								:aria-current="activeId === heading.id ? 'location' : undefined"
								@click.prevent="scrollToHeading(heading.id)"
							><span>{{ heading.text }}</span></a>
						</li>
					</ol>
				</div>
			</nav>
		</div>
	</div>
</section>
</template>

<script lang="ts" setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import type { MarkdownHeading } from '@/components/MkMarkdown.vue';
import { getScrollContainer, getStickyTop } from '@@/js/scroll.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{ headings: MarkdownHeading[]; previewId: string; compact: boolean; floating?: boolean }>(), { floating: false });
const contentsId = useId();
const expanded = ref(!props.compact);
const menuOpen = ref(false);
const activeId = ref<string | undefined>(props.headings[0]?.id);
const firstLevel = computed(() => Math.min(...props.headings.map(heading => heading.level)));
const contentsEl = useTemplateRef('contentsEl');
const linkEls = new Map<string, HTMLElement>();
const pageActive = inject(DI.pageActive, ref(true));
let unmounted = false;

// 子标题仅保留缩进层级，不再绘制左侧连接线。
const TEXT_INSET = 14;
const INDENT = 14;
// 选中底色向左多出的距离，用来放定位标记。
const SELECTION_INSET = 14;
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
	const contents = contentsEl.value;
	if (!link || !contents || contents.scrollHeight <= contents.clientHeight) return;
	// 用户正在浏览目录时只更新高亮，不把手动滚动拉回正文当前位置。
	if (contents.matches(':hover, :focus-within')) return;
	// 只滚动目录自身，不能用 scrollIntoView 带动页面滚动。
	const top = link.offsetTop;
	const bottom = top + link.offsetHeight;
	if (top < contents.scrollTop + 8) contents.scrollTo({ top: Math.max(0, top - 8), behavior: 'instant' });
	else if (bottom > contents.scrollTop + contents.clientHeight - 8) contents.scrollTo({ top: bottom - contents.clientHeight + 8, behavior: 'instant' });
}

watch([activeId, expanded, () => props.headings], () => { void nextTick(syncActiveLink); }, { flush: 'post', immediate: true });

async function showFloatingContents(event: PointerEvent) {
	if (menuOpen.value || props.headings.length === 0) return;
	const previewId = props.previewId;
	let selectedHeading: string | undefined;
	menuOpen.value = true;
	try {
		await os.popupMenu(props.headings.map(heading => ({
			text: heading.text,
			active: heading.id === activeId.value,
			actionOnActive: true,
			action: () => { selectedHeading = heading.id; },
		})), event.currentTarget);
		// 菜单关闭并恢复焦点之后再定位，避免抢回正文标题的焦点。
		if (!unmounted && pageActive.value && props.previewId === previewId && selectedHeading && props.headings.some(heading => heading.id === selectedHeading)) scrollToHeading(selectedHeading);
	} finally {
		menuOpen.value = false;
	}
}

function scrollToHeading(id: string) {
	const preview = window.document.getElementById(props.previewId);
	const heading = window.document.getElementById(id);
	if (!preview || !heading || !preview.contains(heading)) return;
	const container = getScrollContainer(preview);
	const top = heading.getBoundingClientRect().top - (container?.getBoundingClientRect().top ?? 0)
		+ (container?.scrollTop ?? window.scrollY) - getStickyTop(preview, container) - 16;
	const smooth = animated();
	lockedUntil = Date.now() + (smooth ? 800 : 100);
	heading.setAttribute('tabindex', '-1');
	heading.focus({ preventScroll: true });
	(container ?? window).scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' });
	activeId.value = id;
}

onBeforeUnmount(() => { unmounted = true; });

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

.floatingButton {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 44px;
	height: 44px;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 18px;
	pointer-events: auto;

	&:hover { color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}

.root {
	--MI-articleTocMaxHeight: min(60dvh, 480px);
	min-width: 0;
	overflow: hidden;
}
.compact { background: var(--MI_THEME-bg); }

.summary {
	@include card-header.row;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--MI-marginHalf);
	width: 100%;
	box-sizing: border-box;
	padding-inline: var(--MI-cardPadding);
	text-align: start;

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.title {
	@include card-header.label;
}

.chevron {
	width: 16px;
	height: 16px;

	&::before {
		transform: rotate(0deg);
		transition: transform .2s ease;
	}
}

.expanded .chevron::before { transform: rotate(180deg); }

// 用网格行高过渡实现展开收起动画，内容高度无需写死。
.collapse {
	display: grid;
	grid-template-rows: 0fr;
	transition: grid-template-rows .2s ease;
}

.expanded > .collapse { grid-template-rows: 1fr; }

.collapseInner {
	min-height: 0;
	// 动画只裁切外层，避免滚动区在展开途中被压低而误显示滚动条。
	overflow: hidden;
}

.contents {
	max-height: var(--MI-articleTocMaxHeight);
	overflow-y: auto;
	// 目录到达边界后继续滚动同列侧栏，列间隔离由外层滚动容器负责。
	overscroll-behavior: auto;
	scrollbar-gutter: stable;
	padding: 0 var(--MI-cardPadding);
}

// 底部间距放在滚动内容里，收起时随内容一起隐藏。
.track {
	margin-bottom: var(--MI-marginHalf);
}

.list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.link {
	position: relative;
	isolation: isolate;
	display: block;
	padding-block: 6px;
	padding-inline-end: 4px;
	color: var(--MI_THEME-fg);
	line-height: 1.5;
	overflow-wrap: anywhere;
	transition: color .15s ease;

	// 当前项从层级缩进处开始，向右铺满可用宽度。
	&:hover, &.active { text-decoration: none; color: var(--MI_THEME-accent); }
	&::before, &::after {
		content: '';
		position: absolute;
		z-index: -1;
		opacity: 0;
		transition: opacity .15s ease, transform .2s ease;
	}
	&::before {
		inset-block: 3px;
		inset-inline-start: var(--toc-selection-start);
		inset-inline-end: 0;
		border-radius: 8px;
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}
	&::after {
		inset-block: 0;
		inset-inline-start: calc(var(--toc-selection-start) + 5px);
		width: 3px;
		height: 14px;
		margin-block: auto;
		border-radius: 999px;
		background: var(--MI_THEME-accent);
		transform: scaleY(0.3);
	}
	&:hover:not(.active)::before { opacity: 1; background: color-mix(in srgb, var(--MI_THEME-fg) 5%, transparent); }
	&.active::before, &.active::after { opacity: 1; }
	&.active::after { transform: scaleY(1); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; border-radius: var(--MI-radius); }
}

.sub:not(:hover, .active) { color: var(--MI_THEME-fgTransparentWeak); }

@media (prefers-reduced-motion: reduce) {
	.chevron::before, .collapse, .link, .link::before, .link::after { transition: none; }
}
</style>
