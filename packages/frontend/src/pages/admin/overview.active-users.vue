<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkError v-if="failed && raw == null" @retry="load"/>
	<MkLoading v-else-if="raw == null"/>
	<template v-else>
		<p v-if="failed" role="alert" :class="$style.error">{{ i18n.ts._dashboard.refreshFailed }}</p>
		<ul :class="$style.keys" aria-hidden="true">
			<li><span :class="$style.key" :style="{ background: colors.accent }"></span>{{ i18n.ts._dashboard.read }}</li>
			<li><span :class="$style.key" :style="{ background: colors.series(1) }"></span>{{ i18n.ts._dashboard.write }}</li>
		</ul>
		<div :class="$style.chart">
			<MkEChart :option="option" :ariaLabel="i18n.ts._charts.activeUsers"/>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import MkEChart from '@/components/MkEChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartColors, chartGrid, echarts, recentDays } from '@/utility/echarts.js';
import { formatChartDate } from '@/utility/chart-date.js';
import { i18n } from '@/i18n.js';

// 看近一个月的走势，比只看一周更容易发现变化。
const chartLimit = 30;
const props = defineProps<{ refreshKey?: number }>();
const colors = chartColors;
const raw = shallowRef<{ read: number[]; write: number[] } | null>(null);
const dates = shallowRef<string[]>([]);
const failed = ref(false);
let controller: AbortController | null = null;

const option = computed(() => {
	const c = colors.value;
	// 接口按天倒序返回，图表从早到晚画。
	const line = (name: string, values: number[], color: string, area: boolean) => ({
		type: 'line', name, data: values.slice(0, chartLimit).reverse(),
		smooth: 0.3, smoothMonotone: 'x', showSymbol: false, symbolSize: 6,
		lineStyle: { width: 2, color }, itemStyle: { color },
		areaStyle: area ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c.fade(color, 0.25) }, { offset: 1, color: c.fade(color, 0) }]) } : undefined,
	});
	return {
		grid: chartGrid,
		tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => i18n.tsx._dashboard.peopleCount({ n: Number(value) }) },
		xAxis: { type: 'category', boundaryGap: false, data: dates.value, axisLabel: { hideOverlap: true } },
		yAxis: { type: 'value', minInterval: 1 },
		series: raw.value == null ? [] : [
			line(i18n.ts._dashboard.read, raw.value.read, c.accent, true),
			// 有些主题的成功色就是主题色，第二条线用分类配色才能区分。
			line(i18n.ts._dashboard.write, raw.value.write, c.series(1), false),
		],
	};
});

async function load() {
	controller?.abort();
	const current = new AbortController();
	controller = current;
	const days = recentDays(chartLimit).map(date => formatChartDate(date.getTime()));
	try {
		const result = await misskeyApi('charts/active-users', { limit: chartLimit, span: 'day' }, undefined, AbortSignal.any([current.signal, AbortSignal.timeout(20_000)]));
		if (current.signal.aborted) return;
		raw.value = result;
		dates.value = days;
		failed.value = false;
	} catch {
		if (!current.signal.aborted) failed.value = true;
	}
}

watch(() => props.refreshKey, () => { void load(); }, { immediate: true });
onBeforeUnmount(() => controller?.abort());
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
	min-height: 210px;
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

.error { margin: 0; color: var(--MI_THEME-error); font-size: .8em; }

// 高度预先固定，图表绘制前后不改变布局。
.chart {
	flex: 1;
	min-height: 220px;
}
</style>
