/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import type { ChartConfiguration, ChartType, Scale, TooltipItem, TooltipModel } from 'chart.js';
import locales from 'i18n';
import MkChart from '@/components/MkChart.vue';
import MkHeatmap from '@/components/MkHeatmap.vue';
import MkRetentionHeatmap from '@/components/MkRetentionHeatmap.vue';
import OverviewActiveUsers from '@/pages/admin/overview.active-users.vue';
import OverviewApRequests from '@/pages/admin/overview.ap-requests.vue';
import { updateI18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	// Chart is invoked with new, so this mock must be constructible.
	// eslint-disable-next-line prefer-arrow-callback
	chart: vi.fn(function (_canvas: HTMLCanvasElement, _config: ChartConfiguration) {
		return { destroy: vi.fn() };
	}),
}));

vi.mock('chart.js', () => ({ Chart: mocks.chart }));
vi.mock('@/utility/init-chart.js', () => ({ initChart: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api, misskeyApiGet: mocks.api }));
vi.mock('@/composables/use-chart-tooltip.js', () => ({ useChartTooltip: () => ({ handler: vi.fn() }) }));
vi.mock('@/store.js', () => ({ store: { s: { darkMode: false } } }));
vi.mock('@@/js/intl-const.js', async importOriginal => ({
	...await importOriginal<typeof import('@@/js/intl-const.js')>(),
	dateOnlyFormat: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }),
	dateTimeFormat: new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
	}),
}));

const global = { stubs: { MkLoading: true, MkChartLegend: true } };
const timestamp = new Date(2025, 11, 31, 13, 14, 15).getTime();

function tickLabel(config: ChartConfiguration, axis: string, value: number): string | string[] | number | number[] | null | undefined {
	return config.options!.scales![axis]!.ticks!.callback!.call({} as Scale, value, 0, []);
}

function tooltipTitle(config: ChartConfiguration, dataIndex = 0, x?: number): string | string[] | void {
	return config.options!.plugins!.tooltip!.callbacks!.title!.call({} as TooltipModel<ChartType>, [{
		dataset: config.data.datasets[0],
		dataIndex,
		parsed: { x },
	} as TooltipItem<ChartType>]);
}

beforeEach(() => {
	vi.clearAllMocks();
	updateI18n(locales['zh-CN']);
});

afterEach(() => {
	cleanup();
	updateI18n(locales['en-US']);
});

describe('chart localization', () => {
	test('localizes the dashboard active user dates', async () => {
		mocks.api.mockResolvedValue({ read: [2], write: [1] });
		render(OverviewActiveUsers, { global });
		await waitFor(() => expect(mocks.chart).toHaveBeenCalledOnce());
		const config = mocks.chart.mock.lastCall![1];
		expect(tickLabel(config, 'x', timestamp)).toBe('12/31');
		expect(tooltipTitle(config, 0, timestamp)).toBe('2025/12/31');
	});

	test('localizes both dashboard ActivityPub chart tooltips and the visible date axis', async () => {
		mocks.api.mockResolvedValue({ deliverSucceeded: [2], deliverFailed: [1], inboxReceived: [3] });
		render(OverviewApRequests, { global });
		await waitFor(() => expect(mocks.chart).toHaveBeenCalledTimes(2));
		const [outgoing, incoming] = mocks.chart.mock.calls.map(call => call[1]);
		expect(tickLabel(outgoing, 'x', timestamp)).toBe('12/31');
		expect(tooltipTitle(outgoing, 0, timestamp)).toBe('2025/12/31');
		expect(tooltipTitle(incoming, 0, timestamp)).toBe('2025/12/31');
	});

	test.each(['day', 'hour'] as const)('localizes the %s chart axis and tooltip without changing the calendar year', async span => {
		mocks.api.mockResolvedValue({ local: { total: [2] }, remote: { total: [3] } });
		render(MkChart, { props: { src: 'notes-total', span, detailed: true, nowForChromatic: timestamp }, global });
		await waitFor(() => expect(mocks.chart).toHaveBeenCalledOnce());
		const config = mocks.chart.mock.lastCall![1];
		expect(tickLabel(config, 'x', timestamp)).toBe(span === 'day' ? '2025/12' : '12/31');
		expect(tooltipTitle(config, 0, timestamp)).toBe(span === 'day' ? '2025/12/31' : '2025/12/31 13:14:15');
	});

	test('labels heatmap weekdays and tooltip data in Chinese', async () => {
		mocks.api.mockResolvedValue({ readWrite: [2] });
		render(MkHeatmap, { props: { src: 'active-users' }, global });
		await waitFor(() => expect(mocks.chart).toHaveBeenCalledOnce());
		const config = mocks.chart.mock.lastCall![1];
		expect([1, 3, 5].map(day => tickLabel(config, 'y', day))).toEqual(['周一', '周三', '周五']);
		const point = config.data.datasets[0].data[0] as unknown as { t: number };
		expect(tooltipTitle(config)).toBe(new Intl.DateTimeFormat('zh-CN').format(point.t));
		expect(config.data.datasets[0].label).toBe('活跃用户数');
		expect(config.options!.plugins!.tooltip!.callbacks!.label!.call({} as TooltipModel<ChartType>, {
			dataset: config.data.datasets[0],
			dataIndex: 0,
		} as TooltipItem<ChartType>)).toEqual(['活跃用户数: 2']);
	});

	test('localizes the retention time axis instead of using the English adapter default', async () => {
		mocks.api.mockResolvedValue([{ createdAt: '2025-12-31T00:00:00.000Z', users: 2, data: {} }]);
		render(MkRetentionHeatmap, { global });
		await waitFor(() => expect(mocks.chart).toHaveBeenCalledOnce());
		const config = mocks.chart.mock.lastCall![1];
		expect(tickLabel(config, 'y', timestamp)).toBe('12/31');
		expect(config.data.datasets[0].label).toBe('留存用户');
	});
});
