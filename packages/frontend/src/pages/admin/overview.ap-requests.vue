<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkLoading v-if="raw == null"/>
	<div v-else :class="$style.charts">
		<section :class="$style.chart">
			<ul :class="$style.keys" aria-hidden="true">
				<li><span :class="$style.key" :style="{ background: colors.accent }"></span>{{ i18n.ts._dashboard.apIn }}</li>
			</ul>
			<div :class="$style.canvas">
				<MkEChart :option="inboxOption" :ariaLabel="i18n.ts._dashboard.apIn"/>
			</div>
		</section>
		<section :class="$style.chart">
			<ul :class="$style.keys" aria-hidden="true">
				<li><span :class="$style.key" :style="{ background: colors.success }"></span>{{ i18n.ts._dashboard.apOutSucceeded }}</li>
				<li><span :class="$style.key" :style="{ background: colors.error }"></span>{{ i18n.ts._dashboard.apOutFailed }}</li>
			</ul>
			<div :class="$style.canvas">
				<MkEChart :option="deliverOption" :ariaLabel="`${i18n.ts._dashboard.apOutSucceeded} / ${i18n.ts._dashboard.apOutFailed}`"/>
			</div>
		</section>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import isChromatic from 'chromatic';
import MkEChart from '@/components/MkEChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartColors, chartGrid, echarts, recentDays } from '@/utility/echarts.js';
import { formatChartDate } from '@/utility/chart-date.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';

const chartLimit = 50;
const colors = chartColors;
const raw = shallowRef<{ inboxReceived: number[]; deliverSucceeded: number[]; deliverFailed: number[] } | null>(null);
const dates = recentDays(chartLimit, isChromatic() ? new Date('2024-08-31T10:00:00Z') : new Date()).map(date => formatChartDate(date.getTime()));
let disposed = false;

// 接口按天倒序返回，图表从早到晚画。
const chronological = (values: number[]) => values.slice(0, chartLimit).reverse();
const xAxis = { type: 'category', data: dates, axisLabel: { hideOverlap: true } };
const tooltip = { trigger: 'axis', valueFormatter: (value: unknown) => number(Number(value)) };

// 接收量随时间连续变化，用面积曲线看走势。
const inboxOption = computed(() => {
	const c = colors.value;
	return {
		grid: chartGrid,
		tooltip,
		xAxis: { ...xAxis, boundaryGap: false },
		yAxis: { type: 'value', minInterval: 1 },
		series: [{
			type: 'line', name: i18n.ts._dashboard.apIn, data: chronological(raw.value?.inboxReceived ?? []),
			smooth: 0.3, smoothMonotone: 'x', showSymbol: false, symbolSize: 6,
			lineStyle: { width: 2, color: c.accent }, itemStyle: { color: c.accent },
			areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c.fade(c.accent, 0.25) }, { offset: 1, color: c.fade(c.accent, 0) }]) },
		}],
	};
});

// 成功和失败叠在同一根柱子上，柱高是当天投递总数，红色部分就是失败占比。
const deliverOption = computed(() => {
	const c = colors.value;
	const bar = { type: 'bar', stack: 'deliver', barMaxWidth: 10, emphasis: { focus: 'series' } };
	return {
		grid: chartGrid,
		tooltip: { ...tooltip, axisPointer: { type: 'shadow' } },
		xAxis,
		yAxis: { type: 'value', minInterval: 1 },
		series: [
			{ ...bar, name: i18n.ts._dashboard.apOutSucceeded, data: chronological(raw.value?.deliverSucceeded ?? []), itemStyle: { color: c.success } },
			{ ...bar, name: i18n.ts._dashboard.apOutFailed, data: chronological(raw.value?.deliverFailed ?? []), itemStyle: { color: c.error, borderRadius: [2, 2, 0, 0] } },
		],
	};
});

onMounted(async () => {
	const result = await misskeyApi('charts/ap-request', { limit: chartLimit, span: 'day' });
	if (!disposed) raw.value = result;
});

onUnmounted(() => {
	disposed = true;
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
}

.charts {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chart {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
	padding: var(--dashboard-inset, var(--MI-cardPadding));

	&:first-child {
		border-inline-end: var(--MI-divider);
	}
}

.keys {
	display: flex;
	justify-content: flex-end;
	gap: 16px;
	margin: 0;
	padding: 0;
	list-style: none;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;

	> li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
}

.key {
	width: 10px;
	height: 10px;
	border-radius: 2px;
}

// 高度预先固定，图表绘制前后不改变布局。
.canvas {
	height: 220px;
}

@container (max-width: 640px) {
	.charts {
		grid-template-columns: minmax(0, 1fr);
	}

	.chart:first-child {
		border-inline-end: 0;
		border-bottom: var(--MI-divider);
	}
}
</style>
