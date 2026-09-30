<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- Media系専用のinput range -->
<template>
<div :class="$style.controlsSeekbar">
	<progress v-if="buffer !== undefined" :class="$style.buffer" :value="isNaN(buffer) ? 0 : buffer" min="0" max="1">{{ Math.round(buffer * 100) }}% buffered</progress>
	<input
		v-model.number="model"
		:class="$style.seek"
		:style="`--value: ${model * 100}%;`"
		:aria-label="label"
		:aria-valuetext="valueText"
		:aria-describedby="previewTime ? previewId : undefined"
		type="range"
		min="0"
		max="1"
		:step="step"
		@pointerenter="onPointerMove"
		@pointermove="onPointerMove"
		@pointerleave="preview = null"
		@pointercancel="preview = null"
		@change="emit('dragEnded', model)"
	/>
	<span v-if="previewTime && preview" :id="previewId" role="tooltip" :class="[$style.preview, { [$style.previewBelow]: preview.below }]" :style="previewStyle">{{ previewTime }}</span>
</div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { hms } from '@/filters/hms.js';

const props = withDefaults(defineProps<{
	buffer?: number;
	label: string;
	valueText?: string;
	step?: number | 'any';
	durationMs?: number;
}>(), {
	buffer: undefined,
	step: 'any',
});

const emit = defineEmits<{
	(ev: 'dragEnded', value: number): void;
}>();

const model = defineModel<number>({ required: true });
const previewId = useId();
const preview = ref<{ ratio: number; offset: number; below: boolean } | null>(null);
const previewTime = computed(() => preview.value != null && props.durationMs != null && Number.isFinite(props.durationMs) && props.durationMs > 0 ? hms(props.durationMs * preview.value.ratio) : null);
const previewStyle = computed(() => {
	const width = `${(previewTime.value?.length ?? 0) + 2}ch`;
	return {
		width,
		left: `clamp(0px, calc(${preview.value?.offset ?? 0}px - ${width} / 2), calc(100% - ${width}))`,
	};
});

function onPointerMove(ev: PointerEvent) {
	if (ev.pointerType === 'touch' || props.durationMs == null || !Number.isFinite(props.durationMs) || props.durationMs <= 0) return;
	const input = ev.currentTarget as HTMLInputElement;
	const bounds = input.getBoundingClientRect();
	const thumbSize = parseFloat(getComputedStyle(input).getPropertyValue('--thumbSize'));
	const offset = Math.max(0, Math.min(bounds.width, ev.clientX - bounds.left));
	preview.value = {
		ratio: Math.max(0, Math.min(1, (offset - thumbSize / 2) / Math.max(1, bounds.width - thumbSize))),
		offset,
		below: bounds.top < 40,
	};
}
</script>

<style lang="scss" module>
.controlsSeekbar {
	position: relative;
	--sliderBg: var(--MI-mediaSliderBg, light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.15)));
	--thumbSize: var(--MI-mediaRangeThumbSize, 17px);
}

.preview {
	text-shadow: none;
	position: absolute;
	bottom: calc(100% + 6px);
	max-width: 100%;
	box-sizing: border-box;
	padding: 4px 0;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	box-shadow: 0 2px 8px var(--MI_THEME-shadow);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	line-height: 1.5;
	text-align: center;
	white-space: nowrap;
	pointer-events: none;

	&.previewBelow {
		top: calc(100% + 6px);
		bottom: auto;
	}
}

.seek {
	position: relative;
	-webkit-appearance: none;
	appearance: none;
	background: transparent;
	border: 0;
	border-radius: 26px;
	color: var(--MI-mediaRangeFg, var(--MI_THEME-accent));
	display: block;
	height: 24px;
	margin: 0;
	min-width: 0;
	padding: 0;
	transition: box-shadow .3s ease;
	width: 100%;

	&::-webkit-slider-runnable-track {
		background-color: var(--sliderBg);
		background-image: linear-gradient(to right,currentColor var(--value,0),transparent var(--value,0));
		border: 0;
		border-radius: 99rem;
		height: var(--MI-mediaRangeTrackHeight, 5px);
		transition: box-shadow .3s ease;
		user-select: none;
	}

	&::-moz-range-track {
		background: transparent;
		border: 0;
		border-radius: 99rem;
		height: var(--MI-mediaRangeTrackHeight, 5px);
		transition: box-shadow .3s ease;
		user-select: none;
		background-color: var(--sliderBg);
	}

	&::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		background: var(--MI-mediaRangeThumbBg, #fff);
		border: 0;
		border-radius: 100%;
		box-shadow: var(--MI-mediaRangeThumbShadow, 0 1px 1px rgba(35, 40, 47, .15),0 0 0 1px rgba(35, 40, 47, .2));
		height: var(--thumbSize);
		margin-top: calc((var(--MI-mediaRangeTrackHeight, 5px) - var(--thumbSize)) / 2);
		position: relative;
		scale: var(--MI-mediaRangeThumbScale, 1);
		transition: var(--MI-mediaRangeTransition, none);
		width: var(--thumbSize);

		&:active {
			box-shadow: 0 1px 1px rgba(35, 40, 47, .15), 0 0 0 1px rgba(35, 40, 47, .15), 0 0 0 3px rgba(255, 255, 255, .5);
		}
	}

	&::-moz-range-thumb {
		background: var(--MI-mediaRangeThumbBg, #fff);
		border: 0;
		border-radius: 100%;
		box-shadow: var(--MI-mediaRangeThumbShadow, 0 1px 1px rgba(35, 40, 47, .15),0 0 0 1px rgba(35, 40, 47, .2));
		height: var(--thumbSize);
		position: relative;
		scale: var(--MI-mediaRangeThumbScale, 1);
		transition: var(--MI-mediaRangeTransition, none);
		width: var(--thumbSize);

		&:active {
			box-shadow: 0 1px 1px rgba(35, 40, 47, .15), 0 0 0 1px rgba(35, 40, 47, .15), 0 0 0 3px rgba(255, 255, 255, .5);
		}
	}

	&::-moz-range-progress {
		background: currentColor;
		border-radius: 99rem;
		height: var(--MI-mediaRangeTrackHeight, 5px);
	}
}

.buffer {
	appearance: none;
	background: transparent;
	color: var(--MI-mediaRangeBufferFg, color(from var(--MI_THEME-accent) srgb r g b / 0.25));
	border: 0;
	border-radius: 99rem;
	height: var(--MI-mediaRangeTrackHeight, 5px);
	left: 0;
	margin-top: calc(var(--MI-mediaRangeTrackHeight, 5px) / -2);
	padding: 0;
	position: absolute;
	top: 50%;
	width: 100%;

	&::-webkit-progress-bar {
		background: transparent;
	}

	&::-webkit-progress-value {
		background: currentColor;
		border-radius: 100px;
		min-width: 5px;
		transition: width .2s ease;
	}

	&::-moz-progress-bar {
		background: currentColor;
		border-radius: 100px;
		min-width: 5px;
		transition: width .2s ease;
	}
}
</style>
