<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span :class="$style.root" :style="{ minWidth: `${width}ch` }">
	<span :class="$style.accessibleValue" aria-live="polite" aria-atomic="true">{{ number(value) }}</span>
	<span v-if="!animated" :class="$style.value" aria-hidden="true">{{ label }}</span>
	<span v-else>
		<Transition
			:enterActiveClass="$style.active"
			:leaveActiveClass="$style.active + ' ' + $style.leaving"
			:enterFromClass="direction === 'up' ? $style.fromBelow : $style.fromAbove"
			:leaveToClass="direction === 'up' ? $style.toAbove : $style.toBelow"
			@afterLeave="finishRoll"
		>
			<span :key="displayedValue" :class="$style.value" aria-hidden="true">{{ label }}</span>
		</Transition>
	</span>
</span>
</template>

<script lang="ts" setup>
import { computed, onScopeDispose, ref, watch } from 'vue';
import { prefer } from '@/preferences.js';
import number from '@/filters/number.js';
import { numberFormat } from '@@/js/intl-const.js';

const props = defineProps<{
	value: number;
}>();

const direction = ref<'up' | 'down'>('up');
const compactFormat = new Intl.NumberFormat(numberFormat.resolvedOptions().locale, { notation: 'compact', maximumFractionDigits: 1 });
const displayedValue = ref(props.value);
const label = computed(() => displayedValue.value > 0 ? compactFormat.format(displayedValue.value) : '');
const width = ref(Math.max(1, label.value.length));
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = ref(media.matches);
const animated = computed(() => prefer.s.animation && !reducedMotion.value);
let rolling = false;

function updateReducedMotion(event: MediaQueryListEvent): void {
	reducedMotion.value = event.matches;
}

media.addEventListener('change', updateReducedMotion);
onScopeDispose(() => media.removeEventListener('change', updateReducedMotion));

function updateValue(): void {
	if (!animated.value) rolling = false;
	if (rolling || props.value === displayedValue.value) return;

	direction.value = props.value > displayedValue.value ? 'up' : 'down';
	rolling = animated.value;
	displayedValue.value = props.value;
	width.value = Math.max(width.value, label.value.length);
}

function finishRoll(): void {
	rolling = false;
	updateValue();
}

// 连续更新只保留最新目标，上一组数字退出后再开始下一次滚动。
watch([() => props.value, animated], updateValue);
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: inline-flex;
	align-items: center;
	min-width: 1ch;
	height: 20px;
	overflow: hidden;
	line-height: 20px;
	vertical-align: middle;
	font-variant-numeric: tabular-nums;
}

.value {
	display: block;
	white-space: nowrap;
	line-height: 20px;
}

.accessibleValue {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}

.active {
	transition: transform 300ms ease;
	will-change: transform;
}

.leaving {
	position: absolute;
	inset: 0;
}

.fromBelow,
.toBelow {
	transform: translateY(100%);
}

.fromAbove,
.toAbove {
	transform: translateY(-100%);
}
</style>
