<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.field">
	<div ref="anchor" :class="[$style.selection, { [$style.disabled]: disabled }]">
		<span v-for="tag in model" :key="tag" :class="$style.chip">
			<span>#{{ tag }}</span>
			<button type="button" class="_button" :class="$style.remove" :disabled="disabled" :aria-label="`${i18n.ts.remove}: ${tag}`" @click="remove(tag)"><i class="ti ti-x" aria-hidden="true"></i></button>
		</span>
		<button :id="id" ref="trigger" type="button" class="_button" :class="$style.trigger" :disabled="disabled" aria-haspopup="dialog" :aria-expanded="opened" :aria-describedby="hintId" :aria-label="i18n.ts._article.tagsHint" @click="open">
			<span v-if="!model.length">{{ i18n.ts._article.tagsHint }}</span>
			<i class="ti ti-search" aria-hidden="true"></i>
		</button>
	</div>
	<span :id="hintId" :class="$style.hint">{{ i18n.ts._article.tagsLimit }} · {{ model.length }}/3</span>
</div>
<Teleport to="body">
	<MkModal v-if="opened" ref="modal" v-slot="{ type, maxHeight }" :anchorElement="anchor" :returnFocusTo="trigger" transparentBg :hasInteractionWithOtherFocusTrappedEls="true" align="left" zPriority="middle" @click="close" @esc="close" @opened="focus" @closed="opened = false">
		<section class="_popup _shadow" :class="[$style.popup, { [$style.drawer]: type === 'drawer' }]" :style="{ maxHeight: maxHeight ? `min(400px, 75dvh, ${maxHeight}px)` : undefined }" role="dialog" :aria-label="i18n.ts._article.tags">
			<header :class="$style.header">
				<strong>{{ i18n.ts._article.tags }}</strong>
				<button type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" @click="close"><i class="ti ti-x" aria-hidden="true"></i></button>
			</header>
			<div :class="$style.searchArea">
				<div :class="$style.inputBox">
					<span v-for="tag in model" :key="tag" :class="$style.chip">
						<span>#{{ tag }}</span>
						<button type="button" class="_button" :class="$style.remove" :disabled="disabled" :aria-label="`${i18n.ts.remove}: ${tag}`" @click="remove(tag); focus()"><i class="ti ti-x" aria-hidden="true"></i></button>
					</span>
					<input ref="input" :value="inputValue" :class="$style.input" :disabled="disabled" :readonly="atLimit" :placeholder="atLimit ? i18n.ts._article.tagsLimit : i18n.ts._article.tagsHint" :aria-label="i18n.ts._article.tagsHint" role="combobox" aria-autocomplete="list" aria-expanded="true" :aria-controls="optionsId" :aria-activedescendant="activeIndex >= 0 && options[activeIndex] ? `${optionsId}-${activeIndex}` : undefined" :aria-invalid="queryLength > CONTENT_LIMITS.articleTag" :aria-describedby="popupHintId" autocomplete="off" autocapitalize="off" spellcheck="false" @input="onInput" @compositionstart="composing = true" @compositionend="onCompositionEnd" @keydown="onKeydown">
					<span :class="[$style.counter, { [$style.overLimit]: inputLength > CONTENT_LIMITS.articleTag }]">{{ inputLength }}/{{ CONTENT_LIMITS.articleTag }}</span>
				</div>
			</div>
			<div :id="optionsId" :class="$style.options" role="listbox" :aria-label="i18n.ts._article.tags" :aria-busy="searching">
				<button v-for="(tag, index) in options" :id="`${optionsId}-${index}`" :key="tag" type="button" class="_button" :class="[$style.option, { [$style.active]: index === activeIndex }]" role="option" aria-selected="false" :disabled="disabled || atLimit" tabindex="-1" @pointermove="activeIndex = index" @mousedown.prevent @click="choose(tag)">#{{ tag }}</button>
			</div>
			<div :class="$style.status" role="status">
				<span v-if="queryLength > CONTENT_LIMITS.articleTag">{{ i18n.tsx._dialog.charactersExceeded({ current: queryLength, max: CONTENT_LIMITS.articleTag }) }}</span>
				<span v-else-if="atLimit">{{ i18n.ts._article.tagsLimit }}</span>
				<span v-else-if="searching">{{ i18n.ts.loading }}</span>
				<span v-else-if="failed">{{ i18n.ts._article.tagsSearchFailed }} <button type="button" class="_textButton" @click="search">{{ i18n.ts.retry }}</button></span>
				<span v-else-if="!composing && !options.length">{{ i18n.ts._article.tagsNotFound }}</span>
			</div>
			<footer :id="popupHintId" :class="$style.footer">{{ i18n.ts._article.tagsLimit }} · {{ model.length }}/3</footer>
		</section>
	</MkModal>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, useTemplateRef, watch } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import MkModal from '@/components/MkModal.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{ id: string; disabled?: boolean }>();
const model = defineModel<string[]>({ required: true });
const anchor = useTemplateRef('anchor');
const trigger = useTemplateRef('trigger');
const modal = useTemplateRef('modal');
const input = useTemplateRef('input');
const optionsId = useId();
const hintId = useId();
const popupHintId = useId();
const opened = ref(false);
const inputValue = ref('');
const query = ref('');
const composing = ref(false);
const inputLength = computed(() => Array.from(inputValue.value).length);
const queryLength = computed(() => Array.from(query.value).length);
const atLimit = computed(() => model.value.length >= 3);
const knownTags = shallowRef<string[]>([]);
const remoteTags = shallowRef<string[]>([]);
const remoteQuery = ref<string | null>(null);
const options = computed(() => {
	if (composing.value || queryLength.value > CONTENT_LIMITS.articleTag) return [];
	const source = remoteQuery.value === query.value ? remoteTags.value : knownTags.value;
	return source.filter(tag => tag.includes(query.value) && !model.value.includes(tag) && Array.from(tag).length <= CONTENT_LIMITS.articleTag).slice(0, 24);
});
const activeIndex = ref(-1);
const searching = ref(false);
const failed = ref(false);
let timer: number | undefined;
let controller: AbortController | undefined;
let generation = 0;
let closed = true;

function normalize(value: string) { return value.normalize('NFKC').toLowerCase().trim().replace(/^#+/u, '').trim(); }

function cancelSearch() {
	window.clearTimeout(timer);
	controller?.abort();
	controller = undefined;
	generation++;
}

function open() {
	if (props.disabled || opened.value) return;
	closed = false;
	remoteQuery.value = null;
	inputValue.value = '';
	query.value = '';
	composing.value = false;
	opened.value = true;
}

function close() {
	if (closed) return;
	closed = true;
	cancelSearch();
	modal.value?.close();
}

function focus() { if (!closed) input.value?.focus({ preventScroll: true }); }

function onInput(event: Event) {
	inputValue.value = (event.target as HTMLInputElement).value;
	if (!composing.value && !(event as InputEvent).isComposing) query.value = normalize(inputValue.value);
}

function onCompositionEnd(event: CompositionEvent) {
	inputValue.value = (event.target as HTMLInputElement).value;
	composing.value = false;
	query.value = normalize(inputValue.value);
}

function remove(tag: string) {
	if (!props.disabled) model.value = model.value.filter(value => value !== tag);
}

function choose(tag: string) {
	if (props.disabled || closed || composing.value || atLimit.value || !options.value.includes(tag)) return;
	model.value = [...model.value, tag];
	inputValue.value = '';
	query.value = '';
	focus();
}

function onKeydown(event: KeyboardEvent) {
	if (event.isComposing || composing.value || event.keyCode === 229) return;
	if (event.key === 'Escape') {
		event.preventDefault();
		event.stopPropagation();
		close();
	} else if (event.key === 'Backspace' && !inputValue.value) {
		const tag = model.value.at(-1);
		if (tag) { event.preventDefault(); remove(tag); }
	} else if (event.key === 'Enter') {
		event.preventDefault();
		event.stopPropagation();
		const tag = options.value[activeIndex.value];
		if (tag) choose(tag);
	} else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.value.length && !atLimit.value) {
		event.preventDefault();
		activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + options.value.length) % options.value.length;
		void nextTick(() => window.document.getElementById(`${optionsId}-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' }));
	}
}

async function search() {
	cancelSearch();
	if (closed || props.disabled || atLimit.value || composing.value || queryLength.value > CONTENT_LIMITS.articleTag) return;
	const request = generation;
	const value = query.value;
	const currentController = new AbortController();
	controller = currentController;
	searching.value = true;
	failed.value = false;
	try {
		const tags = await misskeyApi('articles/tags', { query: value, limit: 24 }, undefined, currentController.signal);
		if (closed || request !== generation) return;
		remoteTags.value = tags;
		remoteQuery.value = value;
		knownTags.value = [...new Set([...knownTags.value, ...tags])];
	} catch {
		if (!closed && request === generation) failed.value = true;
	} finally {
		if (!closed && request === generation) searching.value = false;
	}
}

watch([opened, query, composing, atLimit], () => {
	cancelSearch();
	failed.value = false;
	searching.value = false;
	if (!opened.value || closed || props.disabled || atLimit.value || composing.value || queryLength.value > CONTENT_LIMITS.articleTag) return;
	searching.value = true;
	if (!query.value) { void search(); return; }
	// 输入和本地候选即时更新，只对网络请求防抖。
	timer = window.setTimeout(() => { void search(); }, 250);
}, { flush: 'sync' });
watch(options, () => { activeIndex.value = options.value.length ? 0 : -1; }, { flush: 'sync' });
watch(() => props.disabled, disabled => { if (disabled) close(); });
onBeforeUnmount(() => { closed = true; cancelSearch(); });
</script>

<style lang="scss" module>
.field { display: flex; flex-direction: column; min-width: 0; gap: 8px; }
.selection, .inputBox { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; padding: 6px 8px; border: 1px solid var(--MI_THEME-inputBorder); border-radius: 6px; background: var(--MI_THEME-bg); }
.selection { min-height: 40px; box-sizing: border-box; }
.selection:focus-within, .inputBox:focus-within { border-color: var(--MI_THEME-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent); }
.disabled { opacity: .5; }
.chip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; min-width: 0; padding: 3px 5px 3px 8px; border-radius: 4px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 12px; }
.chip > span { min-width: 0; overflow-wrap: anywhere; }
.remove { display: grid; place-items: center; flex-shrink: 0; width: 20px; height: 20px; border-radius: 3px; }
.trigger { display: flex; flex: 1; align-items: center; justify-content: space-between; gap: 8px; min-width: 28px; min-height: 26px; color: var(--MI_THEME-fgTransparentWeak); text-align: start; font-size: 13px; }
.trigger > i { margin-inline-start: auto; }
.hint { color: var(--MI_THEME-fgTransparentWeak); font-size: 12px; }
.popup { display: flex; flex-direction: column; box-sizing: border-box; width: min(360px, calc(100vw - 32px)); max-height: min(400px, 75dvh); overflow: hidden; background: var(--MI_THEME-popup); color: var(--MI_THEME-fg); }
.drawer { width: 100%; border-radius: var(--MI-radius) var(--MI-radius) 0 0; }
.header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 6px 8px 0 12px; font-size: .9em; }
.close { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 6px; color: var(--MI_THEME-fgTransparentWeak); }
.searchArea { flex-shrink: 0; padding: 8px 12px 10px; }
.input { flex: 1 1 130px; min-width: 0; height: 28px; padding: 0; border: 0; outline: none; background: transparent; color: inherit; font: inherit; font-size: .85em; }
.input::placeholder { color: var(--MI_THEME-fgTransparentWeak); }
.counter { margin-inline-start: auto; color: var(--MI_THEME-fgTransparentWeak); font-size: 10px; font-variant-numeric: tabular-nums; }
.overLimit { color: var(--MI_THEME-error); }
.options { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 6px; }
.option { display: block; width: 100%; min-height: 36px; padding: 8px; border-radius: 5px; text-align: start; overflow-wrap: anywhere; font-size: .85em; }
.active { background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
.option:disabled { opacity: .5; }
.status { flex-shrink: 0; padding: 4px 12px; color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; }
.status:empty { display: none; }
.footer { flex-shrink: 0; margin-top: 8px; padding: 10px 12px; border-top: var(--MI-divider); color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; }
.remove:focus-visible, .trigger:focus-visible, .close:focus-visible, .option:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
</style>
