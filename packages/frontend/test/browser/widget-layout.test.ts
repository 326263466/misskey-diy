/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import WidgetClock from '@/widgets/WidgetClock.vue';
import WidgetCalendar from '@/widgets/WidgetCalendar.vue';

const wordLocale = vi.hoisted(() => ({
	wordClockLayout: 'zh',
	wordClockGrid: '现在是凌晨时光上午下午晚上夜零一二三四五六七八九十一二点零一二三四五十零一二三四五六七八九时刻分秒',
}));
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: { _widgetOptions: { _clock: wordLocale }, _weekday: { friday: '星期五' }, _time: { second: '秒' }, today: '今天', thisMonth: '本月', thisYear: '今年' },
	tsx: { yearX: ({ year }: { year: number }) => `${year}年`, monthX: ({ month }: { month: number }) => `${month}月`, dayX: ({ day }: { day: number }) => `${day}日` },
} }));
vi.mock('@/os.js', () => ({ popup: vi.fn() }));
vi.mock('misskey-js', () => ({}));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/theme.js', () => ({ themeManager: { currentCompiledTheme: { bg: '#fff', panel: '#fff', fg: '#35404a', accent: '#81ab00' }, on: vi.fn(), off: vi.fn() } }));
vi.mock('@/utility/idle-render.js', () => ({ defaultIdlingRenderScheduler: { add: vi.fn(), delete: vi.fn() } }));
vi.mock('@/composables/use-lowres-time.js', () => ({ useLowresTime: () => ref(new Date(2026, 8, 25, 10, 38).getTime()), TIME_UPDATE_INTERVAL: 10000 }));

const fixtures: { app: App; host: HTMLElement }[] = [];

async function mountWidgets(width: number, design: 'linear' | 'digital' | 'words' = 'linear', size: 'small' | 'medium' | 'large' = 'medium') {
	const host = document.createElement('div');
	host.style.cssText = `width:${width}px;margin:24px;container-type:inline-size;`;
	document.body.append(host);
	const app = createApp({ render: () => [
		h(WidgetClock, { widget: { id: 'clock-layout', data: { design, size } } }),
		h(WidgetCalendar, { widget: { id: 'calendar-layout', data: {} } }),
	] });
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	return host;
}

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

describe('visible widget spacing', () => {
	test.each([240, 280, 325])('aligns the linear clock artwork with calendar content at %ipx', async width => {
		for (const size of ['small', 'medium', 'large'] as const) {
			const host = await mountWidgets(width, 'linear', size);
			const clock = host.querySelector('[data-testid="mkw-clock"]')!.getBoundingClientRect();
			const svg = host.querySelector('svg')!;
			const date = svg.querySelector('text')!.getBoundingClientRect();
			const track = svg.querySelector('path[d="M20 111H204"]')!.getBoundingClientRect();
			const calendar = host.querySelector('[data-testid="mkw-calendar"]')!;
			const calendarDate = calendar.querySelector('p')!.getBoundingClientRect();
			expect(date.left - clock.left).toBeCloseTo(18, 1);
			expect(track.left).toBeCloseTo(calendarDate.left, 1);
			expect(clock.right - track.right).toBeCloseTo(18, 1);
			expect(track.width).toBeCloseTo(width - 36, 1);
			const lastMeter = calendar.querySelectorAll('[class*="meterVal"]');
			expect(calendar.getBoundingClientRect().bottom - lastMeter[lastMeter.length - 1].getBoundingClientRect().bottom).toBeCloseTo(18, 1);
		}
	});

	test.each(['linear', 'digital', 'words'] as const)('keeps %s labels inside a narrow card while filling its content width', async design => {
		const host = await mountWidgets(240, design);
		const card = host.querySelector('[data-testid="mkw-clock"]')!.getBoundingClientRect();
		const svg = host.querySelector('svg')!;
		expect(svg.getBoundingClientRect().width).toBeCloseTo(204, 1);
		for (const text of svg.querySelectorAll('text')) {
			const bounds = text.getBoundingClientRect();
			expect(bounds.left).toBeGreaterThan(card.left);
			expect(bounds.right).toBeLessThan(card.right);
			expect(bounds.top).toBeGreaterThan(card.top);
			expect(bounds.bottom).toBeLessThan(card.bottom);
		}
	});

	test.each(['linear', 'words'] as const)('keeps %s typography at the same visual size as the card widens', async design => {
		const heights: number[] = [];
		for (const width of [240, 280, 325]) {
			const host = await mountWidgets(width, design);
			const svg = host.querySelector('svg')!;
			const text = design === 'linear' ? svg.querySelector('text[class*="shapeHero"]')! : svg.querySelector('text')!;
			heights.push(text.getBoundingClientRect().height);
		}
		expect(heights[0]).toBeGreaterThan(10);
		expect(heights[0]).toBeLessThan(design === 'linear' ? 45 : 22);
		for (const height of heights.slice(1)) expect(height).toBeCloseTo(heights[0], 1);
	});

	test('keeps digital glyph size fixed while centering the digits and the seconds readout', async () => {
		const heights: number[] = [];
		for (const width of [240, 280, 325]) {
			const host = await mountWidgets(width, 'digital');
			const card = host.querySelector('[data-testid="mkw-clock"]')!.getBoundingClientRect();
			const svg = host.querySelector('svg')!;
			const center = (card.left + card.right) / 2;
			const digits = [...host.querySelectorAll('[data-clock-digit]')].map(digit => digit.getBoundingClientRect());
			expect(digits).toHaveLength(4);
			for (const digit of digits) {
				expect(digit.width).toBeCloseTo(26, 1);
				expect(digit.height).toBeGreaterThan(54);
				expect(digit.height).toBeLessThan(57);
				heights.push(digit.height);
			}
			// The pairs stay symmetric around the colon, so widening the card cannot open up the middle gap.
			expect(digits[0].left - center).toBeCloseTo(-72, 1);
			expect(digits[3].right - center).toBeCloseTo(72, 1);
			expect(digits[1].left - digits[0].left).toBeCloseTo(34, 1);
			expect(digits[3].left - digits[2].left).toBeCloseTo(34, 1);
			expect(digits[2].left - digits[1].right).toBeCloseTo(24, 1);
			for (const dot of svg.querySelectorAll('circle')) {
				const bounds = dot.getBoundingClientRect();
				expect((bounds.left + bounds.right) / 2).toBeCloseTo(center, 1);
			}
			const ticks = [...svg.querySelectorAll('rect')].map(tick => tick.getBoundingClientRect());
			expect(ticks).toHaveLength(30);
			const seconds = svg.querySelector('text[class*="shapeSeconds"]')!.getBoundingClientRect();
			for (const tick of ticks) {
				expect(Math.abs((seconds.top + seconds.bottom) / 2 - (tick.top + tick.bottom) / 2)).toBeLessThan(1.5);
			}
			expect(seconds.left).toBeGreaterThan(ticks[ticks.length - 1].right);
		}
		for (const height of heights.slice(1)) expect(height).toBeCloseTo(heights[0], 1);
	});
});
