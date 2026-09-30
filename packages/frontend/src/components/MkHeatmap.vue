<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl">
	<MkLoading v-if="fetching"/>
	<div v-else>
		<canvas ref="chartEl"></canvas>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, nextTick, watch, useTemplateRef, ref, computed } from 'vue';
import { Chart } from 'chart.js';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { store } from '@/store.js';
import { useChartTooltip } from '@/composables/use-chart-tooltip.js';
import { alpha } from '@/utility/color.js';
import { initChart, applyChartThemeDefaults } from '@/utility/init-chart.js';
import { themeManager } from '@/theme.js';
import { formatChartDate } from '@/utility/chart-date.js';
import { i18n } from '@/i18n.js';
import { dateOnly } from '@/filters/date.js';

initChart();

export type HeatmapSource = 'active-users' | 'notes' | 'ap-requests-inbox-received' | 'ap-requests-deliver-succeeded' | 'ap-requests-deliver-failed';

const props = withDefaults(defineProps<{
	src: HeatmapSource;
	user?: Misskey.entities.User;
	label?: string;
}>(), {
	user: undefined,
	label: '',
});

const rootEl = useTemplateRef('rootEl');
const chartEl = useTemplateRef('chartEl');
const now = new Date();
let chartInstance: Chart | null = null;
const fetching = ref(true);

// 主题切换时用它重绘, 不重新请求
let lastValues: number[] | null = null;
let lastLayout: HeatmapLayout | null = null;

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

const { handler: externalTooltipHandler } = useChartTooltip({
	position: 'middle',
});

type HeatmapLayout = {
	weeks: number;
	aspectRatio: number;
};

function getLayout(): HeatmapLayout {
	const width = rootEl.value?.offsetWidth ?? 0;
	const wide = width > 700;
	const narrow = width < 400;

	return {
		weeks: wide ? 50 : narrow ? 10 : 25,
		aspectRatio: wide ? 6 : narrow ? 1.8 : 3.2,
	};
}

async function fetchValues(chartLimit: number): Promise<number[]> {
	if (props.src === 'active-users') {
		const raw = await misskeyApi('charts/active-users', { limit: chartLimit, span: 'day' });
		return raw.readWrite;
	} else if (props.src === 'notes') {
		if (props.user) {
			const raw = await misskeyApi('charts/user/notes', { userId: props.user.id, limit: chartLimit, span: 'day' });
			return raw.inc;
		} else {
			const raw = await misskeyApi('charts/notes', { limit: chartLimit, span: 'day' });
			return raw.local.inc;
		}
	} else if (props.src === 'ap-requests-inbox-received') {
		const raw = await misskeyApi('charts/ap-request', { limit: chartLimit, span: 'day' });
		return raw.inboxReceived;
	} else if (props.src === 'ap-requests-deliver-succeeded') {
		const raw = await misskeyApi('charts/ap-request', { limit: chartLimit, span: 'day' });
		return raw.deliverSucceeded;
	} else if (props.src === 'ap-requests-deliver-failed') {
		const raw = await misskeyApi('charts/ap-request', { limit: chartLimit, span: 'day' });
		return raw.deliverFailed;
	}

	return [];
}

function drawChart(values: number[], layout: HeatmapLayout) {
	if (chartInstance) {
		chartInstance.destroy();
	}

	const weeks = layout.weeks;

	const getDate = (ago: number) => {
		const y = now.getFullYear();
		const m = now.getMonth();
		const d = now.getDate();

		return new Date(y, m, d - ago);
	};

	const format = (arr: number[]) => {
		return arr.map((v, i) => {
			const dt = getDate(i);
			const iso = `${dt.getFullYear()}-${(dt.getMonth() + 1).toString().padStart(2, '0')}-${dt.getDate().toString().padStart(2, '0')}`;
			return {
				x: iso,
				y: dt.getDay(),
				t: dt.getTime(),
				v,
			};
		});
	};

	// Chart.defaults 只在模块加载时取过一次, 重绘要按当前主题重读
	applyChartThemeDefaults();

	const color = store.s.darkMode ? '#b4e900' : '#86b300';

	// 視覚上の分かりやすさのため上から最も大きい3つの値の平均を最大値とする
	const max = values.slice().sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3;

	const min = Math.max(0, Math.min(...values) - 1);

	const marginEachCell = 4;

	if (chartEl.value == null) return;

	chartInstance = new Chart(chartEl.value, {
		type: 'matrix',
		data: {
			datasets: [{
				label: seriesLabel.value,
				data: format(values) as any,
				borderWidth: 0,
				borderRadius: 3,
				backgroundColor(c: any) {
					const value = c.dataset.data[c.dataIndex].v as number;
					// GitHub 热力图风格: 无数据的日子也用中性浅色画出格子, 而不是留白
					if (value === 0) {
						return store.s.darkMode ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)';
					}
					let a = (value - min) / max;
					// 保证最小档位也明显强于无数据的底色
					a = Math.max(a, 0.15);
					return alpha(color, a);
				},
				width(c) {
					const a = c.chart.chartArea ?? {};
					return (a.right - a.left) / weeks - marginEachCell;
				},
				height(c) {
					const a = c.chart.chartArea ?? {};
					return (a.bottom - a.top) / 7 - marginEachCell;
				},
			/* @see <https://github.com/misskey-dev/misskey/pull/10365#discussion_r1155511107>
			}] satisfies ChartData[],
			 */
			}],
		},
		options: {
			aspectRatio: layout.aspectRatio,
			layout: {
				padding: {
					left: 8,
					right: 0,
					top: 0,
					bottom: 0,
				},
			},
			scales: {
				x: {
					type: 'time',
					offset: true,
					position: 'bottom',
					time: {
						unit: 'week',
						round: 'week',
						isoWeekday: 0,
					},
					grid: {
						display: false,
					},
					// 去掉图区边缘的轴线, 只保留刻度文字
					border: {
						display: false,
					},
					ticks: {
						display: true,
						maxRotation: 0,
						autoSkipPadding: 8,
						callback: value => formatChartDate(value),
					},
				},
				y: {
					offset: true,
					reverse: true,
					position: 'right',
					grid: {
						display: false,
					},
					border: {
						display: false,
					},
					ticks: {
						maxRotation: 0,
						autoSkip: true,
						padding: 1,
						font: {
							size: 9,
						},
						callback: (value, index, values) => ['', i18n.ts._weekdayShort.monday, '', i18n.ts._weekdayShort.wednesday, '', i18n.ts._weekdayShort.friday, ''][value as any],
					},
				},
			},
			plugins: {
				legend: {
					display: false,
				},
				tooltip: {
					enabled: false,
					callbacks: {
						// 单序列热力图, 色块没有信息量, 置透明让 tooltip 只留文字
						labelColor: () => ({ backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 }),
						title(context) {
							// @ts-expect-error TS(2339)
							return dateOnly(context[0].dataset.data[context[0].dataIndex].t);
						},
						label(context) {
							const v = context.dataset.data[context.dataIndex];

							// @ts-expect-error TS(2339)
							return [`${seriesLabel.value}: ${v.v}`];
						},
					},
					//mode: 'index',
					animation: {
						duration: 0,
					},
					external: externalTooltipHandler,
				},
			},
		},
	});
}

async function renderChart() {
	if (rootEl.value == null) return;

	const layout = getLayout();
	const values = await fetchValues(7 * layout.weeks);

	lastValues = values;
	lastLayout = layout;
	fetching.value = false;

	await nextTick();

	drawChart(values, layout);
}

// canvas 不吃 CSS 变量, 换主题要用已取到的数据重画
// (用 themeChanging 而非 themeChanged: 后者在 View Transition 结束后才触发, 会慢一拍)
function redrawForTheme() {
	if (lastValues == null || lastLayout == null) return;
	drawChart(lastValues, lastLayout);
}

watch(() => props.src, () => {
	fetching.value = true;
	renderChart();
});

onMounted(() => {
	renderChart();
	themeManager.on('themeChanging', redrawForTheme);
});

onUnmounted(() => {
	themeManager.off('themeChanging', redrawForTheme);
	chartInstance?.destroy();
});
</script>
