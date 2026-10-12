<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section ref="rootEl" :class="$style.root">
	<header :class="continuous ? 'title' : '_acrylic'">
		<template v-if="continuous"><slot></slot></template>
		<button v-else type="button" class="_button" :class="$style.toggle" :aria-expanded="shown" @click="shown = !shown">
			<i class="toggle ti-fw" :class="shown ? 'ti ti-chevron-down' : 'ti ti-chevron-up'" aria-hidden="true"></i> <slot></slot> ({{ emojis.length }})
		</button>
	</header>
	<div v-if="shown && emojis.length > 0" ref="bodyEl" class="body" :style="placeholderStyle" @focusin="updateFocusedEmoji" @focusout="onFocusOut">
		<button
			v-for="item in visibleEmojis"
			:key="item.emoji"
			v-tooltip.emoji="item.emoji"
			:data-emoji="item.emoji"
			class="_button item"
			:style="continuous ? { gridRowStart: Math.floor(item.index / columns) + 1, gridColumnStart: item.index % columns + 1 } : undefined"
			:disabled="disabledEmojis.includes(item.emoji) || (canReact && !canReact(item.emoji))"
			@click="emit('chosen', item.emoji, $event)"
		>
			<MkCustomEmoji v-if="item.emoji[0] === ':'" class="emoji" :name="item.emoji" :normal="true" :fallbackToImage="true"/>
			<MkEmoji v-else class="emoji" :emoji="item.emoji" :normal="true"/>
		</button>
	</div>
	<div v-if="shown && hasChildSection" :class="$style.children">
		<MkEmojiPickerSection
			v-for="child in customEmojiTree"
			:key="child.category"
			:initialShown="initialShown"
			:continuous="continuous"
			:emojis="customEmojis.filter(e => e.category === child.category).map(e => `:${e.name}:`)"
			:canReact="canReact"
			:hasChildSection="child.children.length !== 0"
			:customEmojiTree="child.children"
			@chosen="nestedChosen"
		>
			<i class="ti ti-folder ti-fw" aria-hidden="true"></i> {{ child.value || i18n.ts.other }}
		</MkEmojiPickerSection>
	</div>
</section>
</template>

<script lang="ts" setup>
import { ref, computed, useTemplateRef, onMounted, onBeforeUnmount, watch } from 'vue';
import type { Ref } from 'vue';
import type { CustomEmojiFolderTree } from '@@/js/emojilist.js';
import { i18n } from '@/i18n.js';
import { customEmojis } from '@/custom-emojis.js';
import MkEmojiPickerSection from '@/components/MkEmojiPicker.section.vue';

const props = withDefaults(defineProps<{
	emojis: string[] | Ref<string[]>;
	disabledEmojis?: string[] | Ref<string[]>;
	initialShown?: boolean;
	continuous?: boolean;
	canReact?: (emoji: string) => boolean;
	hasChildSection?: boolean;
	customEmojiTree?: CustomEmojiFolderTree[];
}>(), {
	disabledEmojis: () => [],
});

const emit = defineEmits<{
	(ev: 'chosen', v: string, event: PointerEvent): void;
}>();

const emojis = computed(() => Array.isArray(props.emojis) ? props.emojis : props.emojis.value);
const disabledEmojis = computed(() => Array.isArray(props.disabledEmojis) ? props.disabledEmojis : props.disabledEmojis.value);
const shown = ref(props.continuous || !!props.initialShown);
const rootEl = useTemplateRef('rootEl');
const bodyEl = useTemplateRef('bodyEl');
const columns = ref(6);
const rowHeight = ref(45);
const bodyPadding = ref(16);
const paddingTop = ref(8);
const firstRow = ref(0);
const lastRow = ref(0);
const focusedEmoji = ref<string | null>(null);
const rowCount = computed(() => Math.ceil(emojis.value.length / columns.value));
const placeholderStyle = computed(() => props.continuous ? {
	height: `${rowCount.value * rowHeight.value + bodyPadding.value}px`,
	gridTemplateRows: `repeat(${rowCount.value}, ${rowHeight.value}px)`,
	boxSizing: 'border-box' as const,
} : undefined);
const visibleEmojis = computed(() => {
	const first = props.continuous ? firstRow.value * columns.value : 0;
	const last = props.continuous ? Math.min(lastRow.value * columns.value, emojis.value.length) : emojis.value.length;
	const indexes = Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index);
	// 滚动时保留聚焦按钮，避免键盘焦点随着离屏回收落回页面。
	const focusedIndex = focusedEmoji.value == null ? -1 : emojis.value.indexOf(focusedEmoji.value);
	if (focusedIndex >= 0 && (focusedIndex < first || focusedIndex >= last)) indexes.push(focusedIndex);
	return indexes.sort((a, b) => a - b).map(index => ({ index, emoji: emojis.value[index] }));
});
let observer: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let scroller: HTMLElement | null = null;
let nearViewport = false;
let frame: number | null = null;
let disposed = false;

function measurePlaceholder() {
	const body = bodyEl.value;
	if (!body) return;
	const style = getComputedStyle(body);
	const tracks = style.gridTemplateColumns.split(' ').map(Number.parseFloat).filter(value => value > 0);
	columns.value = tracks.length || Math.max(1, parseInt(style.getPropertyValue('--columns')) || 6);
	const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
	paddingTop.value = parseFloat(style.paddingTop);
	bodyPadding.value = paddingTop.value + parseFloat(style.paddingBottom);
	const contentWidth = parseFloat(style.width) - (style.boxSizing === 'border-box' ? horizontalPadding : 0);
	rowHeight.value = Math.max(1, tracks[0] || contentWidth / columns.value);
	updateWindow();
}

function updateWindow() {
	const body = bodyEl.value;
	if (!body || !scroller || disposed) return;
	const viewport = scroller.getBoundingClientRect();
	const rect = body.getBoundingClientRect();
	// 弹出动画缩放期间换回布局坐标，避免误加载整段分类。
	const scale = rect.height / body.offsetHeight || 1;
	const top = (viewport.top - rect.top) / scale - paddingTop.value;
	const bottom = (viewport.bottom - rect.top) / scale - paddingTop.value;
	firstRow.value = Math.max(0, Math.min(rowCount.value, Math.floor(top / rowHeight.value) - 1));
	lastRow.value = Math.max(firstRow.value, Math.min(rowCount.value, Math.ceil(bottom / rowHeight.value) + 1));
}

function scheduleWindow() {
	if (!nearViewport || frame != null) return;
	frame = requestAnimationFrame(() => {
		frame = null;
		updateWindow();
	});
}

function updateFocusedEmoji() {
	const active = window.document.activeElement;
	focusedEmoji.value = active instanceof HTMLElement && bodyEl.value?.contains(active) ? active.dataset.emoji ?? null : null;
}

function onFocusOut() {
	queueMicrotask(() => {
		if (!disposed) updateFocusedEmoji();
	});
}

watch(bodyEl, (body, previous) => {
	if (!props.continuous) return;
	if (previous) {
		resizeObserver?.unobserve(previous);
		observer?.unobserve(previous);
	}
	if (!body) return;
	measurePlaceholder();
	resizeObserver?.observe(body);
	observer?.observe(body);
});
watch(emojis, () => updateWindow(), { flush: 'post' });

onMounted(() => {
	if (!props.continuous) return;
	scroller = rootEl.value?.closest<HTMLElement>('.emojis') ?? null;
	measurePlaceholder();
	resizeObserver = new ResizeObserver(measurePlaceholder);
	if (bodyEl.value) resizeObserver.observe(bodyEl.value);
	if (scroller) resizeObserver.observe(scroller);
	observer = new IntersectionObserver(entries => {
		nearViewport = entries.some(entry => entry.isIntersecting);
		updateWindow();
	}, { root: scroller, rootMargin: '100px 0px' });
	if (bodyEl.value) observer.observe(bodyEl.value);
	scroller?.addEventListener('scroll', scheduleWindow, { passive: true });
});

onBeforeUnmount(() => {
	disposed = true;
	if (frame != null) cancelAnimationFrame(frame);
	observer?.disconnect();
	resizeObserver?.disconnect();
	scroller?.removeEventListener('scroll', scheduleWindow);
});

function nestedChosen(emoji: string, ev: PointerEvent) {
	emit('chosen', emoji, ev);
}
</script>

<style lang="scss" module>
.root {
	border-radius: 6px;
	border-bottom: var(--MI-divider);
}

.toggle {
	display: block;
	width: 100%;
	text-align: start;
}

.children {
	padding-left: 9px;
}
</style>
