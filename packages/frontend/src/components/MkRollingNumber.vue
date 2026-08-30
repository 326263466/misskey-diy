<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span :class="$style.root" aria-live="polite">
	<Transition
		:css="prefer.s.animation"
		:enterActiveClass="$style.active"
		:leaveActiveClass="$style.active + ' ' + $style.leaving"
		:enterFromClass="direction === 'up' ? $style.fromBelow : $style.fromAbove"
		:leaveToClass="direction === 'up' ? $style.toAbove : $style.toBelow"
	>
		<span :key="value" :class="$style.value">{{ value > 0 ? number(value) : '' }}</span>
	</Transition>
</span>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { prefer } from '@/preferences.js';
import number from '@/filters/number.js';

const props = defineProps<{
	value: number;
}>();

const direction = ref<'up' | 'down'>('up');

watch(() => props.value, (value, previousValue) => {
	direction.value = value >= previousValue ? 'up' : 'down';
});
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
}

.value {
	display: block;
	line-height: 20px;
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
