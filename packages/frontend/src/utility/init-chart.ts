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

/**
 * テーマに依存する Chart.js のグローバルデフォルトを現在のテーマから再適用する。
 * Chart.defaults はモジュールスコープで一度しか評価されないため、テーマ切り替え後に
 * チャートを作り直す場合は描画前にこれを呼ぶ必要がある。
 */
export function applyChartThemeDefaults() {
	// フォントカラー
	Chart.defaults.color = themeManager.currentCompiledTheme!.fg;

	Chart.defaults.borderColor = store.s.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
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
	);

	applyChartThemeDefaults();

	Chart.defaults.animation = false;
	Chart.defaults.locale = dateOnlyFormat.resolvedOptions().locale;
}
