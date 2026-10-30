<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- 尺寸由父元素决定，绘制前后不改变布局。 -->
<div ref="rootEl" :class="$style.root" role="img" :aria-label="ariaLabel"></div>
</template>

<script lang="ts" setup>
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, useTemplateRef, watch } from 'vue';
import { buildChartTheme, chartColors, echarts } from '@/utility/echarts.js';
import type { ECElementEvent, EChartsCoreOption } from '@/utility/echarts.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	/** 只写数据和图表特有的配置，坐标轴、提示框等公共样式由主题提供。 */
	option: EChartsCoreOption;
	ariaLabel?: string;
}>();

const emit = defineEmits<{
	(ev: 'click', params: ECElementEvent): void;
}>();

const rootEl = useTemplateRef('rootEl');
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

const animated = () => prefer.s.animation && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const theme = () => buildChartTheme(chartColors.value, rootEl.value ? getComputedStyle(rootEl.value).fontFamily : 'sans-serif');

function render(notMerge = false) {
	// 动画交给 ECharts 默认处理；数据更新时只替换系列。
	chart?.setOption({ animation: animated(), ...props.option }, notMerge ? { notMerge: true } : { replaceMerge: ['series'] });
}

watch(() => props.option, () => render());
// 换主题只更新配色，按普通更新合并，不重建图表。
watch(chartColors, () => chart?.setTheme(theme()));

onMounted(() => {
	if (!rootEl.value) return;
	chart = echarts.init(rootEl.value, theme(), { renderer: 'canvas' });
	render(true);
	chart.on('click', params => emit('click', params as ECElementEvent));
	// 开始监听时会立即回调一次；ECharts 的 resize 不带动画，会让首次绘制的动画直接跳到结束，所以尺寸没变就不处理。
	observer = new ResizeObserver(([entry]) => {
		if (!chart) return;
		const width = Math.round(entry.contentRect.width);
		const height = Math.round(entry.contentRect.height);
		if (width <= 0 || height <= 0 || (width === chart.getWidth() && height === chart.getHeight())) return;
		// ResizeObserver 在绘制前执行；再排 rAF 会让画布落后容器一帧。
		chart.resize({ width, height });
		chart.getZr().flush();
	});
	observer.observe(rootEl.value);
});

onActivated(() => chart?.resize());
onDeactivated(() => chart?.dispatchAction({ type: 'hideTip' }));
onBeforeUnmount(() => {
	observer?.disconnect();
	chart?.dispose();
	chart = null;
});

/** 透传 ECharts 动作，例如图例悬停时高亮对应扇区。 */
function dispatchAction(payload: Parameters<echarts.ECharts['dispatchAction']>[0]) {
	chart?.dispatchAction(payload);
}

defineExpose({ dispatchAction });
</script>

<style lang="scss" module>
.root {
	width: 100%;
	height: 100%;
	min-width: 0;
}
</style>
