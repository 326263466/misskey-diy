/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type { Ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import WidgetTrends from '@/widgets/WidgetTrends.vue';
import { useLowresTime } from '@/composables/use-lowres-time.js';
import { mergeTrendsWithCache } from '@/utility/trends-cache.js';
import type { TrendsSnapshot } from '@/utility/trends-cache.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	readCache: vi.fn(),
	saveCache: vi.fn(),
	tick: undefined as (() => Promise<void>) | undefined,
}));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApiGet: mocks.api }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/components/MkContainer.vue', () => ({ default: {
	template: '<section><header><slot name="header"/></header><slot/></section>',
} }));
vi.mock('@/components/MkMiniChart.vue', () => ({ default: {
	props: ['src'], template: '<span data-testid="chart"/>',
} }));
vi.mock('@/utility/trends-cache.js', async importOriginal => ({
	...await importOriginal<typeof import('@/utility/trends-cache.js')>(),
	readTrendsCache: mocks.readCache,
	saveTrendsCache: mocks.saveCache,
}));
vi.mock('@/composables/use-lowres-time.js', async () => {
	const { ref } = await import('vue');
	const now = ref(0);
	return { useLowresTime: () => now };
});
vi.mock('@@/js/use-interval.js', async () => {
	const { onMounted } = await import('vue');
	return { useInterval: vi.fn((callback: () => Promise<void>) => {
		mocks.tick = callback;
		onMounted(callback);
	}) };
});

type Stats = Misskey.entities.HashtagsTrendResponse;
const initialTime = new Date('2026-09-29T10:00:00Z').getTime();
const now = useLowresTime() as Ref<number>;

function stat(tag = 'Misskey', usersCount = 3): Stats[number] {
	return { tag, usersCount, chart: [0, 1, usersCount] };
}

function snapshot(fetchedAt = initialTime - 60_000, stats = [stat('Earlier')]): TrendsSnapshot {
	return { entries: stats.map(stat => ({ stat, fetchedAt })) };
}

function renderWidget() {
	return render(WidgetTrends, { global: { stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		MkLoading: { template: '<span data-testid="loading"/>' },
		MkTime: { props: ['time'], template: '<time :data-time="time">{{ time }}</time>' },
	} } });
}

describe('trends widget', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(Date, 'now').mockReturnValue(initialTime);
		now.value = initialTime;
		mocks.readCache.mockReturnValue(null);
		mocks.api.mockResolvedValue([]);
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('keeps the heading and minute polling when no history is available', async () => {
		const view = renderWidget();
		await waitFor(() => expect(view.queryByTestId('loading')).toBeNull());
		expect(view.queryAllByRole('link')).toHaveLength(0);
		expect(view.container.querySelector('header')?.textContent).toBe(i18n.ts._widgets.trends);
		expect(useInterval).toHaveBeenCalledWith(expect.any(Function), 60_000, { immediate: true, afterMounted: true });
	});

	test('limits live rankings to five, encodes links and preserves zero-count presentation', async () => {
		const fresh = [stat('space / tag', 0), ...Array.from({ length: 7 }, (_, i) => stat(`tag${i}`))];
		mocks.api.mockResolvedValue(fresh);
		const view = renderWidget();
		await waitFor(() => expect(view.getAllByRole('link')).toHaveLength(5));
		expect(view.getByRole('link', { name: '#space / tag' }).getAttribute('href')).toBe('/tags/space%20%2F%20tag');
		expect(view.getAllByTestId('chart')).toHaveLength(5);
		expect(view.getByText(i18n.tsx.nUsersMentioned({ n: 0 }))).toBeTruthy();
		expect(mocks.saveCache).toHaveBeenCalledWith(mergeTrendsWithCache(fresh, null, initialTime));
	});

	test('retains old topics through pending, empty and failed refreshes without changing timestamps', async () => {
		const oneYear = 365 * 24 * 60 * 60 * 1000;
		const old = snapshot(initialTime - oneYear);
		mocks.readCache.mockReturnValue(old);
		const response = Promise.withResolvers<Stats>();
		mocks.api.mockReturnValue(response.promise);
		const view = renderWidget();
		expect(view.getByRole('link', { name: '#Earlier' })).toBeTruthy();
		now.value = initialTime + oneYear;
		vi.mocked(Date.now).mockReturnValue(now.value);
		await nextTick();
		expect(view.getByRole('link', { name: '#Earlier' })).toBeTruthy();
		response.resolve([]);
		await waitFor(() => expect(mocks.saveCache).toHaveBeenCalledWith(old));
		mocks.api.mockRejectedValue(new Error('offline'));
		mocks.tick!();
		await nextTick();
		await nextTick();
		expect(view.getByRole('link', { name: '#Earlier' })).toBeTruthy();
		expect(view.getByTestId('chart')).toBeTruthy();
		expect(mocks.saveCache).toHaveBeenCalledTimes(1);
	});

	test('puts new rankings first and only replaces retained topics when slots are filled', async () => {
		mocks.readCache.mockReturnValue(snapshot(initialTime - 365 * 24 * 60 * 60 * 1000, [stat('Earlier'), stat('Shared')]));
		mocks.api.mockResolvedValue([stat('Shared', 10), stat('New')]);
		const view = renderWidget();
		await waitFor(() => expect(view.getAllByRole('link').map(link => link.textContent)).toEqual(['#Shared', '#New', '#Earlier']));
		const fresh = Array.from({ length: 5 }, (_, i) => stat(`replacement${i}`));
		mocks.api.mockResolvedValue(fresh);
		mocks.tick!();
		await waitFor(() => expect(view.getAllByRole('link').map(link => link.textContent)).toEqual(fresh.map(entry => `#${entry.tag}`)));
	});
});
