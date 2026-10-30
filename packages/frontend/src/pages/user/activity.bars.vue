<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panel" :class="$style.root">
	<MkLoading v-if="series == null"/>
	<!-- 高度按 3:1 预留，加载前后不改变布局。 -->
	<div v-else :class="$style.chart">
		<MkEChart :option="option" :ariaLabel="series.map(item => item.name).join('，')"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkEChart from '@/components/MkEChart.vue';
import { chartColors, chartGrid, recentDays } from '@/utility/echarts.js';
import { formatChartDate } from '@/utility/chart-date.js';
import { dateOnly } from '@/filters/date.js';
import number from '@/filters/number.js';

export type ActivityBarSeries = {
	name: string;
	/** 接口返回的原始数组，最新的在前。 */
	data: number[];
	/** 分类配色序号，0 为主题色。 */
	color: number;
	/** 同组的柱子叠在一起。 */
	stack: string;
	/** 同一颜色的次要部分（如远程、未登录）用浅色显示。 */
	light?: boolean;
};

const props = defineProps<{
	series: ActivityBarSeries[] | null;
	days: number;
}>();

const dates = computed(() => recentDays(props.days));

// 每天的构成用堆叠柱表示，同组柱高就是当天合计。
const option = computed(() => {
	const c = chartColors.value;
	const list = props.series ?? [];
	const last = new Map(list.map(item => [item.stack, item.name]));
	return {
		grid: { ...chartGrid, top: 8, bottom: 32 },
		legend: { type: 'scroll', bottom: 0 },
		tooltip: {
			trigger: 'axis', axisPointer: { type: 'shadow' },
			formatter: (params: { dataIndex: number; marker: string; seriesName: string; value: number }[]) => {
				const day = dates.value[params[0]?.dataIndex ?? 0];
				const rows = params.map(item => `<div style="display:flex;gap:16px;justify-content:space-between"><span>${item.marker}${item.seriesName}</span><b>${number(item.value)}</b></div>`);
				return `<div style="margin-bottom:4px;opacity:.7">${day ? dateOnly(day) : ''}</div>${rows.join('')}`;
			},
		},
		xAxis: { type: 'category', data: dates.value.map(day => formatChartDate(day.getTime())), axisLabel: { hideOverlap: true } },
		yAxis: { type: 'value', minInterval: 1 },
		series: list.map(item => {
			const base = item.color === 0 ? c.accent : c.series(item.color);
			return {
				type: 'bar', name: item.name, stack: item.stack,
				data: item.data.slice(0, props.days).reverse(),
				barMaxWidth: 14, emphasis: { focus: 'series' },
				// 只给每组最上面一段加圆角。
				itemStyle: { color: item.light ? c.fade(base, 0.45) : base, borderRadius: last.get(item.stack) === item.name ? [2, 2, 0, 0] : 0 },
			};
		}),
	};
});
</script>

<style lang="scss" module>
.root {
	padding: 8px;
}

.chart {
	aspect-ratio: 3 / 1;
	min-height: 200px;
}
</style>
