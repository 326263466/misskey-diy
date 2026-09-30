<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<MkLoading v-if="fetching"/>
	<div v-show="!fetching" :class="$style.root" class="_panel">
		<div :class="$style.chart">
			<canvas ref="chartEl"></canvas>
		</div>
		<MkChartLegend ref="legendEl" style="margin-top: 8px;"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, useTemplateRef, ref } from 'vue';
import { Chart } from 'chart.js';
import * as Misskey from 'misskey-js';
import gradient from 'chartjs-plugin-gradient';
import type { ChartDataset } from 'chart.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { store } from '@/store.js';
import { useChartTooltip } from '@/composables/use-chart-tooltip.js';
import { chartVLine } from '@/utility/chart-vline.js';
import { initChart } from '@/utility/init-chart.js';
import { chartLegend } from '@/utility/chart-legend.js';
import MkChartLegend from '@/components/MkChartLegend.vue';
import { dateOnly } from '@/filters/date.js';
import { i18n } from '@/i18n.js';

initChart();

const props = defineProps<{
	user: Misskey.entities.User;
}>();

const chartEl = useTemplateRef('chartEl');
const legendEl = useTemplateRef('legendEl');
const now = new Date();
let chartInstance: Chart | null = null;
let disposed = false;
const chartLimit = 50;
const fetching = ref(true);

const { handler: externalTooltipHandler } = useChartTooltip();

async function renderChart() {
	if (chartEl.value == null) return;

	if (chartInstance) {
		chartInstance.destroy();
	}

	const getDate = (ago: number) => {
		const y = now.getFullYear();
		const m = now.getMonth();
		const d = now.getDate();

		return new Date(y, m, d - ago);
	};

	const format = (arr: number[]) => {
		return arr.map((v, i) => ({
			x: getDate(i).getTime(),
			y: v,
		}));
	};

	const raw = await misskeyApi('charts/user/notes', { userId: props.user.id, limit: chartLimit, span: 'day' });

	if (disposed || chartEl.value == null) return;

	const vLineColor = store.s.darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';

	const colorNormal = '#008FFB';
	const colorReply = '#FEB019';
	const colorRenote = '#00E396';
	const colorFile = '#e300db';

	function makeDataset(label: string, data: ChartDataset['data'], extra: Partial<ChartDataset> = {}): ChartDataset {
		return Object.assign({
			label: label,
			data: data,
			parsing: false,
			pointRadius: 0,
			borderWidth: 0,
			borderJoinStyle: 'round',
			borderRadius: 4,
			barPercentage: 0.9,
			fill: true,
		/* @see <https://github.com/misskey-dev/misskey/pull/10365#discussion_r1155511107>
		} satisfies ChartData, extra);
		 */
		}, extra);
	}

	chartInstance = new Chart(chartEl.value, {
		type: 'bar',
		data: {
			datasets: [
				makeDataset(i18n.ts._chartSeries.notesWithFile, format(raw.diffs.withFile).slice().reverse(), { backgroundColor: colorFile }),
				makeDataset(i18n.ts.renotes, format(raw.diffs.renote).slice().reverse(), { backgroundColor: colorRenote }),
				makeDataset(i18n.ts.replies, format(raw.diffs.reply).slice().reverse(), { backgroundColor: colorReply }),
				makeDataset(i18n.ts._chartSeries.notesNormal, format(raw.diffs.normal).slice().reverse(), { backgroundColor: colorNormal }),
			],
		},
		options: {
			// 高度由 .chart 的 aspect-ratio 预留, 画布首次渲染即到位,
			// 避免 Chart.js 挂载后二次放大让区块阶梯式「向右下铺开」
			maintainAspectRatio: false,
			layout: {
				padding: {
					left: 0,
					right: 8,
					top: 0,
					bottom: 0,
				},
			},
			scales: {
				x: {
					type: 'time',
					offset: true,
					stacked: true,
					time: {
						unit: 'day',
						displayFormats: {
							day: 'M/d',
							month: 'Y/M',
						},
					},
					grid: {
						display: false,
					},
					ticks: {
						display: true,
						maxRotation: 0,
						autoSkipPadding: 8,
					},
				},
				y: {
					position: 'left',
					stacked: true,
					suggestedMax: 10,
					grid: {
						display: true,
					},
					ticks: {
						display: true,
						//mirror: true,
					},
				},
			},
			interaction: {
				intersect: false,
				mode: 'index',
			},
			plugins: {
				legend: {
					display: false,
				},
				tooltip: {
					enabled: false,
					mode: 'index',
					animation: {
						duration: 0,
					},
					callbacks: {
						// 日期跟随客户端语言 (Chart.js 的 date-fns 适配器默认固定 en-US 格式)
						title(context) {
							return dateOnly(context[0].parsed.x as number);
						},
					},
					external: externalTooltipHandler,
				},
				...({ // TSを黙らすため
					gradient,
				}),
			},
		},
		plugins: [chartVLine(vLineColor), chartLegend(legendEl.value)],
	});

	fetching.value = false;
}

onMounted(() => {
	renderChart();
});

onUnmounted(() => {
	disposed = true;
	chartInstance?.destroy();
});
</script>

<style lang="scss" module>
.root {
	padding: 20px;
}

// 图表容器按 3:1 预留最终高度, 首帧即到位
.chart {
	aspect-ratio: 3 / 1;
}
</style>
