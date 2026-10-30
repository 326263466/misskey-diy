/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// ECharts 按需引入：新增图表类型或组件时在这里注册，页面只从这里取用。
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts';
import { DataZoomInsideComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { computed, ref } from 'vue';
import tinycolor from 'tinycolor2';
import { themeManager } from '@/theme.js';

echarts.use([BarChart, CustomChart, HeatmapChart, LineChart, PieChart, DataZoomInsideComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

export { echarts };
export type { EChartsCoreOption, ECElementEvent } from 'echarts/core';

const themeVersion = ref(0);
// 用 themeChanging：它在页面换色的同一帧触发；themeChanged 要等过渡动画结束，图表会慢一拍。
themeManager.on('themeChanging', () => { themeVersion.value++; });

const alpha = (color: string, value: number) => tinycolor(color).setAlpha(tinycolor(color).getAlpha() * value).toRgbString();

// 直接读取页面上已应用的主题变量，图表颜色始终与页面一致。
const themeVar = (name: string) => getComputedStyle(window.document.documentElement).getPropertyValue(`--MI_THEME-${name}`).trim();

/** 当前主题下的图表配色，切换主题后自动更新。 */
export const chartColors = computed(() => {
	void themeVersion.value;
	const accent = themeVar('chartAccent') || themeVar('accent');
	const fg = themeVar('fg');
	return {
		accent,
		fg,
		weak: alpha(fg, 0.5),
		muted: alpha(fg, 0.25),
		// 与 --MI-dividerColor 一致：主题分割线颜色的一半透明度。
		divider: alpha(themeVar('divider'), 0.5),
		success: themeVar('success'),
		warn: themeVar('warn'),
		error: themeVar('error'),
		panel: themeVar('panel'),
		popup: themeVar('popup'),
		shadow: themeVar('shadow'),
		/** 分类配色：以主题色为起点按黄金角旋转色相。 */
		series: (index: number) => tinycolor(accent).spin(index * 137.5).toHexString(),
		fade: alpha,
	};
});

/** 所有图表共用的坐标轴、图例和提示框样式。 */
export function buildChartTheme(colors: typeof chartColors.value, fontFamily: string): object {
	const axisLabel = { color: colors.weak, fontSize: 12 };
	return {
		color: [colors.accent, colors.muted, ...Array.from({ length: 8 }, (_, i) => colors.series(i + 1))],
		backgroundColor: 'transparent',
		textStyle: { color: colors.fg, fontFamily },
		categoryAxis: {
			axisLine: { lineStyle: { color: colors.divider } },
			axisTick: { show: false },
			axisLabel,
			splitLine: { show: false },
		},
		valueAxis: {
			axisLine: { show: false },
			axisTick: { show: false },
			axisLabel,
			splitLine: { lineStyle: { color: colors.divider, type: 'dashed' } },
		},
		legend: {
			icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 16,
			textStyle: { color: colors.weak, fontSize: 12 },
			inactiveColor: colors.muted,
			pageTextStyle: { color: colors.weak },
		},
		tooltip: {
			confine: true,
			backgroundColor: colors.popup,
			borderWidth: 0,
			padding: [8, 12],
			textStyle: { color: colors.fg, fontSize: 13 },
			extraCssText: `border-radius: 8px; box-shadow: 0 4px 16px ${colors.shadow};`,
			axisPointer: { lineStyle: { color: colors.muted }, shadowStyle: { color: colors.fade(colors.fg, 0.04) } },
		},
	};
}

/** 坐标轴标签计入外边界，数值位数变化时不会被裁掉。 */
export const chartGrid = { left: 4, right: 12, top: 12, bottom: 4, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' } as const;

/** 截至今天的最近 count 天（本地零点），从早到晚排列，与统计接口按天倒序返回的数据配合使用。 */
export function recentDays(count: number, now = new Date()): Date[] {
	return Array.from({ length: count }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index)));
}

/** 面积图的渐变填充：从线条颜色渐隐到透明。 */
export function areaGradient(color: string, opacity = 0.25) {
	return new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: alpha(color, opacity) }, { offset: 1, color: alpha(color, 0) }]);
}
