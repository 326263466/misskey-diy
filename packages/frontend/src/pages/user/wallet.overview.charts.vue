<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<section :class="[$style.card, $style.wide]">
		<header :class="$style.cardHeading">
			<h2>{{ i18n.ts._wallet.flowTrend }}</h2>
			<ul :class="$style.keys" aria-hidden="true">
				<li><span :class="$style.key" :style="{ background: colors.accent }"></span>{{ i18n.ts._wallet.income }}</li>
				<li><span :class="$style.key" :style="{ background: colors.muted }"></span>{{ i18n.ts._wallet.expense }}</li>
			</ul>
		</header>
		<div :class="[$style.chart, $style.flowChart]">
			<MkEChart :option="flowOption" :ariaLabel="flowSummary"/>
		</div>
	</section>
	<section :class="$style.card">
		<header :class="$style.cardHeading">
			<h2>{{ i18n.ts._wallet.balanceTrend }}</h2>
			<span :class="[$style.delta, { [$style.up]: balanceDelta > 0 }]">{{ signed(balanceDelta) }}</span>
		</header>
		<div :class="$style.chart">
			<MkEChart :option="balanceOption" :ariaLabel="balanceSummary"/>
		</div>
	</section>
	<section :class="[$style.card, $style.breakdownCard]">
		<header :class="$style.cardHeading">
			<h2>{{ i18n.ts._wallet.breakdown }}</h2>
			<MkTab v-model="mode" :tabs="modeTabs" :class="$style.switch"/>
		</header>
		<div v-if="breakdown.length > 0" :class="$style.breakdown">
			<div :class="$style.pie">
				<MkEChart ref="pieChart" :option="pieOption" :ariaLabel="breakdownSummary"/>
				<div :class="$style.pieCenter" aria-hidden="true">
					<span>{{ i18n.ts._wallet[mode] }}</span>
					<strong>{{ formatAmount(breakdownTotal) }}</strong>
				</div>
			</div>
			<ul :class="$style.legend">
				<li v-for="(item, index) in breakdown" :key="item.type" @mouseenter="highlight(index, true)" @mouseleave="highlight(index, false)">
					<span :class="$style.dot" :style="{ background: item.color }" aria-hidden="true"></span>
					<span :class="$style.legendLabel">{{ item.label }}</span>
					<span :class="$style.legendValue">{{ formatAmount(item.value) }}</span>
					<span :class="$style.legendShare">{{ item.share }}</span>
				</li>
			</ul>
		</div>
		<p v-else :class="$style.empty">{{ mode === 'income' ? i18n.ts._wallet.noIncome : i18n.ts._wallet.noExpense }}</p>
	</section>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import type { entities } from 'misskey-js';
import { numberFormat } from '@@/js/intl-const.js';
import MkEChart from '@/components/MkEChart.vue';
import MkTab from '@/components/MkTab.vue';
import { i18n } from '@/i18n.js';
import { chartColors, echarts } from '@/utility/echarts.js';
import { dateOnly } from '@/filters/date.js';

const props = defineProps<{
	stats: entities.IWalletStatsResponse;
}>();

type Mode = 'income' | 'expense';
const mode = ref<Mode>('income');
const modeTabs = [
	{ key: 'income' as const, label: i18n.ts._wallet.income },
	{ key: 'expense' as const, label: i18n.ts._wallet.expense },
];
const pieChart = useTemplateRef('pieChart');
const colors = chartColors;

const formatAmount = (value: number) => numberFormat.format(value);
const signed = (value: number) => `${value > 0 ? '+' : ''}${formatAmount(value)}`;
// 横轴按自然日显示 M/d，提示框显示完整日期。
const shortDate = (date: string) => { const [, m, d] = date.split('-'); return `${Number(m)}/${Number(d)}`; };
const fullDate = (date: string) => dateOnly(new Date(`${date}T00:00:00`));
// 十万以上用紧凑写法，避免左侧占太宽；更小的数直接显示，相邻刻度不会都显示成“1万”。
const compact = new Intl.NumberFormat(numberFormat.resolvedOptions().locale, { notation: 'compact', maximumFractionDigits: 1 });
const axisNumber = (value: number) => Math.abs(value) >= 100000 ? compact.format(value) : formatAmount(value);
const days = computed(() => props.stats.days);
const dates = computed(() => days.value.map(day => shortDate(day.date)));
const balanceDelta = computed(() => (days.value.at(-1)?.balance ?? 0) - (days.value[0]?.balance ?? 0));

const flowSummary = computed(() => i18n.tsx._wallet.flowSummary({
	days: days.value.length, income: formatAmount(props.stats.income), expense: formatAmount(props.stats.expense),
}));
const balanceSummary = computed(() => i18n.tsx._wallet.balanceSummary({
	days: days.value.length,
	from: formatAmount(days.value[0]?.balance ?? 0),
	to: formatAmount(days.value.at(-1)?.balance ?? 0),
}));

const breakdown = computed(() => {
	const items = props.stats.types.map(item => ({ type: item.type, label: i18n.ts._wallet._types[item.type], value: item[mode.value] }))
		.filter(item => item.value > 0)
		.sort((a, b) => b.value - a.value);
	const total = items.reduce((sum, item) => sum + item.value, 0);
	const percent = new Intl.NumberFormat(numberFormat.resolvedOptions().locale, { style: 'percent', maximumFractionDigits: 1 });
	return items.map((item, index) => {
		const ratio = item.value / total;
		// 占比很小时不显示为 0%。
		return { ...item, color: colors.value.series(index), share: ratio < 0.001 ? `<${percent.format(0.001)}` : percent.format(ratio) };
	});
});
const breakdownTotal = computed(() => breakdown.value.reduce((sum, item) => sum + item.value, 0));
const breakdownSummary = computed(() => breakdown.value.map(item => `${item.label} ${formatAmount(item.value)} ${item.share}`).join('，'));

// 坐标轴标签计入外边界，数值位数变化时不会被裁掉。
const grid = { left: 4, right: 12, top: 12, bottom: 4, outerBoundsMode: 'same' as const, outerBoundsContain: 'axisLabel' as const };
const valueAxis = { type: 'value' as const, axisLabel: { formatter: axisNumber } };
const categoryAxis = computed(() => ({ type: 'category' as const, data: dates.value, axisLabel: { hideOverlap: true } }));

type AxisParam = { axisValueLabel?: string; dataIndex: number; marker: string; seriesName: string; value: number };
const tooltipRow = (label: string, value: string) => `<div style="display:flex;gap:16px;justify-content:space-between"><span>${label}</span><b>${value}</b></div>`;

function axisTooltip(params: AxisParam[], withNet = false): string {
	const day = days.value[params[0]?.dataIndex ?? 0];
	const rows = params.map(item => tooltipRow(`${item.marker}${echarts.format.encodeHTML(item.seriesName)}`, formatAmount(Math.abs(item.value))));
	// 净流入只在提示框里显示，不再画线，避免和柱子重叠。
	if (withNet && day) rows.push(tooltipRow(i18n.ts._wallet.netFlow, signed(day.income - day.expense)));
	return `<div style="margin-bottom:4px;opacity:.7">${day ? fullDate(day.date) : ''}</div>${rows.join('')}`;
}

// 收入向上、支出向下，同一天两根柱子共用一个位置。
const flowOption = computed(() => {
	const c = colors.value;
	const bar = { type: 'bar' as const, stack: 'flow', barMaxWidth: 14, emphasis: { focus: 'series' as const } };
	return {
		grid,
		tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: AxisParam[]) => axisTooltip(params, true) },
		xAxis: categoryAxis.value,
		yAxis: valueAxis,
		series: [
			{ ...bar, name: i18n.ts._wallet.income, data: days.value.map(day => day.income), itemStyle: { color: c.accent, borderRadius: [3, 3, 0, 0] } },
			{ ...bar, name: i18n.ts._wallet.expense, data: days.value.map(day => -day.expense), itemStyle: { color: c.muted, borderRadius: [0, 0, 3, 3] } },
		],
	};
});

const balanceOption = computed(() => {
	const c = colors.value;
	return {
		grid,
		tooltip: { trigger: 'axis', formatter: (params: AxisParam[]) => axisTooltip(params) },
		xAxis: { ...categoryAxis.value, boundaryGap: false },
		yAxis: { ...valueAxis, scale: true },
		series: [{
			type: 'line', name: i18n.ts._wallet.balance, data: days.value.map(day => day.balance),
			smooth: 0.3, smoothMonotone: 'x', showSymbol: false, symbolSize: 6,
			lineStyle: { width: 2, color: c.accent }, itemStyle: { color: c.accent },
			areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c.fade(c.accent, 0.28) }, { offset: 1, color: c.fade(c.accent, 0) }]) },
		}],
	};
});

const pieOption = computed(() => {
	return {
		tooltip: {
			trigger: 'item',
			formatter: (item: { marker: string; name: string; value: number; percent: number }) => `${item.marker}${echarts.format.encodeHTML(item.name)}<br><b>${formatAmount(item.value)}</b>&emsp;${breakdown.value.find(entry => entry.label === item.name)?.share ?? ''}`,
		},
		series: [{
			// 占比很小的类型也至少画出一小段，否则会被扇区间隙吞掉；精确占比看右侧明细。
			type: 'pie', radius: ['66%', '90%'], padAngle: 1, minAngle: 6, avoidLabelOverlap: false, label: { show: false }, labelLine: { show: false },
			// 扇区之间靠 padAngle 留缝，不画描边，暗色主题下不会出现白边。
			itemStyle: { borderRadius: 3 },
			emphasis: { scale: true, scaleSize: 5 },
			data: breakdown.value.map(item => ({ name: item.label, value: item.value, itemStyle: { color: item.color } })),
		}],
	};
});

function highlight(index: number, on: boolean) {
	pieChart.value?.dispatchAction({ type: on ? 'highlight' : 'downplay', seriesIndex: 0, dataIndex: index });
}
</script>

<style lang="scss" module>
.root { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--MI-margin); }
.wide { grid-column: 1 / -1; }
.card { display: flex; flex-direction: column; min-width: 0; padding: var(--MI-margin); border: var(--MI-divider); border-radius: var(--MI-radius); }
.cardHeading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px var(--MI-margin); margin-bottom: var(--MI-marginHalf); }
.cardHeading h2 { margin: 0; font-size: 1em; }
.keys { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; padding: 0; list-style: none; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.keys li { display: flex; align-items: center; gap: 6px; }
.key { width: 10px; height: 10px; border-radius: 2px; }
.delta { color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; font-weight: 600; font-variant-numeric: tabular-nums; }
.up { color: var(--MI_THEME-success); }
// 高度预先固定，图表绘制前后不改变布局。
.chart { position: relative; flex: 1; min-height: 220px; }
.flowChart { flex: none; height: 260px; }
.switch { --MI-toolbarFontSize: .85em; }
.switch button { padding: 4px 12px; }
// 构成卡片按自身宽度排布，不受页面宽度影响。
.breakdownCard { container-type: inline-size; }
.breakdown { display: flex; align-items: center; gap: var(--MI-margin); min-height: 220px; }
.pie { position: relative; flex: none; width: 180px; height: 180px; }
.pieCenter { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; pointer-events: none; }
.pieCenter span { color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; }
.pieCenter strong { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1.15em; font-variant-numeric: tabular-nums; }
.legend { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; flex: 1; align-items: center; gap: 2px 8px; min-width: 0; margin: 0; padding: 0; list-style: none; font-size: .9em; }
.legend li { display: contents; }
.legend li > span { padding-block: 5px; }
.legend li:hover > span { color: var(--MI_THEME-fgHighlighted); }
.dot { width: 8px; height: 8px; padding: 0 !important; border-radius: 50%; }
.legendLabel { overflow-wrap: anywhere; }
.legendValue { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.legendShare { min-width: 3.5em; color: var(--MI_THEME-fgTransparentWeak); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.empty { display: flex; align-items: center; justify-content: center; min-height: 220px; margin: 0; color: var(--MI_THEME-fgTransparentWeak); }

@container (max-width: 700px) {
	.root { grid-template-columns: minmax(0, 1fr); }
}

@container (max-width: 400px) {
	.breakdown { flex-direction: column; align-items: stretch; }
	.pie { align-self: center; }
}
</style>
