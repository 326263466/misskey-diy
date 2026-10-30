<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section ref="rootEl" class="_panelPadding" :class="[$style.root, { _panel: panel }]" :style="docked ? { paddingBlockEnd: `calc(var(--MI-cardPadding) + ${composerHeight}px)` } : undefined" :aria-label="i18n.ts._article.comment">
	<h2 v-if="showHeading" :class="$style.heading">{{ i18n.ts._article.comment }} <span v-if="count != null">{{ count }}</span></h2>
	<Teleport :to="overlayHost ?? 'body'" :disabled="!docked" defer>
		<div ref="composerEl" :class="{ [$style.composerDock]: docked }" :style="docked ? dockStyle : undefined"><slot name="composer"></slot></div>
	</Teleport>
	<div v-if="$slots.actionError" role="alert" :class="$style.error"><slot name="actionError"></slot></div>
	<div v-show="showThreads" :class="$style.list">
		<!-- 父评论每页 10 条，用页码翻页，不随滚动无限加载。 -->
		<MkPaginationBar v-model:page="page" :items="items" :pageSize="COMMENT_PAGE_SIZE" :hasMore="hasMore && active" :loadMore="loadPage" :disabled="loading" simple align="start" @update:page="onPageChange">
			<template #default="{ items: pageItems }">
				<div v-if="pageItems.length > 0" ref="threadsEl" :class="$style.threads"><slot :items="pageItems"></slot></div>
			</template>
		</MkPaginationBar>
		<MkLoading v-if="loading && items.length === 0"/>
		<MkButton v-else-if="error" @click="loadPage">{{ i18n.ts.retry }}</MkButton>
		<MkCommentEmpty v-else-if="!hasMore && items.length === 0"/>
	</div>
</section>
</template>

<script lang="ts">
export const COMMENT_PAGE_SIZE = 10;
</script>

<script lang="ts" setup generic="T">
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue';
import { getScrollContainer, getStickyTop } from '@@/js/scroll.js';
import MkButton from '@/components/MkButton.vue';
import MkCommentEmpty from '@/components/MkCommentEmpty.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import { i18n } from '@/i18n.js';
import { DI } from '@/di.js';

const props = withDefaults(defineProps<{
	/** 已加载的全部父评论，按页切片显示。 */
	items: T[];
	/** 加载下一批父评论。 */
	loadMore: () => Promise<void>;
	count?: number;
	showHeading?: boolean;
	panel?: boolean;
	loading?: boolean;
	error?: boolean;
	hasMore?: boolean;
	active?: boolean;
	showThreads?: boolean;
	composerDocked?: boolean;
}>(), {
	showHeading: true,
	panel: true,
	active: true,
	showThreads: true,
});

const rootEl = useTemplateRef('rootEl');
const overlayHost = inject(DI.pageOverlayHost, ref(null));
const threadsEl = useTemplateRef('threadsEl');
const composerEl = useTemplateRef('composerEl');
const composerHeight = ref(0);
const docked = computed(() => props.composerDocked && props.active);
const dockStyle = ref<Record<string, string>>({});
const page = ref(1);

// 常驻输入框展开和收起时，列表末尾都保留实际高度，不遮住最后一条评论。
watch([composerEl, docked], ([element, enabled], _previous, onCleanup) => {
	composerHeight.value = 0;
	dockStyle.value = {};
	if (!element || !enabled) return;
	const viewport = window.visualViewport;
	let frame = 0;

	// 软键盘只缩小可视视口时，输入栏仍贴在键盘上方。
	function updatePosition() {
		frame = 0;
		const height = viewport?.height ?? window.innerHeight;
		dockStyle.value = {
			bottom: `${Math.max(0, window.innerHeight - (viewport?.offsetTop ?? 0) - height)}px`,
			'--MI-commentDockViewportHeight': `${height}px`,
		};
	}

	function schedulePosition() {
		if (!frame) frame = requestAnimationFrame(updatePosition);
	}

	const updateHeight = () => { composerHeight.value = element.offsetHeight; };
	const observer = new ResizeObserver(updateHeight);
	observer.observe(element);
	updatePosition();
	updateHeight();
	window.addEventListener('resize', schedulePosition, { passive: true });
	viewport?.addEventListener('resize', schedulePosition, { passive: true });
	viewport?.addEventListener('scroll', schedulePosition, { passive: true });
	onCleanup(() => {
		if (frame) cancelAnimationFrame(frame);
		observer.disconnect();
		window.removeEventListener('resize', schedulePosition);
		viewport?.removeEventListener('resize', schedulePosition);
		viewport?.removeEventListener('scroll', schedulePosition);
	});
}, { flush: 'post' });

// 分页组件翻到未加载的页时调用，返回是否加载到新评论。
async function loadPage(): Promise<boolean> {
	const before = props.items.length;
	await props.loadMore();
	await nextTick();
	return !props.error && props.items.length > before;
}

// 翻页后列表顶部已滚出视口时，回到列表顶部。
function onPageChange(): void {
	void nextTick(() => {
		const el = threadsEl.value;
		if (!el) return;
		const container = getScrollContainer(el);
		const offset = el.getBoundingClientRect().top - (container?.getBoundingClientRect().top ?? 0) - getStickyTop(el, container);
		if (offset < 0) (container ?? window).scrollTo({ top: offset + (container?.scrollTop ?? window.scrollY) - 16, behavior: 'instant' });
	});
}

/** 切到指定评论所在的页，用于发表评论和定位评论。 */
function revealItem(index: number): void {
	if (index >= 0) page.value = Math.floor(index / COMMENT_PAGE_SIZE) + 1;
}

defineExpose({ rootEl, revealItem });

defineSlots<{
	composer?: () => unknown;
	actionError?: () => unknown;
	default?: (props: { items: T[] }) => unknown;
}>();
</script>

<style lang="scss" module>
.root { display: flex; flex-direction: column; gap: var(--MI-margin); scroll-margin-top: calc(var(--MI-stickyTop, 0px) + 16px); }
.composerDock {
	--MI-commentDockMaxHeight: min(60dvh, 420px, calc(var(--MI-commentDockViewportHeight, 100dvh) - 16px));
	position: fixed;
	inset-inline: 0;
	bottom: 0;
	z-index: 20;
	pointer-events: auto;
	padding: 8px max(12px, env(safe-area-inset-right, 0px)) calc(8px + env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));
	box-sizing: border-box;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border-top: var(--MI-divider);
	> form {
		max-height: max(0px, calc(var(--MI-commentDockMaxHeight) - 16px - var(--MI-dividerWidth) - env(safe-area-inset-bottom, 0px)));
	}
}
.heading { margin: 0; font-size: 1.2em; }
.heading > span { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; font-weight: normal; }
.list { display: flex; flex-direction: column; gap: var(--MI-margin); }
// 线程之间不留间隙，由每条评论的内边距和分割线隔开。
.threads { display: flex; flex-direction: column; }
.error { color: var(--MI_THEME-error) !important; }
</style>
