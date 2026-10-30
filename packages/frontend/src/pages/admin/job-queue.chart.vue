<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :style="{ aspectRatio: String(aspectRatio ?? 2.5) }">
	<MkEChart :option="option" :ariaLabel="`${i18n.ts._queue.completed} / ${i18n.ts._queue.failed}`"/>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkEChart from '@/components/MkEChart.vue';
import { areaGradient, chartColors, chartGrid } from '@/utility/echarts.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	dataSet: {
		completed: number[];
		failed: number[];
	};
	aspectRatio?: number;
}>();

// 完成与失败分开画两条面积线，失败用错误色，有积压时一眼能看到。
const option = computed(() => {
	const c = chartColors.value;
	const length = Math.max(props.dataSet.completed.length, props.dataSet.failed.length);
	const line = (name: string, data: number[], color: string) => ({
		type: 'line', name, data,
		smooth: 0.3, smoothMonotone: 'x', showSymbol: false,
		lineStyle: { width: 2, color }, itemStyle: { color },
		areaStyle: { color: areaGradient(color) },
	});
	return {
		grid: { ...chartGrid, top: 8 },
		tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => number(Number(value)) },
		xAxis: { type: 'category', boundaryGap: false, data: Array.from({ length }, (_, index) => index), axisLabel: { show: false }, axisLine: { show: false } },
		yAxis: { type: 'value', min: 0, minInterval: 1, splitNumber: 3 },
		series: [
			line(i18n.ts._queue.completed, props.dataSet.completed, c.success),
			line(i18n.ts._queue.failed, props.dataSet.failed, c.error),
		],
	};
});
</script>
