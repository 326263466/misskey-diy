<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkLoading v-if="raw == null"/>
	<div v-else :class="$style.chart">
		<MkEChart :option="option" :ariaLabel="i18n.ts._dashboard.read"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import MkEChart from '@/components/MkEChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartColors, chartGrid, recentDays } from '@/utility/echarts.js';
import { formatChartDate } from '@/utility/chart-date.js';
import { dateOnly } from '@/filters/date.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';

// 访客看到的是最近一个月每天的活跃人数，数据少时柱状比折线更直观。
const chartLimit = 30;
const raw = shallowRef<number[] | null>(null);
const days = recentDays(chartLimit);
let disposed = false;

const option = computed(() => {
	const c = chartColors.value;
	return {
		grid: { ...chartGrid, top: 8 },
		tooltip: {
			trigger: 'axis', axisPointer: { type: 'shadow' },
			formatter: (params: { dataIndex: number; marker: string; seriesName: string; value: number }[]) => {
				const item = params[0];
				if (item == null) return '';
				return `<div style="margin-bottom:4px;opacity:.7">${dateOnly(days[item.dataIndex])}</div>${item.marker}${item.seriesName}: <b>${number(item.value)}</b>`;
			},
		},
		xAxis: { type: 'category', data: days.map(day => formatChartDate(day.getTime())), axisLabel: { hideOverlap: true } },
		yAxis: { type: 'value', minInterval: 1 },
		series: [{
			type: 'bar', name: i18n.ts._dashboard.read, data: (raw.value ?? []).slice(0, chartLimit).reverse(),
			barMaxWidth: 12, itemStyle: { color: c.accent, borderRadius: [3, 3, 0, 0] },
		}],
	};
});

onMounted(async () => {
	const result = await misskeyApi('charts/active-users', { limit: chartLimit, span: 'day' });
	if (!disposed) raw.value = result.read;
});

onUnmounted(() => {
	disposed = true;
});
</script>

<style lang="scss" module>
.root {
	padding: 20px;
}

// 高度按比例预留，加载前后不改变布局。
.chart {
	aspect-ratio: 2.5;
}
</style>
