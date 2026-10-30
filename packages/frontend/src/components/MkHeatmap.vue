<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root" :data-fill="fill">
	<MkError v-if="failed && values == null" @retry="load"/>
	<MkLoading v-else-if="values == null"/>
	<div v-else :class="$style.chart">
		<p v-if="failed" role="alert" :class="$style.error">{{ i18n.ts._dashboard.refreshFailed }}</p>
		<div :class="$style.canvas" :style="{ height: `${7 * pitch + 24}px` }">
			<MkEChart v-if="weeks > 0" :option="option" :ariaLabel="seriesLabel"/>
		</div>
		<div :class="$style.legend" aria-hidden="true">
			<span>{{ i18n.ts._charts.heatmapLess }}</span>
			<span v-for="(color, index) in levelColors" :key="index" :class="$style.legendCell" :style="{ backgroundColor: color }"></span>
			<span>{{ i18n.ts._charts.heatmapMore }}</span>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import type { CustomSeriesOption } from 'echarts/charts';
import { dateOnlyFormat } from '@@/js/intl-const.js';
import MkEChart from '@/components/MkEChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartColors, recentDays } from '@/utility/echarts.js';
import { dateOnly } from '@/filters/date.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';

export type HeatmapSource = 'active-users' | 'notes' | 'ap-requests-inbox-received' | 'ap-requests-deliver-succeeded' | 'ap-requests-deliver-failed';

const props = withDefaults(defineProps<{
	src: HeatmapSource;
	user?: Misskey.entities.User;
	label?: string;
	fill?: boolean;
	refreshKey?: number;
}>(), {
	user: undefined,
	label: '',
	fill: false,
});

const rootEl = useTemplateRef('rootEl');
const values = shallowRef<number[] | null>(null);
const weeks = ref(0);
const pitch = 22;
const failed = ref(false);
const asOf = shallowRef(new Date());
const dayCount = 53 * 7;
let request = 0;
let disposed = false;
let controller: AbortController | null = null;
let observer: ResizeObserver | null = null;

const locale = dateOnlyFormat.resolvedOptions().locale;
const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short' });
const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' });
// 周一开始，只标一、三、五、日，避免文字挤在一起。
const weekdayLabels = Array.from({ length: 7 }, (_, index) => index % 2 === 0 ? weekdayFormat.format(new Date(2024, 0, 1 + index)) : '');

const seriesLabel = computed(() => {
	if (props.label !== '') return props.label;
	switch (props.src) {
		case 'active-users': return i18n.ts._charts.activeUsers;
		case 'notes': return i18n.ts.notes;
		case 'ap-requests-inbox-received': return i18n.ts._dashboard.apRequestsInboxReceived;
		case 'ap-requests-deliver-succeeded': return i18n.ts._dashboard.apRequestsDeliverSucceeded;
		case 'ap-requests-deliver-failed': return i18n.ts._dashboard.apRequestsDeliverFailed;
		default: return '';
	}
});

// 格子尺寸固定，宽度只改变可见周数，侧栏收放不再带动整页高度跳变。
const axisWidth = 40;

// 无数据的格子用中性浅色，有数据的按 4 档主题色深浅区分（与 GitHub 贡献图一致）。
const levelAlphas = [0.28, 0.48, 0.7, 0.92];
const levelColors = computed(() => {
	const c = chartColors.value;
	return [c.fade(c.fg, 0.07), ...levelAlphas.map(a => c.fade(c.accent, a))];
});

const cells = computed(() => {
	const list = values.value ?? [];
	const count = weeks.value * 7;
	if (count === 0) return [];
	// 最后一列结束于今天，往前铺满整周。
	const days = recentDays(count, asOf.value);
	// 取最大的 3 个值的平均作为上限，个别峰值不会让其他格子都变浅。
	const top = list.slice(0, count).sort((a, b) => b - a).slice(0, 3);
	const max = top.length > 0 ? top.reduce((a, b) => a + b, 0) / top.length : 0;
	const lastWeekday = (days[count - 1].getDay() + 6) % 7;
	return days.map((date, index) => {
		const value = list[count - 1 - index] ?? 0;
		const level = value <= 0 || max <= 0 ? 0 : Math.min(levelAlphas.length, Math.max(1, Math.ceil((value / max) * levelAlphas.length)));
		// 列号：今天所在的周是最后一列。
		const column = weeks.value - 1 - Math.floor((count - 1 - index + (6 - lastWeekday)) / 7);
		return { date, value, level, column, row: (date.getDay() + 6) % 7 };
	}).filter(cell => cell.column >= 0);
});

const monthLabels = computed(() => {
	const labels: string[] = Array.from({ length: weeks.value }, () => '');
	let lastMonth = -1;
	let lastColumn = -Infinity;
	for (const cell of cells.value) {
		if (cell.row !== 0 && cell.column !== 0) continue;
		const month = cell.date.getMonth();
		if (month === lastMonth) continue;
		lastMonth = month;
		// 第一列只是上个月的尾巴时，标签会和下个月挤在一起，相距不足 3 列就不标。
		if (cell.column - lastColumn < 3) labels[lastColumn] = '';
		labels[cell.column] = monthFormat.format(cell.date);
		lastColumn = cell.column;
	}
	return labels;
});

const option = computed(() => {
	const c = chartColors.value;
	const colors = levelColors.value;
	const renderCell: NonNullable<CustomSeriesOption['renderItem']> = (_params, api) => {
		const [x, y] = api.coord([api.value(0), api.value(1)]);
		const size = pitch - 4;
		const color = colors[Number(api.value(2))];
		return {
			type: 'rect',
			shape: { x: x - size / 2, y: y - size / 2, width: size, height: size, r: 3 },
			style: { fill: color, stroke: 'transparent', lineWidth: 1 },
			emphasis: { style: { fill: color, stroke: c.fg, lineWidth: 1 } },
		};
	};
	return {
		animation: false,
		// 格子总宽按列数算，多出的宽度留在右侧，格子不会被拉成长方形。
		grid: { left: axisWidth - 4, top: 20, bottom: 4, width: weeks.value * pitch, height: 7 * pitch },
		tooltip: {
			trigger: 'item',
			formatter: ({ data }: { data: { date: Date; raw: number } }) => `${dateOnly(data.date)}<br>${seriesLabel.value}: <b>${number(data.raw)}</b>`,
		},
		xAxis: {
			type: 'category', position: 'top', data: monthLabels.value,
			axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
			axisLabel: { interval: 0, color: c.weak, fontSize: 11, align: 'left' },
		},
		yAxis: {
			type: 'category', inverse: true, data: weekdayLabels,
			axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
			axisLabel: { interval: 0, color: c.weak, fontSize: 11 },
		},
		series: [{
			// 格子直接留出间距，不用粗描边遮盖；悬停时四边不会被相邻格子覆盖。
			type: 'custom',
			renderItem: renderCell,
			encode: { x: 0, y: 1 },
			data: cells.value.map(cell => ({ id: cell.date.toISOString(), value: [cell.column, cell.row, cell.level], date: cell.date, raw: cell.value })),
			emphasis: { focus: 'none' },
			stateAnimation: { duration: 0 },
		}],
	};
});

async function fetchValues(limit: number, signal: AbortSignal): Promise<number[]> {
	switch (props.src) {
		case 'active-users': return (await misskeyApi('charts/active-users', { limit, span: 'day' }, undefined, signal)).readWrite;
		case 'notes': return props.user
			? (await misskeyApi('charts/user/notes', { userId: props.user.id, limit, span: 'day' }, undefined, signal)).inc
			: (await misskeyApi('charts/notes', { limit, span: 'day' }, undefined, signal)).local.inc;
		case 'ap-requests-inbox-received': return (await misskeyApi('charts/ap-request', { limit, span: 'day' }, undefined, signal)).inboxReceived;
		case 'ap-requests-deliver-succeeded': return (await misskeyApi('charts/ap-request', { limit, span: 'day' }, undefined, signal)).deliverSucceeded;
		case 'ap-requests-deliver-failed': return (await misskeyApi('charts/ap-request', { limit, span: 'day' }, undefined, signal)).deliverFailed;
		default: return [];
	}
}

async function load() {
	const current = ++request;
	controller?.abort();
	controller = new AbortController();
	const now = new Date();
	try {
		// 一次取足一年，容器变宽时只重排，不重复请求或把旧日期补成零。
		const result = await fetchValues(dayCount, AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]));
		if (disposed || current !== request) return;
		values.value = result;
		asOf.value = now;
		failed.value = false;
	} catch {
		if (!disposed && current === request) failed.value = true;
	}
}

watch(() => [props.src, props.user?.id], () => { values.value = null; failed.value = false; void load(); });
watch(() => props.refreshKey, () => { void load(); });

onMounted(() => {
	if (rootEl.value) {
		const resize = () => {
			const width = rootEl.value?.clientWidth ?? 0;
			if (width === 0) return;
			weeks.value = Math.max(1, Math.min(53, Math.floor((width - axisWidth) / pitch)));
		};
		resize();
		observer = new ResizeObserver(resize);
		observer.observe(rootEl.value);
	}
	void load();
});

onUnmounted(() => {
	disposed = true;
	observer?.disconnect();
	controller?.abort();
});
</script>

<style lang="scss" module>
.root {
	min-width: 0;
}

.chart {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.canvas {
	min-width: 0;
}

.error { margin: 0; color: var(--MI_THEME-error); font-size: .8em; }

.legend {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.8em;
	line-height: 1;
	user-select: none;
}

.legendCell {
	flex: 0 0 auto;
	width: 12px;
	height: 12px;
	border-radius: 3px;
}

// 填满父容器时在可用高度内垂直居中。
.root[data-fill="true"] {
	display: flex;
	flex-direction: column;
	justify-content: center;
	height: 100%;
	min-height: 0;
}
</style>
