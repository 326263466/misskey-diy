<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkEChart :option="option" :ariaLabel="label"/>
</div>
</template>

<script lang="ts" setup>
import { computed, shallowRef } from 'vue';
import MkEChart from '@/components/MkEChart.vue';
import { areaGradient, chartColors, chartGrid } from '@/utility/echarts.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	type: 'process' | 'active' | 'delayed' | 'waiting';
	/** 实时数据只保留最近的若干个点。 */
	maxPoints?: number;
}>(), {
	maxPoints: 100,
});
const values = shallowRef<number[]>([]);

const label = {
	process: i18n.ts._queue.process,
	active: i18n.ts._queue.active,
	delayed: i18n.ts._queue.delayed,
	waiting: i18n.ts._queue.waiting,
}[props.type];

const option = computed(() => {
	const c = chartColors.value;
	// 延迟和等待用警示色，积压时更醒目；处理和执行中用不同色相区分。
	const color = { process: c.accent, active: c.series(1), delayed: c.error, waiting: c.warn }[props.type];
	return {
		// 数据每秒推送，过渡动画会让曲线一直在抖。
		animation: false,
		grid: { ...chartGrid, top: 8 },
		tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => number(Number(value)) },
		xAxis: { type: 'category', boundaryGap: false, data: values.value.map((_, index) => index), axisLabel: { show: false }, axisLine: { show: false } },
		yAxis: { type: 'value', min: 0, minInterval: 1, splitNumber: 3 },
		series: [{
			type: 'line', name: label, data: values.value,
			smooth: 0.3, smoothMonotone: 'x', showSymbol: false,
			lineStyle: { width: 2, color }, itemStyle: { color },
			areaStyle: { color: areaGradient(color) },
		}],
	};
});

function setData(list: number[]) {
	values.value = [...values.value, ...list].slice(-props.maxPoints);
}

function pushData(value: number) {
	setData([value]);
}

defineExpose({
	setData,
	pushData,
});
</script>

<style lang="scss" module>
// 高度预先固定，图表绘制前后不改变布局。
.root {
	height: 120px;
}
</style>
