<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<label :for="inputId" :class="$style.label"><slot name="label"></slot></label>
	<div :class="[$style.input, { [$style.disabled]: disabled }]">
		<input
			:id="inputId"
			v-adaptive-border
			:value="v"
			:class="$style.inputCore"
			type="color"
			:disabled="disabled"
			:required="required"
			:readonly="readonly"
			@input="onColorInput"
			@change="onColorInput"
		>
	</div>
	<div :class="$style.caption"><slot name="caption"></slot></div>
</div>
</template>

<script lang="ts" setup>
import { ref, useId, watch } from 'vue';
import tinycolor from 'tinycolor2';

const props = defineProps<{
	modelValue: string | null;
	required?: boolean;
	readonly?: boolean;
	disabled?: boolean;
}>();

const inputId = useId();

const emit = defineEmits<{
	(ev: 'update:modelValue', value: string): void;
}>();

// Native color inputs require a six-digit hex value, and must follow async form updates.
const v = ref(tinycolor(props.modelValue ?? '').toHexString());
watch(() => props.modelValue, value => {
	v.value = tinycolor(value ?? '').toHexString();
});

function onColorInput(event: Event) {
	if (props.disabled || props.readonly) return;
	const value = (event.target as HTMLInputElement).value;
	if (value === v.value) return;
	v.value = value;
	emit('update:modelValue', value);
}
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

.input {
	position: relative;

	&.focused {
		> .inputCore {
			border-color: var(--MI_THEME-accent) !important;
			//box-shadow: 0 0 0 4px var(--MI_THEME-focus);
		}
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
	appearance: none;
	-webkit-appearance: none;
	display: block;
	height: 42px;
	width: 100%;
	margin: 0;
	padding: 0 12px;
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

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}
</style>
