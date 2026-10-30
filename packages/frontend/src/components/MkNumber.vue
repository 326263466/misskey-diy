<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span>{{ number(Math.floor(tweened.number)) }}</span>
</template>

<script lang="ts" setup>
import { reactive, watch } from 'vue';
import number from '@/filters/number.js';

const props = withDefaults(defineProps<{
	value: number;
	duration?: number;
}>(), {
	duration: 500,
});

const tweened = reactive({
	number: 0,
});

watch(() => props.value, (to, from) => {
	// requestAnimationFrame で from から to へ直線的に変化させる。
	let start: number | null = null;

	function step(timestamp: number) {
		if (start === null) {
			start = timestamp;
		}
		const elapsed = timestamp - start;
		const progress = Math.min(elapsed / props.duration, 1);
		tweened.number = (from ?? 0) + (to - (from ?? 0)) * progress;
		if (progress < 1) {
			window.requestAnimationFrame(step);
		} else {
			tweened.number = to;
		}
	}

	window.requestAnimationFrame(step);
}, {
	immediate: true,
});
</script>
