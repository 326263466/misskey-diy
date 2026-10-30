<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_selectable _formField">
	<label :for="id" :class="$style.label" @click="focus"><slot name="label"></slot></label>
	<div :class="{ [$style.disabled]: disabled, [$style.tall]: tall, [$style.pre]: pre }" style="position: relative;">
		<textarea
			:id="id"
			ref="inputEl"
			v-model="v"
			:class="[$style.textarea, { [$style.withRows]: rows != null, _monospace: code, _mfm: !code }]"
			:rows="rows"
			:disabled="disabled"
			:required="required"
			:readonly="readonly"
			:placeholder="placeholder"
			:pattern="pattern"
			:autocomplete="autocomplete"
			:spellcheck="spellcheck"
			@keydown="onKeydown($event)"
			@input="onInput"
			@compositionstart="composing = true"
			@compositionend="composing = false"
		></textarea>
		<MkEmojiInputOverlay :inputElement="inputEl" :text="v" :disabled="code"/>
		<slot name="counter">
			<span v-if="counterLimit != null" class="_inputCounter" :class="{ _inputCounterOver: textLength > counterLimit }">{{ textLength }} / {{ counterLimit }}</span>
		</slot>
	</div>
	<div :class="$style.caption"><slot name="caption"></slot></div>
	<button v-if="mfmPreview" style="font-size: 0.85em;" class="_textButton" type="button" @click="preview = !preview">{{ i18n.ts.preview }}</button>
	<div v-if="mfmPreview" v-show="preview" :class="$style.mfmPreview">
		<Mfm :text="v"/>
	</div>

	<MkButton v-if="manualSave && changed" primary :class="$style.save" :disabled="overLimit" @click="updated"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
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
	rows?: number;
	maxRows?: number;
	tall?: boolean;
	pre?: boolean;
	counterMaxLength?: number;
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
const textLength = computed(() => Array.from(v.value).length);
const composing = ref(false);
const id = genId();
const changed = ref(false);
const invalid = ref(false);
const inputEl = useTemplateRef('inputEl');
const preview = ref(false);
let autocompleteWorker: Autocomplete | null = null;

// 输入框随内容精确增减高度，上限 maxRows（默认 10 行），超出后内部滚动。
const DEFAULT_MAX_ROWS = 10;

function adjustHeight() {
	const el = inputEl.value;
	if (el == null || el.offsetHeight === 0) return;
	el.style.height = 'auto';
	const style = window.getComputedStyle(el);
	const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
	const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
	const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
	const max = lineHeight * (props.maxRows ?? DEFAULT_MAX_ROWS) + padding + border;
	el.style.height = `${Math.min(el.scrollHeight + border, max)}px`;
}

// 只有传入 counterMaxLength 时才显示计数；计数只做提示，不限制输入。
const counterLimit = computed(() => {
	const limit = props.counterMaxLength;
	return limit != null && Number.isInteger(limit) && limit >= 0 ? limit : null;
});

function focus() {
	if (props.disabled) return;
	inputEl.value?.focus();
}

function onInput(ev: InputEvent) {
	changed.value = true;
	emit('change', ev);
}

function onKeydown(ev: KeyboardEvent) {
	if (composing.value || ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) return;

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
	if (props.manualSave && overLimit.value) return;
	changed.value = false;
	emit('update:modelValue', v.value ?? '');
}

const debouncedUpdated = debounce(1000, updated);

watch(modelValue, newValue => {
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

// 超出计数上限视为无效，表单据此禁用保存；提示只靠计数变红，不额外插入文字。
const overLimit = computed(() => counterLimit.value != null && textLength.value > counterLimit.value);

watch([changed, invalid, overLimit], ([newChanged, newInvalid, newOverLimit]) => {
	emit('savingStateChange', newChanged, newInvalid || newOverLimit);
}, { immediate: true });

watch(v, adjustHeight, { flush: 'post' });

onMounted(() => {
	adjustHeight();

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
	if (autocompleteWorker) {
		autocompleteWorker.detach();
	}
});
</script>

<style lang="scss" module>
@use '../styles/input.scss' as input;

.label {
	display: block;
	font-size: var(--MI-formLabelFontSize, 0.85em);
	padding: 0 0 8px 0;
	user-select: none;

	&:empty {
		display: none;
	}
}

.caption {
	font-size: var(--MI-formCaptionFontSize, 0.85em);
	padding: 8px 0 0 0;
	color: var(--MI_THEME-fgTransparentWeak);

	&:empty {
		display: none;
	}
}

.textarea {
	@include input.field;
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
	border-radius: 6px;
	outline: none;
	box-shadow: none;
	box-sizing: border-box;
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

.textarea.withRows {
	min-height: 0;
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
	border: var(--MI-divider);
	padding: var(--MI-cardPadding);
  border-radius: var(--MI-radius);
  box-sizing: border-box;
  min-height: 130px;
	pointer-events: none;
}
</style>
