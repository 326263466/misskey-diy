/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	Chart,
	ArcElement,
	LineElement,
	BarElement,
	PointElement,
	BarController,
	LineController,
	DoughnutController,
	CategoryScale,
	LinearScale,
	TimeScale,
	Legend,
	Title,
	Tooltip,
	SubTitle,
	Filler,
} from 'chart.js';
import gradient from 'chartjs-plugin-gradient';
import zoomPlugin from 'chartjs-plugin-zoom';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { dateOnlyFormat } from '@@/js/intl-const.js';
import { themeManager } from '@/theme.js';
import { store } from '@/store.js';
import 'chartjs-adapter-date-fns';

const themeListeners = new WeakMap<Chart, () => void>();
const themePlugin = {
	id: 'misskeyTheme',
	afterInit(chart: Chart) {
		const update = () => {
			if (!chart.ctx) return;
			applyChartThemeDefaults();
			chart.update('none');
		};
		themeListeners.set(chart, update);
		themeManager.on('themeChanging', update);
	},
	afterDestroy(chart: Chart) {
		const update = themeListeners.get(chart);
		if (update) themeManager.off('themeChanging', update);
		themeListeners.delete(chart);
	},
};

// 坐标轴会缓存默认值，使用回调让已创建的图表也能读取新主题。
export function applyChartThemeDefaults() {
	Chart.defaults.color = themeManager.currentCompiledTheme!.fg;

	Chart.defaults.borderColor = store.s.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
	Chart.defaults.set('scale', {
		ticks: { color: () => Chart.defaults.color },
		title: { color: () => Chart.defaults.color },
		grid: { color: () => Chart.defaults.borderColor },
		border: { color: () => Chart.defaults.borderColor },
	});
	Chart.defaults.set('plugins.legend.labels', { color: () => Chart.defaults.color });
	Chart.defaults.set('plugins.title', { color: () => Chart.defaults.color });
	Chart.defaults.set('plugins.subtitle', { color: () => Chart.defaults.color });
}

export function initChart() {
	Chart.register(
		ArcElement,
		LineElement,
		BarElement,
		PointElement,
		BarController,
		LineController,
		DoughnutController,
		CategoryScale,
		LinearScale,
		TimeScale,
		Legend,
		Title,
		Tooltip,
		SubTitle,
		Filler,
		MatrixController, MatrixElement,
		zoomPlugin,
		gradient,
		themePlugin,
	);

	applyChartThemeDefaults();

	Chart.defaults.animation = false;
	Chart.defaults.locale = dateOnlyFormat.resolvedOptions().locale;
}
