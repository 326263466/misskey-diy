<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" v-slot="{ type, maxHeight }" :anchorElement="anchorElement" :returnFocusTo="anchorElement" align="left" :transparentBg="true" :hasInteractionWithOtherFocusTrappedEls="true" :zPriority="'middle'" @click="close" @esc="close" @opened="focus" @closed="emit('closed')">
	<section class="_popup _shadow" :class="[$style.root, { [$style.drawer]: type === 'drawer' }]" :style="{ maxHeight: maxHeight ? `min(440px, 70dvh, ${maxHeight}px)` : undefined }" role="dialog" :aria-label="i18n.ts._topics.title">
		<header :class="$style.header">
			<span :class="$style.title"><i class="ti ti-hash" aria-hidden="true"></i>{{ i18n.ts._topics.title }}<span v-if="selected.length" :class="$style.count">{{ selected.length }}/{{ MAX_TOPICS }}</span></span>
			<button type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" @click="close"><i class="ti ti-x" aria-hidden="true"></i></button>
		</header>
		<div :class="$style.searchArea">
			<div :class="$style.searchBox">
				<i class="ti ti-search" aria-hidden="true"></i>
				<input :id="inputId" ref="input" v-model="query" :class="$style.input" :disabled="disabled" :placeholder="i18n.ts._topics.search" :aria-label="i18n.ts._topics.search" role="combobox" aria-autocomplete="list" :aria-expanded="true" :aria-controls="listId" :aria-activedescendant="activeIndex >= 0 && options[activeIndex] ? `${listId}-${activeIndex}` : undefined" :aria-describedby="hintId" autocomplete="off" autocapitalize="off" spellcheck="false" @keydown="onKeydown" @compositionstart="composing = true" @compositionend="composing = false">
				<i v-if="loading" class="ti ti-loader" :class="{ [$style.loading]: prefer.s.animation }" aria-hidden="true"></i>
			</div>
			<p :id="hintId" :class="[$style.hint, { [$style.invalid]: invalid }]">{{ invalid ? i18n.ts._topics.invalid : selected.length >= MAX_TOPICS ? i18n.ts._topics.singleLimit : i18n.ts._topics.hint }}</p>
		</div>
		<div ref="resultsEl" :class="$style.results">
			<p v-if="failed" :class="$style.message" role="status">{{ i18n.ts._topics.searchFailed }} <button type="button" class="_textButton" :disabled="disabled" @click="search()">{{ i18n.ts._topics.retry }}</button></p>
			<p v-else-if="!loading && !invalid && query.trim() && results.length === 0" :class="$style.message" role="status">{{ i18n.ts._topics.empty }}</p>
			<div :id="listId" role="listbox" :aria-label="i18n.ts._topics.results" :aria-busy="loading">
				<template v-for="(option, index) in options" :key="`${option.kind}:${topicKey(option.tag)}`">
					<div v-if="option.kind !== 'trending' && (index === 0 || options[index - 1].kind !== option.kind)" :class="$style.group" aria-hidden="true">{{ groupLabel(option.kind) }}</div>
					<button :id="`${listId}-${index}`" type="button" class="_button" role="option" tabindex="-1" :aria-selected="isSelected(option.tag)" :disabled="disabled || isSelected(option.tag) || selected.length >= MAX_TOPICS" :aria-disabled="disabled || isSelected(option.tag) || selected.length >= MAX_TOPICS" :class="[$style.option, { [$style.active]: activeIndex === index, [$style.selected]: isSelected(option.tag), [$style.create]: option.kind === 'create' }]" @pointerdown.prevent @pointermove="activeIndex = index" @click="choose(option.tag)">
						<span :class="[$style.topicIcon, { [$style.recommended]: option.kind === 'trending' }]" aria-hidden="true"><i :class="option.kind === 'trending' ? 'ti ti-thumb-up-filled' : option.kind === 'create' ? 'ti ti-plus' : 'ti ti-hash'"></i></span>
						<span :class="$style.optionText" :title="option.tag">{{ option.kind === 'create' ? i18n.tsx._topics.create({ tag: option.tag }) : option.tag }}</span>
						<i v-if="isSelected(option.tag)" class="ti ti-check" :aria-label="i18n.ts._topics.selected"></i>
					</button>
				</template>
			</div>
			<p v-if="!loading && !failed && !query.trim() && options.length === 0" :class="$style.message">{{ i18n.ts._topics.empty }}</p>
		</div>
	</section>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
import MkModal from '@/components/MkModal.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { MAX_TOPICS, TOPIC_RESULT_LIMIT, TOPIC_SEARCH_DELAY, parseTopic, searchTopics, topicKey, uniqueTopics } from '@/utility/topic-picker.js';

const props = withDefaults(defineProps<{
	anchorElement?: HTMLElement;
	selected?: string[];
	disabled?: boolean;
}>(), { selected: () => [] });
const emit = defineEmits<{ (ev: 'choose', tag: string): void; (ev: 'closed'): void }>();
type OptionKind = 'trending' | 'results' | 'create';
const modal = useTemplateRef('modal');
const input = useTemplateRef('input');
const resultsEl = useTemplateRef('resultsEl');
const inputId = useId();
const listId = useId();
const hintId = useId();
const query = ref('');
const composing = ref(false);
const results = ref<string[]>([]);
const loading = ref(false);
const failed = ref(false);
const activeIndex = ref(-1);
const candidate = computed(() => parseTopic(query.value));
const invalid = computed(() => query.value.trim() !== '' && candidate.value == null);
const options = computed<{ tag: string; kind: OptionKind }[]>(() => {
	if (invalid.value || composing.value) return [];
	if (query.value.trim()) {
		const matches = results.value.map(tag => ({ tag, kind: 'results' as const }));
		const tag = candidate.value;
		return tag && !isSelected(tag) && !results.value.some(result => topicKey(result) === topicKey(tag)) ? [...matches, { tag, kind: 'create' }] : matches;
	}
	return uniqueTopics(results.value).slice(0, TOPIC_RESULT_LIMIT).map(tag => ({ tag, kind: 'trending' as const }));
});
let timeout: number | undefined;
let generation = 0;
let closed = false;

function isSelected(tag: string): boolean { return props.selected.some(selected => topicKey(selected) === topicKey(tag)); }

function groupLabel(kind: OptionKind): string { return kind === 'create' ? i18n.ts._topics.add : i18n.ts._topics[kind]; }

function focus(): void { if (!closed) input.value?.focus(); }

function close(): void {
	closed = true;
	generation++;
	window.clearTimeout(timeout);
	modal.value?.close();
}

async function search(): Promise<void> {
	window.clearTimeout(timeout);
	const request = ++generation;
	if (closed || props.disabled || composing.value || invalid.value) { loading.value = false; return; }
	loading.value = true;
	failed.value = false;
	try {
		const tags = await searchTopics(query.value.trim() ? candidate.value! : '');
		if (closed || generation !== request) return;
		results.value = tags;
		activeIndex.value = -1;
	} catch {
		if (closed || generation !== request) return;
		failed.value = true;
	} finally {
		if (!closed && generation === request) loading.value = false;
	}
}

watch([query, composing], () => {
	generation++;
	window.clearTimeout(timeout);
	results.value = [];
	activeIndex.value = -1;
	failed.value = false;
	loading.value = false;
	if (composing.value || invalid.value || props.disabled || closed) return;
	if (!query.value.trim()) { void search(); return; }
	loading.value = true;
	timeout = window.setTimeout(() => { void search(); }, TOPIC_SEARCH_DELAY);
}, { immediate: true });

function choose(value: string): void {
	if (props.disabled || closed || composing.value || props.selected.length >= MAX_TOPICS || isSelected(value)) return;
	const tag = parseTopic(value);
	if (tag == null) return;
	emit('choose', tag);
	close();
}

function onKeydown(event: KeyboardEvent): void {
	if (event.isComposing || composing.value || event.keyCode === 229) return;
	if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
	if (props.disabled) return;
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		event.preventDefault();
		const direction = event.key === 'ArrowDown' ? 1 : -1;
		const length = options.value.length;
		if (!length) return;
		activeIndex.value = activeIndex.value < 0 ? direction > 0 ? 0 : length - 1 : (activeIndex.value + direction + length) % length;
		void nextTick(() => resultsEl.value?.querySelector(`[id="${listId}-${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' }));
	} else if (event.key === 'Enter') {
		event.preventDefault();
		const tag = options.value[activeIndex.value]?.tag ?? candidate.value;
		if (tag) choose(tag);
	}
}

watch(() => props.disabled, disabled => { if (disabled) close(); });
onBeforeUnmount(() => { closed = true; generation++; window.clearTimeout(timeout); });
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	width: min(328px, calc(100vw - 32px));
	max-height: min(440px, 70dvh);
	border: 1px solid var(--MI_THEME-divider);
	color: var(--MI_THEME-fg);
	overflow: hidden;
}
.drawer { width: 100%; border-radius: var(--MI-radius) var(--MI-radius) 0 0; }
.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-shrink: 0;
	box-sizing: border-box;
	height: 40px;
	padding: 0 12px 0 16px;
}
.title { display: flex; align-items: center; gap: 6px; color: var(--MI_THEME-accent); font-weight: 700; }
.count { margin-inline-start: 4px; color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; font-weight: normal; }
.close { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: var(--MI_THEME-fgTransparentWeak); }
.close:hover { background: var(--MI_THEME-buttonHoverBg); }
.close:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
.searchArea { flex-shrink: 0; padding: 8px 16px 12px; border-bottom: 1px solid var(--MI_THEME-divider); }
.searchBox {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 10px;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fgTransparentWeak);

	&:focus-within { border-color: var(--MI_THEME-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent); }
}
.input { min-width: 0; flex: 1; height: 40px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--MI_THEME-fg); font: inherit; font-size: .9em; }
.input::placeholder { color: var(--MI_THEME-fgTransparentWeak); }
.hint { margin: 8px 0 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; line-height: 1.5; }
.invalid { color: var(--MI_THEME-error); }
.results { box-sizing: border-box; min-height: 80px; max-height: calc(46px * 5 + 12px); overflow-y: auto; overscroll-behavior: contain; padding: 6px; }
.message { margin: 12px 10px; color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; line-height: 1.5; }
.group { padding: 8px 10px 4px; color: var(--MI_THEME-fgTransparentWeak); font-size: .7em; font-weight: 600; }
.option { display: flex; align-items: center; gap: 8px; box-sizing: border-box; width: 100%; height: 46px; min-height: 46px; padding: 2px 10px; border-radius: 8px; font-size: .9em; text-align: start; cursor: pointer; }
.option.active { background: var(--MI_THEME-buttonHoverBg); }
.option[aria-disabled='true'] { cursor: default; }
.option.selected { color: var(--MI_THEME-accent); }
.topicIcon { display: grid; place-items: center; flex-shrink: 0; width: 26px; height: 26px; border-radius: 7px; background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent); color: var(--MI_THEME-accent); }
.recommended { width: 20px; height: 20px; border-radius: 3px; background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); font-size: 12px; }
.optionText { min-width: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.create { color: var(--MI_THEME-accent); }
.loading { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .loading { animation: none; } }
</style>
