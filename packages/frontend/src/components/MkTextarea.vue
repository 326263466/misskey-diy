<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" class="_selectable" @focusout="onFocusout">
	<label v-if="!collapsible || expanded || filled" :for="id" :class="$style.label" @click="focus"><slot name="label"></slot></label>
	<button v-if="collapsible && !expanded" type="button" class="_button" :class="$style.collapsed" :disabled="disabled" @click="focus">
		<Mfm v-if="v && !code" :text="v" :plain="true" :noEmojiTooltip="true"/>
		<template v-else>{{ v || collapsedPlaceholder || placeholder || i18n.ts.edit }}</template>
	</button>
	<div v-show="!collapsible || expanded" :class="{ [$style.disabled]: disabled, [$style.focused]: focused, [$style.tall]: tall, [$style.pre]: pre }" style="position: relative;">
		<textarea
			:id="id"
			ref="inputEl"
			v-model="v"
			v-adaptive-border
			:class="[$style.textarea, { _monospace: code, _mfm: !code }]"
			:disabled="disabled"
			:required="required"
			:readonly="readonly"
			:placeholder="placeholder"
			:pattern="pattern"
			:autocomplete="autocomplete"
			:spellcheck="spellcheck"
			@focus="focused = true"
			@blur="focused = false"
			@keydown="onKeydown($event)"
			@input="onInput"
			@compositionstart="composing = true"
			@compositionend="onCompositionEnd"
		></textarea>
		<MkEmojiInputOverlay :inputElement="inputEl" :text="v" :disabled="code"/>
	</div>
	<div v-if="!collapsible || expanded" :class="$style.caption"><slot name="caption"></slot></div>
	<button v-if="mfmPreview && (!collapsible || expanded)" style="font-size: 0.85em;" class="_textButton" type="button" @click="preview = !preview">{{ i18n.ts.preview }}</button>
	<div v-if="mfmPreview" v-show="preview && (!collapsible || expanded)" :class="$style.mfmPreview">
		<Mfm :text="v"/>
	</div>

	<MkButton v-if="manualSave && changed" primary :class="$style.save" @click="updated"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, nextTick, ref, watch, computed, toRefs, useTemplateRef } from 'vue';
import { debounce } from 'throttle-debounce';
import type { SuggestionType } from '@/utility/autocomplete.js';
import MkButton from '@/components/MkButton.vue';
import MkEmojiInputOverlay from '@/components/MkEmojiInputOverlay.vue';
import { i18n } from '@/i18n.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { genId } from '@/utility/id.js';

const props = defineProps<{
	modelValue: string | null;
	required?: boolean;
	readonly?: boolean;
	disabled?: boolean;
	pattern?: string;
	placeholder?: string;
	autofocus?: boolean;
	autocomplete?: string;
	mfmAutocomplete?: boolean | SuggestionType[],
	mfmPreview?: boolean;
	spellcheck?: boolean;
	debounce?: boolean;
	manualSave?: boolean;
	code?: boolean;
	tall?: boolean;
	pre?: boolean;
	collapsible?: boolean;
	collapsedPlaceholder?: string;
}>();

const emit = defineEmits<{
	(ev: 'change', _ev: InputEvent): void;
	(ev: 'keydown', _ev: KeyboardEvent): void;
	(ev: 'enter'): void;
	(ev: 'update:modelValue', value: string): void;
	(ev: 'savingStateChange', saved: boolean, invalid: boolean): void;
}>();

const { modelValue, autofocus } = toRefs(props);
const v = ref<string>(modelValue.value ?? '');
let lastUpdatedValue = v.value;
const composing = ref(false);
let collapseAfterComposition = false;
const id = genId();
const rootEl = useTemplateRef('rootEl');
const expanded = ref(false);
const focused = ref(false);
const changed = ref(false);
const invalid = ref(false);
const filled = computed(() => v.value !== '' && v.value != null);
const inputEl = useTemplateRef('inputEl');
const preview = ref(false);
let autocompleteWorker: Autocomplete | null = null;

function focus() {
	if (props.disabled) return;
	if (!props.collapsible) {
		inputEl.value?.focus();
		return;
	}
	expanded.value = true;
	nextTick(() => inputEl.value?.focus());
}

function collapse() {
	if (!props.collapsible) return;
	expanded.value = false;
	focused.value = false;
}

function onFocusout(event: FocusEvent) {
	if (event.relatedTarget instanceof Node && rootEl.value?.contains(event.relatedTarget)) return;
	if (event.relatedTarget == null) {
		// 焦点移入编辑器之前，折叠按钮就已被移除
		nextTick(() => {
			if (!rootEl.value?.contains(window.document.activeElement)) finishEditing();
		});
		return;
	}
	finishEditing();
}

function onOutsidePointerDown(event: PointerEvent) {
	if (event.target instanceof Node && !rootEl.value?.contains(event.target)) finishEditing();
}

function finishEditing() {
	if (!props.collapsible || !expanded.value) return;
	if (composing.value) {
		collapseAfterComposition = true;
		return;
	}
	debouncedUpdated.cancel();
	updated();
	collapse();
}

function onCompositionEnd() {
	composing.value = false;
	if (collapseAfterComposition) {
		collapseAfterComposition = false;
		nextTick(finishEditing);
	}
}

function onInput(ev: InputEvent) {
	changed.value = !props.collapsible || v.value !== lastUpdatedValue;
	emit('change', ev);
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) return;

	emit('keydown', ev);

	if (ev.code === 'Enter') {
		emit('enter');
	}

	if (props.code && ev.key === 'Tab') {
		const pos = inputEl.value?.selectionStart ?? 0;
		const posEnd = inputEl.value?.selectionEnd ?? v.value.length;
		v.value = v.value.slice(0, pos) + '\t' + v.value.slice(posEnd);
		nextTick(() => {
			inputEl.value?.setSelectionRange(pos + 1, pos + 1);
		});
		ev.preventDefault();
	}
}

function updated() {
	if (props.collapsible && composing.value) {
		collapseAfterComposition = true;
		return;
	}
	changed.value = false;
	if (!props.collapsible || v.value !== lastUpdatedValue) {
		lastUpdatedValue = v.value;
		emit('update:modelValue', v.value ?? '');
	}
	if (props.manualSave) collapse();
}

const debouncedUpdated = debounce(1000, updated);

watch(modelValue, newValue => {
	lastUpdatedValue = newValue ?? '';
	v.value = newValue ?? '';
});

watch(v, () => {
	if (!props.manualSave) {
		if (props.debounce) {
			debouncedUpdated();
		} else {
			updated();
		}
	}

	invalid.value = inputEl.value?.validity.badInput ?? true;
});

watch([changed, invalid], ([newChanged, newInvalid]) => {
	emit('savingStateChange', newChanged, newInvalid);
}, { immediate: true });

onMounted(() => {
	if (props.collapsible) window.document.addEventListener('pointerdown', onOutsidePointerDown);

	nextTick(() => {
		if (autofocus.value) {
			focus();
		}
	});

	if (props.mfmAutocomplete && inputEl.value) {
		autocompleteWorker = new Autocomplete(inputEl.value, v, props.mfmAutocomplete === true ? undefined : props.mfmAutocomplete);
	}
});

onUnmounted(() => {
	window.document.removeEventListener('pointerdown', onOutsidePointerDown);

	if (autocompleteWorker) {
		autocompleteWorker.detach();
	}
});
</script>

<style lang="scss" module>
.label {
	display: block;
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;

	&:empty {
		display: none;
	}
}

.caption {
	font-size: 0.85em;
	padding: 8px 0 0 0;
	color: var(--MI_THEME-fgTransparentWeak);

	&:empty {
		display: none;
	}
}

.textarea {
	appearance: none;
	-webkit-appearance: none;
	display: block;
	width: 100%;
	min-width: 100%;
	max-width: 100%;
	min-height: 130px;
	resize: none;
	margin: 0;
	padding: 12px;
	font: inherit;
	font-weight: normal;
	font-size: 1em;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-bg);
	border: solid 1px transparent;
	border-radius: 6px;
	outline: none;
	box-shadow: none;
	box-sizing: border-box;
	transition: border-color 0.1s ease-out;

	&:hover {
		border-color: var(--MI_THEME-inputBorderHover) !important;
	}

	&:focus {
		border-color: var(--MI_THEME-accent) !important;
		outline: none;
	}
}

.collapsed {
	display: -webkit-box;
	width: 100%;
	padding: 8px 12px;
	box-sizing: border-box;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-buttonBg);
	text-align: left;
	line-height: 1.5;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.focused {
	> .textarea {
		border-color: var(--MI_THEME-accent) !important;
	}
}

.disabled {
	opacity: 0.7;
	cursor: not-allowed !important;

	> .textarea {
		cursor: not-allowed !important;
	}
}

.tall {
	> .textarea {
		min-height: 200px;
	}
}

.pre {
	> .textarea {
		white-space: pre;
	}
}

.save {
	margin: 8px 0 0 0;
}

.mfmPreview {
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
	padding: var(--MI-cardPadding);
  border-radius: var(--MI-radius);
  box-sizing: border-box;
  min-height: 130px;
	pointer-events: none;
}
</style>
