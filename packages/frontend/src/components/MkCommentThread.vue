<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="[$style.thread, { [$style.nested]: nested }]">
	<slot :start="start" :end="end"></slot>
	<div v-if="!nested" :class="$style.replies" :aria-busy="busy">
		<slot name="replies" :start="start" :end="end"></slot>
		<!-- 先预览 3 条，展开后每页 5 条，用页码翻页。 -->
		<button v-if="!expanded && previewLoaded && !busy && !error && canNext" type="button" class="_button" :class="[$style.replyStatus, $style.viewReplies]" @click="expand">{{ i18n.tsx._comment.viewReplies({ n: Math.max(replyCount, loadedCount).toLocaleString() }) }}</button>
		<div v-if="expanded" :class="[$style.replyStatus, $style.pager]">
			<MkPaginationBar v-model:page="page" :items="loadedIndexes" :pageSize="PAGE_SIZE" :hasMore="canLoadReplies" :loadMore="loadNext" simple align="start" @update:page="onPageChange"/>
			<button type="button" class="_button" :class="$style.collapse" @click="collapse">{{ i18n.ts._comment.collapseReplies }}</button>
		</div>
		<MkButton v-if="error" small :class="$style.replyStatus" @click="retry">{{ i18n.ts.retry }}</MkButton>
	</div>
</div>
</template>

<script lang="ts">
export const COMMENT_REPLY_PREVIEW_SIZE = 3;
</script>

<script lang="ts" setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { getScrollContainer, getStickyTop } from '@@/js/scroll.js';
import MkButton from '@/components/MkButton.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	nested?: boolean;
	replyCount?: number;
	loadedCount?: number;
	hasMore?: boolean;
	loading?: boolean;
	error?: boolean;
	active?: boolean;
	loadReplies?: (limit: number) => Promise<void>;
}>(), {
	active: true,
	replyCount: 0,
	loadedCount: 0,
	hasMore: undefined,
});

const PAGE_SIZE = 5;
const rootEl = useTemplateRef('rootEl');
const requesting = ref(false);
const previewLoaded = ref(false);
const expanded = ref(false);
const page = ref(1);
const busy = computed(() => requesting.value || props.loading);
const start = computed(() => expanded.value ? (page.value - 1) * PAGE_SIZE : 0);
const end = computed(() => expanded.value ? page.value * PAGE_SIZE : COMMENT_REPLY_PREVIEW_SIZE);
// 分页组件只需要条数，用下标代替回复本身。
const loadedIndexes = computed(() => Array.from({ length: props.loadedCount }, (_, i) => i));
// 可见回复数可能少于总数，接口已到末页时不能继续按旧计数加载。
const canLoadReplies = computed(() => props.hasMore ?? props.replyCount > props.loadedCount);
const canNext = computed(() => canLoadReplies.value || props.loadedCount > COMMENT_REPLY_PREVIEW_SIZE);

// 在当前页的线程挂载时准备预览，不等滚动到回复位置后再插入加载占位。
watch([() => props.active, () => props.nested, canNext, busy], () => {
	if (!props.nested && !props.error) void loadPreview();
}, { immediate: true });

async function loadPreview(): Promise<void> {
	if (previewLoaded.value || !props.active || busy.value || !canNext.value) return;
	if (props.loadedCount > COMMENT_REPLY_PREVIEW_SIZE || !canLoadReplies.value) {
		previewLoaded.value = true;
		return;
	}
	requesting.value = true;
	try {
		// 多取一条用于判断是否还有第四条回复，界面仍只展开三条。
		await props.loadReplies?.(COMMENT_REPLY_PREVIEW_SIZE + 1);
		if (!props.error) previewLoaded.value = true;
	} finally {
		requesting.value = false;
	}
}

// 分页组件翻到未加载的页时调用，返回是否加载到新回复。
async function loadNext(): Promise<boolean> {
	if (!props.active || props.loading || props.loadReplies == null) return false;
	const before = props.loadedCount;
	await props.loadReplies(PAGE_SIZE);
	// 等父组件把新回复传进来再比较条数。
	await nextTick();
	return !props.error && props.loadedCount > before;
}

function expand(): void {
	page.value = 1;
	expanded.value = true;
}

async function collapse(): Promise<void> {
	expanded.value = false;
	page.value = 1;
	await nextTick();
	scrollToThread();
}

// 收起或翻页后内容高度变化，父评论已滚出视口时回到父评论。
function scrollToThread(): void {
	const el = rootEl.value;
	if (!el) return;
	const container = getScrollContainer(el);
	const offset = el.getBoundingClientRect().top - (container?.getBoundingClientRect().top ?? 0) - getStickyTop(el, container);
	if (offset < 0) (container ?? window).scrollTo({ top: offset + (container?.scrollTop ?? window.scrollY) - 16, behavior: 'instant' });
}

function onPageChange(): void {
	void nextTick(scrollToThread);
}

async function retry(): Promise<void> {
	if (expanded.value || previewLoaded.value || props.loadedCount > COMMENT_REPLY_PREVIEW_SIZE) await loadNext();
	else await loadPreview();
}

function revealReply(index: number): void {
	if (index < 0 || (!expanded.value && index < COMMENT_REPLY_PREVIEW_SIZE)) return;
	previewLoaded.value = true;
	expanded.value = true;
	page.value = Math.floor(index / PAGE_SIZE) + 1;
}

defineExpose({ revealReply });

defineSlots<{
	default?: (props: { start: number; end: number }) => unknown;
	replies?: (props: { start: number; end: number }) => unknown;
}>();
</script>

<style lang="scss" module>
.thread {
	--MI-commentAvatarSize: 36px;
	--MI-commentColumnGap: 12px;
	--MI-commentGap: 16px;
	display: grid;
	grid-template-columns: var(--MI-commentAvatarSize) minmax(0, 1fr);
	column-gap: var(--MI-commentColumnGap);
	border-top: var(--MI-divider);
}
// 父评论正文和回复区共用第二列，回复加载和头像淡入都不参与缩进计算。
.replies { grid-column: 2; display: flex; flex-direction: column; min-width: 0; }
.nested { display: contents; }
.replyStatus { margin-top: 8px; }
.viewReplies { align-self: flex-start; color: var(--MI_THEME-fgTransparentWeak); font-size: .95em; }
.viewReplies:hover { color: var(--MI_THEME-accent); }
.viewReplies:focus-visible, .collapse:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
.pager { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
.collapse { color: var(--MI_THEME-fgTransparentWeak); font-size: .95em; }
.collapse:hover { color: var(--MI_THEME-accent); }
</style>
