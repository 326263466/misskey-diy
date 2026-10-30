<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_formField">
	<div :id="`${id}-label`" :class="$style.label" @click="focus"><slot name="label"></slot></div>
	<div
		ref="container"
		role="button"
		:tabindex="disabled ? -1 : 0"
		:aria-labelledby="$slots.label ? `${id}-label` : undefined"
		:aria-describedby="`${id}-value`"
		:aria-disabled="disabled || readonly"
		:aria-expanded="opening"
		:title="currentValueText ?? undefined"
		aria-haspopup="menu"
		:class="[$style.input, { [$style.inline]: inline, [$style.disabled]: disabled, [$style.focused]: focused || opening }]"
		@focus="focused = true"
		@blur="focused = false"
		@mousedown.prevent="show"
		@click="show"
		@keydown.space.enter.prevent="show"
	>
		<div ref="prefixEl" :class="$style.prefix"><slot name="prefix"></slot></div>
		<div
			ref="inputEl"
			tabindex="-1"
			:class="$style.inputCore"
			:disabled="disabled"
			:required="required"
			:readonly="readonly"
			:placeholder="placeholder"
			@mousedown.prevent="() => {}"
			@keydown.prevent="() => {}"
		>
			<div :id="`${id}-value`" :class="$style.value">{{ currentValueText ?? '' }}</div>
			<div style="display: none;">
				<slot></slot>
			</div>
		</div>
		<div ref="suffixEl" :class="$style.suffix"><i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpening]: opening }]"></i></div>
	</div>
	<div :class="$style.caption"><slot name="caption"></slot></div>
</div>
</template>

<script lang="ts">
import type { OptionValue } from '@/types/option-value.js';

export type ItemOption<T extends OptionValue = OptionValue> = {
	type?: 'option';
	value: T;
	label: string;
	caption?: string;
};

export type ItemGroup<T extends OptionValue = OptionValue> = {
	type: 'group';
	label?: string;
	items: ItemOption<T>[];
};

export type MkSelectItem<T extends OptionValue = OptionValue> = ItemOption<T> | ItemGroup<T>;

export type GetMkSelectValueType<T extends MkSelectItem> = T extends ItemGroup
	? T['items'][number]['value']
	: T extends ItemOption
		? T['value']
		: never;

export type GetMkSelectValueTypesFromDef<T extends MkSelectItem[]> = T[number] extends MkSelectItem
	? GetMkSelectValueType<T[number]>
	: never;
</script>

<script lang="ts" setup generic="const ITEMS extends MkSelectItem[], MODELT extends OptionValue">
import { onMounted, onUnmounted, nextTick, ref, watch, computed, toRefs, useTemplateRef, useId } from 'vue';
import type { CSSProperties } from 'vue';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';

const props = defineProps<{
	items: ITEMS;
	required?: boolean;
	readonly?: boolean;
	disabled?: boolean;
	placeholder?: string;
	autofocus?: boolean;
	inline?: boolean;
	small?: boolean;
	large?: boolean;
	menuStyle?: CSSProperties;
}>();

type ModelTChecked = MODELT & (
	MODELT extends GetMkSelectValueTypesFromDef<ITEMS>
		? unknown
		: 'Error: The type of model does not match the type of items.'
);

const model = defineModel<ModelTChecked>({ required: true });
const id = useId();

const { autofocus } = toRefs(props);
const focused = ref(false);
const opening = ref(false);
const currentValueText = ref<string | null>(null);
const inputEl = useTemplateRef('inputEl');
const prefixEl = useTemplateRef('prefixEl');
const suffixEl = useTemplateRef('suffixEl');
const container = useTemplateRef('container');
const height =
	props.small ? 33 :
	props.large ? 39 :
	36;

const focus = () => container.value?.focus();

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
		if (autofocus.value) {
			focus();
		}
	});
});

onUnmounted(() => {
	paddingObserver?.disconnect();
	paddingObserver = null;
});

watch([model, () => props.items], () => {
	let found: ItemOption | null = null;
	for (const item of props.items) {
		if (item.type === 'group') {
			for (const option of item.items) {
				if (option.value === model.value) {
					found = option;
					break;
				}
			}
		} else {
			if (item.value === model.value) {
				found = item;
				break;
			}
		}
	}
	if (found) {
		currentValueText.value = found.label;
	}
}, { immediate: true, deep: true });

function show() {
	if (opening.value || props.disabled || props.readonly) return;
	focus();

	opening.value = true;

	const menu: MenuItem[] = [];

	for (const item of props.items) {
		if (item.type === 'group') {
			if (item.label != null) {
				menu.push({
					type: 'label',
					text: item.label,
				});
			}
			for (const option of item.items) {
				menu.push({
					text: option.label,
					caption: option.caption,
					active: computed(() => model.value === option.value),
					action: () => {
						model.value = option.value as ModelTChecked;
					},
				});
			}
		} else {
			menu.push({
				text: item.label,
				caption: item.caption,
				active: computed(() => model.value === item.value),
				action: () => {
					model.value = item.value as ModelTChecked;
				},
			});
		}
	}

	os.popupMenu(menu, container.value, {
		matchAnchorWidth: true,
		width: container.value?.getBoundingClientRect().width,
		style: props.menuStyle,
		onClosing: () => {
			opening.value = false;
		},
	});
}
</script>

<style lang="scss" module>
@use '../styles/input.scss' as input;

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
	cursor: pointer;

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

	&:focus {
		outline: none;
	}

	// 焦点在外层容器上，状态与文本输入框一致。
	&:hover:not(.focused, .disabled) > .inputCore {
		border-color: var(--MI-accentBorder);
		background: transparent;
	}

	&.focused > .inputCore {
		border-color: var(--MI-inputFocusBorder);
		background: transparent;
	}
}

.inputCore {
	@include input.states;
	// 全站下拉框统一为轻量描边样式，不使用填充底色。
	border-color: var(--MI-dividerColor);
	background: transparent;
	appearance: none;
	-webkit-appearance: none;
	display: flex;
	align-items: center;
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
	cursor: pointer;
	pointer-events: none;
	user-select: none;
}

.value {
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	pointer-events: none;
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
}

.save {
	margin: 8px 0 0 0;
}

.chevron {
	transition: transform 0.1s ease-out;
}

.chevronOpening {
	transform: rotateX(180deg);
}
</style>
