<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl">
	<MkLoading v-if="rows == null"/>
	<div v-else :class="$style.canvas" :style="{ height: `${rows.length * 26 + 40}px` }">
		<MkEChart :option="option" :ariaLabel="i18n.ts._dashboard.retentionRate"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef } from 'vue';
import MkEChart from '@/components/MkEChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartColors } from '@/utility/echarts.js';
import { formatChartDate } from '@/utility/chart-date.js';
import { dateOnly } from '@/filters/date.js';
import { i18n } from '@/i18n.js';

type Row = { createdAt: string; users: number; retained: number[] };

const rootEl = useTemplateRef('rootEl');
const rows = shallowRef<Row[] | null>(null);
const maxDays = ref(7);
let disposed = false;

// 每行是一批注册日的用户，第 n 列是注册后第 n 天仍活跃的比例；格子越深留存越高。
const option = computed(() => {
	const c = chartColors.value;
	const list = rows.value ?? [];
	const data = list.flatMap((row, y) => row.retained.slice(0, maxDays.value).map((count, index) => ({
		value: [index, y, row.users === 0 ? 0 : count / row.users],
		count, row,
		day: index + 1,
	})));
	return {
		grid: { left: 4, right: 4, top: 24, bottom: 4, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
		tooltip: {
			trigger: 'item',
			formatter: ({ data: d }: { data: (typeof data)[number] }) => {
				const date = new Date(new Date(d.row.createdAt).getTime() + d.day * 86400000);
				const rate = d.row.users === 0 ? '-' : `${Math.round(d.value[2] * 100)}%`;
				return `${dateOnly(date)}<br>${i18n.tsx._dashboard.nDaysLater({ n: d.day })}<br>${i18n.ts._dashboard.retained}: <b>${d.count}</b> (${rate})`;
			},
		},
		xAxis: {
			type: 'category', position: 'top', name: i18n.ts._dashboard.daysLater, nameLocation: 'middle', nameGap: 20,
			nameTextStyle: { color: c.weak, fontSize: 11 },
			data: Array.from({ length: maxDays.value }, (_, index) => index + 1),
			axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
			axisLabel: { color: c.weak, fontSize: 11 },
		},
		yAxis: {
			type: 'category', inverse: true, data: list.map(row => formatChartDate(new Date(row.createdAt).getTime())),
			axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
			axisLabel: { color: c.weak, fontSize: 11 },
		},
		visualMap: {
			show: false, type: 'continuous', dimension: 2, min: 0, max: 1,
			inRange: { color: [c.fade(c.accent, 0.08), c.accent] },
		},
		series: [{
			type: 'heatmap', data,
			itemStyle: { borderColor: c.panel, borderWidth: 3, borderRadius: 4 },
			emphasis: { itemStyle: { borderColor: c.fg, borderWidth: 1 } },
		}],
	};
});

onMounted(async () => {
	const width = rootEl.value?.offsetWidth ?? 0;
	maxDays.value = width > 600 ? 10 : width < 400 ? 5 : 7;
	const raw = await misskeyApi('retention', {});
	if (disposed) return;
	rows.value = raw.slice(0, maxDays.value + 1).map(record => ({
		createdAt: record.createdAt,
		users: record.users,
		retained: Object.keys(record.data).sort((a, b) => new Date(a).getTime() - new Date(b).getTime()).map(date => record.data[date]),
	}));
});

onUnmounted(() => {
	disposed = true;
});
</script>

<style lang="scss" module>
.canvas {
	min-width: 0;
}
</style>
