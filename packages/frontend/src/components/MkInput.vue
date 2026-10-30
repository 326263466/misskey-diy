<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_selectable _formField">
	<div :id="`${id}-label`" :class="$style.label" @click="focus"><slot name="label"></slot></div>
	<div :class="[$style.input, { [$style.search]: type === 'search', [$style.inline]: inline, [$style.disabled]: disabled, [$style.focused]: focused }]">
		<div ref="prefixEl" :class="$style.prefix"><slot name="prefix"><i v-if="type === 'search'" class="ti ti-search" aria-hidden="true"></i></slot></div>
		<input
			ref="inputEl"
			v-model="displayValue"
			:class="$style.inputCore"
			:type="pickerType ? 'text' : type"
			:disabled="disabled"
			:required="required"
			:readonly="readonly || pickerType != null"
			:aria-label="!$slots.label ? pickerType ? i18n.ts._datePicker.title : type === 'search' ? placeholder || i18n.ts.search : undefined : undefined"
			:enterkeyhint="type === 'search' ? 'search' : undefined"
			:aria-expanded="pickerType ? pickerOpen : undefined"
			:aria-haspopup="pickerType ? 'dialog' : undefined"
			:placeholder="placeholder"
			:aria-labelledby="$slots.label ? `${id}-label` : undefined"
			:maxlength="maxLength"
			:pattern="pattern"
			:autocomplete="autocomplete"
			:autocapitalize="autocapitalize"
			:spellcheck="spellcheck"
			:inputmode="inputmode"
			:step="step"
			:list="id"
			:min="min"
			:max="max"
			@click="openPicker"
			@focus="focused = true"
			@blur="focused = false"
			@compositionstart="composing = true"
			@compositionend="composing = false"
			@keydown="onKeydown($event)"
			@input="onInput"
		>
		<MkEmojiInputOverlay v-if="emojiOverlay" :inputElement="inputEl" :text="typeof v === 'string' ? v : null"/>
		<span v-if="counterLimit != null" class="_inputCounter" :class="[$style.counter, { _inputCounterOver: textLength > counterLimit }]">{{ textLength }} / {{ counterLimit }}</span>
		<datalist v-if="datalist" :id="id">
			<option v-for="data in datalist" :key="data" :value="data"></option>
		</datalist>
		<div ref="suffixEl" :class="$style.suffix"><slot name="suffix"></slot><button v-if="pickerType" type="button" class="_button _iconButton" :disabled="disabled || readonly" :aria-label="i18n.ts._datePicker.title" :aria-expanded="pickerOpen" @click="pickerOpen ? closePicker() : openPicker()"><i class="ti ti-calendar" aria-hidden="true"></i></button></div>
	</div>
	<Teleport to="body">
		<MkModal v-if="pickerType && pickerOpen" ref="pickerModal" v-slot="{ maxHeight }" :anchorElement="inputEl" :returnFocusTo="inputEl" preferType="popup" align="left" transparentBg hasInteractionWithOtherFocusTrappedEls @click="closePicker" @esc="closePicker" @closed="onPickerClosed">
			<MkDatePicker class="_popup _shadow" :class="$style.pickerPanel" :style="{ maxHeight: maxHeight != null ? `${maxHeight}px` : undefined }" role="dialog" aria-modal="true" :modelValue="String(v ?? '')" :type="pickerType" :min="min" :max="max" :step="step" @update:modelValue="selectDate" @close="closePicker"/>
		</MkModal>
	</Teleport>
	<div :class="$style.caption"><slot name="caption"></slot></div>

	<MkButton v-if="manualSave && changed" primary :class="$style.save" :disabled="overLimit" @click="updated"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts">
type SupportedTypes = 'text' | 'password' | 'email' | 'url' | 'tel' | 'number' | 'search' | 'date' | 'time' | 'datetime-local' | 'color';
type ModelValueType<T extends SupportedTypes> =
	T extends 'number' ? number :
	T extends 'text' | 'password' | 'email' | 'url' | 'tel' | 'search' | 'date' | 'time' | 'datetime-local' | 'color' ? string :
	never;
</script>

<script lang="ts" setup generic="T extends SupportedTypes = 'text'">
import { onMounted, onUnmounted, nextTick, ref, useTemplateRef, watch, computed, toRefs, defineAsyncComponent } from 'vue';
import { throttle, debounce } from 'throttle-debounce';
import type { InputHTMLAttributes } from 'vue';
import type { SuggestionType } from '@/utility/autocomplete.js';
import MkButton from '@/components/MkButton.vue';
import MkEmojiInputOverlay from '@/components/MkEmojiInputOverlay.vue';
import MkDatePicker from '@/components/MkDatePicker.vue';
import { versatileLang } from '@@/js/intl-const.js';
import { i18n } from '@/i18n.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { genId } from '@/utility/id.js';

// 弹层间接依赖输入组件，延迟加载避免初始化时形成循环依赖。
const MkModal = defineAsyncComponent(() => import('@/components/MkModal.vue').then(module => module.default));

const props = defineProps<{
	modelValue: ModelValueType<T> | null;
	type?: T;
	required?: boolean;
	readonly?: boolean;
	disabled?: boolean;
	pattern?: string;
	placeholder?: string;
	autofocus?: boolean;
	autocomplete?: string;
	mfmAutocomplete?: boolean | SuggestionType[],
	autocapitalize?: string;
	spellcheck?: boolean;
	inputmode?: InputHTMLAttributes['inputmode'];
	step?: InputHTMLAttributes['step'];
	datalist?: string[];
	min?: InputHTMLAttributes['min'];
	max?: InputHTMLAttributes['max'];
	maxLength?: number;
	counterMaxLength?: number;
	inline?: boolean;
	debounce?: boolean | number;
	throttle?: boolean | number;
	manualSave?: boolean;
	small?: boolean;
	large?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'change', _ev: InputEvent): void;
	(ev: 'keydown', _ev: KeyboardEvent): void;
	(ev: 'enter', _ev: KeyboardEvent): void;
	(ev: 'update:modelValue', value: ModelValueType<T>): void;
	(ev: 'savingStateChange', saved: boolean, invalid: boolean): void;
}>();

const { modelValue } = toRefs(props);
const v = ref<ModelValueType<T> | null>(modelValue.value);
const textLength = computed(() => Array.from(String(v.value ?? '')).length);
// 计数只给需要用户掌握篇幅的文本内容；maxLength 只做输入限制。搜索、网址、密码等不计数。
const counterLimit = computed(() => {
	const limit = props.counterMaxLength;
	return (props.type ?? 'text') === 'text'
		&& limit != null && Number.isInteger(limit) && limit >= 0 ? limit : null;
});
const id = genId();
const focused = ref(false);
const pickerOpen = ref(false);
const pickerModal = useTemplateRef('pickerModal');
const pickerType = computed(() => props.type === 'date' ? 'date' : props.type === 'datetime-local' ? 'datetime-local' : props.type === 'time' ? 'time' : null);
const displayValue = computed({
	get: () => {
		if (!pickerType.value || !v.value) return v.value;
		const raw = String(v.value);
		const date = new Date(pickerType.value === 'date' ? `${raw}T12:00:00` : pickerType.value === 'time' ? `2000-01-01T${raw}` : raw);
		if (!Number.isFinite(date.getTime())) return raw;
		return new Intl.DateTimeFormat(versatileLang, {
			...(pickerType.value !== 'time' ? { year: 'numeric', month: '2-digit', day: '2-digit' } as const : {}),
			...(pickerType.value !== 'date' ? { hour: '2-digit', minute: '2-digit', ...(raw.split('T').at(-1)?.split(':').length === 3 ? { second: '2-digit' } as const : {}) } as const : {}),
		}).format(date);
	},
	set: value => { if (!pickerType.value) v.value = value as ModelValueType<T> | null; },
});

function openPicker() {
	if (pickerType.value && !props.disabled && !props.readonly) pickerOpen.value = true;
}

function closePicker() {
	if (pickerModal.value) pickerModal.value.close();
	else onPickerClosed();
}

function onPickerClosed() {
	pickerOpen.value = false;
	focus();
}

function selectDate(value: string) {
	if (props.disabled || props.readonly) return;
	v.value = value as ModelValueType<T>;
	onInput(new InputEvent('input'));
}

watch(() => props.disabled || props.readonly, locked => {
	if (locked && pickerOpen.value) closePicker();
});

const changed = ref(false);
const composing = ref(false);
const invalid = ref(false);
// MFM 内容需要和预览使用相同的自定义表情图案；其他输入类型（尤其是密码框）必须保留原生显示
const emojiOverlay = computed(() => !!props.mfmAutocomplete && (props.type == null || props.type === 'text'));
const inputEl = useTemplateRef('inputEl');
const prefixEl = useTemplateRef('prefixEl');
const suffixEl = useTemplateRef('suffixEl');
const height =
	props.small ? 33 :
	props.large ? 39 :
	props.type === 'search' ? 40 :
	36;
let autocompleteWorker: Autocomplete | null = null;

const focus = () => inputEl.value?.focus();
const onInput = (event: InputEvent) => {
	changed.value = true;
	emit('change', event);
};
const onKeydown = (ev: KeyboardEvent) => {
	if (composing.value || ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) {
		if (props.type === 'search' && (ev.key === 'Enter' || ev.code === 'Enter')) {
			ev.preventDefault();
			ev.stopPropagation();
		}
		return;
	}
	if (pickerOpen.value && ev.key === 'Escape') {
		ev.preventDefault();
		ev.stopPropagation();
		closePicker();
		return;
	}
	if (pickerType.value && ['Enter', ' ', 'ArrowDown'].includes(ev.key)) {
		ev.preventDefault();
		ev.stopPropagation();
		openPicker();
		return;
	}

	if (props.type === 'search' && (ev.key === 'Enter' || ev.code === 'Enter')) {
		ev.preventDefault();
		ev.stopPropagation();
	}
	emit('keydown', ev);

	if (ev.key === 'Enter' || ev.code === 'Enter') {
		emit('enter', ev);
	}
};

const updated = () => {
	changed.value = false;
	let value: ModelValueType<T>;
	if (props.type === 'number') {
		value = typeof v.value === 'number' ? v.value as ModelValueType<T> : parseFloat(v.value ?? '0') as ModelValueType<T>;
	} else {
		value = (v.value ?? '') as ModelValueType<T>;
	}
	emit('update:modelValue', value);
};

const throttledUpdated = throttle(typeof props.throttle === 'number' ? props.throttle : 1000, updated);
const debouncedUpdated = debounce(typeof props.debounce === 'number' ? props.debounce : 1000, updated);

watch(modelValue, newValue => {
	v.value = newValue;
});

watch(v, () => {
	if (!props.manualSave) {
		if (props.throttle === true || typeof props.throttle === 'number') {
			throttledUpdated();
		} else if (props.debounce === true || typeof props.debounce === 'number') {
			debouncedUpdated();
		} else {
			updated();
		}
	}

	invalid.value = inputEl.value?.validity.badInput ?? true;
}, { flush: 'sync' });

// 超出计数上限视为无效，表单据此禁用保存；提示只靠计数变红，不额外插入文字。
const overLimit = computed(() => counterLimit.value != null && textLength.value > counterLimit.value);

watch([changed, invalid, overLimit], ([newChanged, newInvalid, newOverLimit]) => {
	emit('savingStateChange', newChanged, newInvalid || newOverLimit);
}, { immediate: true });

// このコンポーネントが作成された時、非表示状態である場合がある
// 非表示状態だと要素の幅などは0になってしまうので、ResizeObserverでサイズの変化を監視して計算する
const updatePadding = (entries: ResizeObserverEntry[]) => {
	if (inputEl.value == null) return;

	for (const entry of entries) {
		const width = entry.borderBoxSize[0].inlineSize;
		if (width === 0) continue;
		if (entry.target === prefixEl.value) {
			inputEl.value.style.paddingLeft = width + 'px';
		} else if (entry.target === suffixEl.value) {
			inputEl.value.style.paddingRight = width + 'px';
		}
	}
};

let paddingObserver: ResizeObserver | null = null;

onMounted(() => {
	paddingObserver = new ResizeObserver(updatePadding);
	if (prefixEl.value) paddingObserver.observe(prefixEl.value);
	if (suffixEl.value) paddingObserver.observe(suffixEl.value);

	nextTick(() => {
		if (props.autofocus) {
			focus();
		}
	});

	if (props.mfmAutocomplete && inputEl.value) {
		autocompleteWorker = new Autocomplete(inputEl.value, v, props.mfmAutocomplete === true ? undefined : props.mfmAutocomplete);
	}
});

onUnmounted(() => {
	throttledUpdated.cancel();
	debouncedUpdated.cancel();
	paddingObserver?.disconnect();
	paddingObserver = null;

	if (autocompleteWorker) {
		autocompleteWorker.detach();
	}
});

defineExpose({
	focus,
});
</script>

<style lang="scss" module>
@use '../styles/search.scss' as search;
@use '../styles/input.scss' as input;

.pickerPanel {
	width: min(296px, calc(100vw - 32px));
	margin: 0;
	overflow: auto;
}

.label {
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

.input {
	position: relative;

	&.inline {
		display: inline-block;
		margin: 0;
	}

	&.disabled {
		opacity: 0.7;

		&,
		> .inputCore {
			cursor: not-allowed !important;
		}
	}
}

.inputCore {
	@include input.field;
	appearance: none;
	-webkit-appearance: none;
	display: block;
	height: var(--MI-controlHeight, v-bind("height + 'px'"));
	width: 100%;
	margin: 0;
	padding: 0 12px;
	font: inherit;
	font-weight: normal;
	font-size: 1em;
	color: var(--MI_THEME-fg);
	border-radius: var(--MI-adminRadius, 6px);
	outline: none;
	box-shadow: none;
	box-sizing: border-box;
}

.input.search {
	@include search.frame;
	--MI-searchHeight: var(--MI-controlHeight, v-bind("height + 'px'"));

	// 描边由外层 frame 负责，内层输入框聚焦时不再画第二道边框。
	&.focused > .inputCore,
	> .inputCore,
	> .inputCore:focus {
		@include search.input;
		padding: 0 12px;
		border-color: transparent !important;
	}

	> .prefix,
	> .suffix {
		height: 100%;
		color: var(--MI_THEME-fgTransparentWeak);
	}

	> .suffix {
		padding-inline: 4px;
	}

	> .prefix {
		padding-right: 8px;
	}
}

.counter {
	max-width: calc(100% - 24px);
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	text-align: right;
}

.prefix,
.suffix {
	display: flex;
	align-items: center;
	position: absolute;
	z-index: 1;
	top: 0;
	padding: 0 12px;
	font-size: 1em;
	height: var(--MI-controlHeight, v-bind("height + 'px'"));
	min-width: 16px;
	max-width: 150px;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	box-sizing: border-box;
	pointer-events: none;

	&:empty {
		display: none;
	}
}

.prefix {
	left: 0;
	padding-right: 6px;
}

.suffix {
	right: 0;
	padding-left: 6px;

	button {
		pointer-events: auto;
		padding: 4px;
	}
}
.save {
	margin: 8px 0 0 0;
}
</style>
