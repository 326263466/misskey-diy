<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkLoading v-if="cohorts == null"/>
	<MkEChart v-else :option="option" :ariaLabel="i18n.ts._dashboard.retentionRate"/>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import MkEChart from '@/components/MkEChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartColors, chartGrid } from '@/utility/echarts.js';
import { dateOnly } from '@/filters/date.js';
import { i18n } from '@/i18n.js';

type Cohort = { label: string; rates: number[] };

const cohorts = shallowRef<Cohort[] | null>(null);
let disposed = false;

const toDate = (ymd: string) => {
	const [y, m, d] = ymd.split('-').map(x => parseInt(x, 10));
	return new Date(y, m - 1, d);
};

// 每条线是一批注册日的用户：越新的批次颜色越深，便于比较留存是否在改善。
const option = computed(() => {
	const c = chartColors.value;
	const list = cohorts.value ?? [];
	const days = Math.max(0, ...list.map(item => item.rates.length));
	return {
		grid: { ...chartGrid, top: 24, bottom: 24 },
		tooltip: {
			trigger: 'axis',
			formatter: (params: { dataIndex: number; marker: string; seriesName: string; value: number }[]) => {
				const rows = params.map(item => `<div style="display:flex;gap:16px;justify-content:space-between"><span>${item.marker}${item.seriesName}</span><b>${Math.round(item.value)}%</b></div>`);
				return `<div style="margin-bottom:4px;opacity:.7">${i18n.tsx._dashboard.nDaysLater({ n: params[0]?.dataIndex ?? 0 })}</div>${rows.join('')}`;
			},
		},
		xAxis: {
			type: 'category', boundaryGap: false, data: Array.from({ length: days }, (_, index) => index),
			name: i18n.ts._dashboard.daysLater, nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: c.weak, fontSize: 11 },
		},
		yAxis: {
			type: 'value', min: 0, max: 100,
			name: i18n.ts._dashboard.retentionRateAxis, nameTextStyle: { color: c.weak, fontSize: 11, align: 'left' },
			axisLabel: { formatter: (value: number) => `${value}%` },
		},
		series: list.map((item, index) => {
			const color = c.fade(c.accent, Math.max(0.15, 1 - index / Math.max(1, list.length)));
			return {
				type: 'line', name: item.label, data: item.rates,
				smooth: 0.4, showSymbol: false, symbolSize: 6,
				lineStyle: { width: 2, color }, itemStyle: { color },
				emphasis: { focus: 'series' },
			};
		}),
	};
});

onMounted(async () => {
	const raw = await misskeyApi('retention', {});
	if (disposed) return;
	cohorts.value = raw.map(record => ({
		label: dateOnly(new Date(record.createdAt)),
		// 第 0 天固定为 100%。
		rates: [100, ...Object.entries(record.data)
			.sort((a, b) => toDate(a[0]).getTime() - toDate(b[0]).getTime())
			.map(([, count]) => record.users === 0 ? 0 : (count / record.users) * 100)],
	}));
});

onUnmounted(() => {
	disposed = true;
});
</script>

<style lang="scss" module>
// 高度按比例预留，加载前后不改变布局。
.root {
	aspect-ratio: 2.5;
	min-height: 200px;
}
</style>
