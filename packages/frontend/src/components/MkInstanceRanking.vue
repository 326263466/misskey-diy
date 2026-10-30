<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<!-- 按服务器排名比较数量，横向条形比多块扇区更容易读出差距。 -->
	<div v-if="items.length > 0" :style="{ height: `${items.length * 28 + 8}px` }">
		<MkEChart :option="option" :ariaLabel="summary" @click="onClick"/>
	</div>
	<p v-else :class="$style.empty">{{ i18n.ts.nothing }}</p>
	<div v-if="other > 0" :class="$style.other">{{ i18n.ts.other }} {{ number(other) }}</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as os from '@/os.js';
import MkEChart from '@/components/MkEChart.vue';
import { chartColors, chartGrid } from '@/utility/echarts.js';
import type { ECElementEvent } from '@/utility/echarts.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	/** 已按数量从大到小排列。 */
	items: { host: string; value: number }[];
	other: number;
	label: string;
	/** 点击后在窗口中打开服务器详情时，是否使用后台的无卡片画布。 */
	plainCanvas?: boolean;
}>();

const summary = computed(() => props.items.map(item => `${item.host} ${number(item.value)}`).join('，'));

const option = computed(() => {
	const c = chartColors.value;
	// 纵轴从下往上画，翻转后最大的在最上面。
	const items = props.items.slice().reverse();
	return {
		grid: { ...chartGrid, top: 0, bottom: 0, right: 48 },
		tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: unknown) => number(Number(value)) },
		xAxis: { type: 'value', show: false },
		yAxis: { type: 'category', data: items.map(item => item.host), axisLine: { show: false }, axisLabel: { width: 140, overflow: 'truncate' } },
		series: [{
			type: 'bar', name: props.label, data: items.map(item => item.value), barMaxWidth: 14, cursor: 'pointer',
			itemStyle: { color: c.accent, borderRadius: [0, 3, 3, 0] },
			label: { show: true, position: 'right', color: c.weak, formatter: ({ value }: { value: number }) => number(value) },
		}],
	};
});

function onClick(params: ECElementEvent) {
	if (params.componentType !== 'series' || typeof params.name !== 'string' || params.name === '') return;
	os.pageWindow(`/instance-info/${params.name}`, props.plainCanvas ? { plainCanvas: true } : undefined);
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.empty {
	margin: 0;
	padding: 24px 0;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
}

.other {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
	text-align: right;
}
</style>
