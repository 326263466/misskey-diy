/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { Chart } from 'chart.js';
import type { CartesianScaleOptions } from 'chart.js';
import { initChart } from '@/utility/init-chart.js';

vi.mock('chartjs-plugin-zoom', () => ({ default: { id: 'zoom' } }));
vi.mock('@@/js/config.js', () => ({ lang: 'zh-CN' }));

vi.hoisted(() => {
	Object.assign(globalThis, { _LANGS_: [['zh-CN', '简体中文']], _VERSION_: 'test', _DEV_: false });
});

const mocks = vi.hoisted(() => ({
	listeners: new Set<() => void>(),
	theme: { fg: '#112233', accent: '#88aa00' },
	store: { darkMode: false },
}));
vi.mock('@/theme.js', () => ({ themeManager: {
	currentCompiledTheme: mocks.theme,
	on: (_event: string, callback: () => void) => mocks.listeners.add(callback),
	off: (_event: string, callback: () => void) => mocks.listeners.delete(callback),
} }));
vi.mock('@/store.js', () => ({ store: { s: mocks.store } }));
vi.mock('@@/js/intl-const.js', () => ({ dateOnlyFormat: new Intl.DateTimeFormat('zh-CN') }));

afterEach(() => {
	for (const chart of Object.values(Chart.instances)) chart.destroy();
	document.body.replaceChildren();
});

test('existing canvas charts change color before transition completion and remove listeners on destroy', () => {
	initChart();
	const canvas = document.createElement('canvas');
	document.body.append(canvas);
	const chart = new Chart(canvas, {
		type: 'bar',
		data: { labels: ['one'], datasets: [{ data: [1], backgroundColor: () => mocks.theme.accent }] },
		options: { responsive: false },
	});
	expect(chart.getDatasetMeta(0).data[0].options.backgroundColor).toBe('#88aa00');
	const update = vi.spyOn(chart, 'update');
	mocks.theme.fg = '#eeeeee';
	mocks.theme.accent = '#ff6600';
	mocks.store.darkMode = true;
	for (const callback of mocks.listeners) callback();
	expect(update).toHaveBeenCalledWith('none');
	expect(chart.getDatasetMeta(0).data[0].options.backgroundColor).toBe('#ff6600');
	expect((chart.scales.x.options as CartesianScaleOptions).ticks.color).toBe('#eeeeee');
	expect((chart.scales.x.options as CartesianScaleOptions).grid.color).toBe('rgba(255, 255, 255, 0.1)');
	chart.destroy();
	expect(mocks.listeners.size).toBe(0);
});
