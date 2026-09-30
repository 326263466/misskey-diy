<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<canvas ref="chartEl"></canvas>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import { Chart } from 'chart.js';
import type { ScatterDataPoint } from 'chart.js';
import tinycolor from 'tinycolor2';
import { store } from '@/store.js';
import { themeManager } from '@/theme.js';
import { useChartTooltip } from '@/composables/use-chart-tooltip.js';
import { chartVLine } from '@/utility/chart-vline.js';
import { alpha } from '@/utility/color.js';
import { initChart } from '@/utility/init-chart.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { dateOnly } from '@/filters/date.js';

interface RetentionPoint extends ScatterDataPoint {
	x: number;
	y: number;
	d: string;
}

initChart();

const chartEl = useTemplateRef('chartEl');

const { handler: externalTooltipHandler } = useChartTooltip();

let chartInstance: Chart | null = null;

const getDate = (ymd: string) => {
	const [y, m, d] = ymd.split('-').map(x => parseInt(x, 10));
	const date = new Date(y, m + 1, d, 0, 0, 0, 0);
	return date;
};

onMounted(async () => {
	let raw = await misskeyApi('retention', { });

	const vLineColor = store.s.darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';

	const accent = tinycolor(themeManager.currentCompiledTheme!.accent);
	const color = accent.toHex();

	if (chartEl.value == null) return;

	chartInstance = new Chart(chartEl.value, {
		type: 'line',
		data: {
			labels: [],
			datasets: raw.map((record, i) => ({
				label: dateOnly(new Date(record.createdAt)),
				pointRadius: 0,
				borderWidth: 2,
				borderJoinStyle: 'round',
				borderColor: alpha(color, Math.min(1, (raw.length - (i - 1)) / raw.length)),
				fill: false,
				tension: 0.4,
				data: [{
					x: 0,
					y: 100,
					d: dateOnly(new Date(record.createdAt)),
				}, ...Object.entries(record.data).sort((a, b) => getDate(a[0]) > getDate(b[0]) ? 1 : -1).map(([k, v], i) => ({
					x: i + 1,
					y: (v / record.users) * 100,
					d: dateOnly(new Date(record.createdAt)),
				}))],
			})),
		},
		options: {
			aspectRatio: 2.5,
			layout: {
				padding: {
					left: 0,
					right: 0,
					top: 0,
					bottom: 0,
				},
			},
			scales: {
				x: {
					title: {
						display: true,
						text: i18n.ts._dashboard.daysLater,
					},
				},
				y: {
					title: {
						display: true,
						text: i18n.ts._dashboard.retentionRateAxis,
					},
					ticks: {
						callback: (value, index, values) => value + '%',
					},
					min: 0,
				},
			},
			interaction: {
				intersect: false,
			},
			plugins: {
				legend: {
					display: false,
				},
				tooltip: {
					enabled: false,
					callbacks: {
						title(context) {
							const v = context[0].dataset.data[context[0].dataIndex] as RetentionPoint;
							return i18n.tsx._dashboard.nDaysLater({ n: v.x });
						},
						label(context) {
							const v = context.dataset.data[context.dataIndex] as RetentionPoint;
							const p = Math.round(v.y) + '%';
							return `${v.d} ${p}`;
						},
					},
					mode: 'index',
					animation: {
						duration: 0,
					},
					external: externalTooltipHandler,
				},
			},
		},
		plugins: [chartVLine(vLineColor)],
	});
});

onUnmounted(() => {
	chartInstance?.destroy();
});
</script>
