/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import tinycolor from 'tinycolor2';
import MkAnalogClock from '@/components/MkAnalogClock.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	ticks: new Set<() => void>(),
	onTheme: vi.fn(),
	offTheme: vi.fn(),
	theme: { bg: '#ffffff', panel: '#ffffff', fg: '#35404a', accent: '#81ab00' },
	wordLocale: {
		wordClockLayout: 'zh',
		wordClockGrid: '现在是凌晨时光上午下午晚上夜零一二三四五六七八九十一二点零一二三四五十零一二三四五六七八九时刻分秒',
	},
}));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _time: { second: '秒' }, _widgetOptions: { _clock: mocks.wordLocale } } } }));
vi.mock('@/theme.js', () => ({ themeManager: {
	currentCompiledTheme: mocks.theme,
	on: mocks.onTheme,
	off: mocks.offTheme,
} }));
vi.mock('@/utility/idle-render.js', () => ({ defaultIdlingRenderScheduler: {
	add: (tick: () => void) => mocks.ticks.add(tick),
	delete: (tick: () => void) => mocks.ticks.delete(tick),
} }));

function rotations(svg: SVGElement): number[] {
	return [...svg.querySelectorAll('[transform]')].map(element => Number(element.getAttribute('transform')!.match(/rotate\(([^ ]+)/)![1]));
}

async function tick() {
	for (const callback of [...mocks.ticks]) callback();
	await nextTick();
}

function isLit(element: Element): boolean {
	return /(?:^|[_\s])lit(?:[_\s]|$)/.test(element.getAttribute('class') ?? '');
}

describe('clock dial timekeeping', () => {
	beforeEach(() => {
		mocks.ticks.clear();
		vi.clearAllMocks();
		Object.assign(mocks.theme, { bg: '#ffffff', panel: '#ffffff', fg: '#35404a', accent: '#81ab00' });
		mocks.wordLocale.wordClockLayout = 'zh';
		mocks.wordLocale.wordClockGrid = '现在是凌晨时光上午下午晚上夜零一二三四五六七八九十一二点零一二三四五十零一二三四五六七八九时刻分秒';
	});
	afterEach(cleanup);

	test('uses linear by default', () => {
		const view = render(MkAnalogClock, { props: { now: () => new Date('2026-09-24T09:00:00Z'), offset: 0 } });
		expect(view.container.querySelector('svg')?.getAttribute('data-clock-design')).toBe('linear');
	});

	test.each([
		{ bg: '#f2f3f5', panel: '#ffffff', fg: '#5f5f5f', accent: '#ffff00' },
		{ bg: '#202124', panel: '#292b2f', fg: '#dadada', accent: '#86b300' },
		{ bg: '#202124', panel: '#ffffff', fg: '#35404a', accent: '#ffff00' },
	])('word periods remain readable on the $panel panel', theme => {
		Object.assign(mocks.theme, theme);
		const view = render(MkAnalogClock, { props: { design: 'words', offset: 0, now: () => new Date('2026-09-24T09:00:00Z') } });
		const svg = view.container.querySelector('svg')!;
		const color = svg.style.getPropertyValue('--MI-clockDial-period');
		expect(tinycolor.readability(theme.panel, color)).toBeGreaterThanOrEqual(4.5);
		expect([...svg.querySelectorAll('text')].filter(text => /(?:^|[_\s])period(?:[_\s]|$)/.test(text.getAttribute('class') ?? '')).map(text => text.textContent).join('')).toBe('上午');
	});

	test.each(['linear', 'words', 'digital', 'orbit', 'hud', 'satellite'] as const)('%s colors update before the theme transition finishes', async design => {
		const view = render(MkAnalogClock, { props: { design, offset: 0 } });
		const svg = view.container.querySelector('svg')!;
		const lightColor = svg.style.getPropertyValue('--MI-clockDial-period');
		Object.assign(mocks.theme, { bg: '#202124', panel: '#292b2f', fg: '#dadada', accent: '#86b300' });
		mocks.onTheme.mock.calls.find(([event]) => event === 'themeChanging')![1]();
		await nextTick();
		const darkColor = svg.style.getPropertyValue('--MI-clockDial-period');
		expect(darkColor).not.toBe(lightColor);
		expect(tinycolor.readability(mocks.theme.panel, darkColor)).toBeGreaterThanOrEqual(4.5);
	});

	test.each(['orbit', 'hud', 'satellite'] as const)(
		'%s keeps ticking forward through 59 → 0 → 1',
		async design => {
			let now = new Date('2026-09-24T09:08:59Z');
			const view = render(MkAnalogClock, { props: { design, offset: 0, now: () => new Date(now.getTime()) } });
			const svg = view.container.querySelector('svg')!;
			expect(svg.getAttribute('data-clock-design')).toBe(design);
			expect(mocks.ticks.size).toBe(1);
			let previousMarkup = svg.innerHTML;
			let previousRotations = rotations(svg);
			for (const time of ['2026-09-24T09:09:00Z', '2026-09-24T09:09:01Z']) {
				now = new Date(time);
				await tick();
				expect(mocks.ticks.size).toBe(1);
				expect(svg.innerHTML).not.toBe(previousMarkup);
				if (design !== 'hud') {
					const nextRotations = rotations(svg);
					const changes = nextRotations.map((angle, index) => (angle - previousRotations[index] + 360) % 360);
					expect(changes.some(change => Math.abs(change - 6) < 0.01)).toBe(true);
					expect(changes.every(change => Math.abs(change) < 7)).toBe(true);
					previousRotations = nextRotations;
				}
				previousMarkup = svg.innerHTML;
			}
			view.unmount();
			expect(mocks.ticks.size).toBe(0);
			expect(mocks.offTheme).toHaveBeenCalledWith('themeChanging', expect.any(Function));
		},
	);

	test.each(['orbit', 'satellite'] as const)('%s advances smoothly within a second and across a minute', async design => {
		let now = new Date('2026-09-24T13:05:07.500Z');
		const view = render(MkAnalogClock, { props: { design, offset: 0, now: () => new Date(now.getTime()) } });
		const svg = view.container.querySelector('svg')!;
		const seconds = svg.querySelector('g[transform]')!;
		const secondsAngle = () => Number(seconds.getAttribute('transform')!.match(/rotate\(([^ ]+)/)![1]);
		expect(secondsAngle()).toBeCloseTo(45);
		const before = rotations(svg);
		now = new Date('2026-09-24T13:05:07.600Z');
		await tick();
		expect(secondsAngle()).toBeCloseTo(45.6);
		const movingHands = rotations(svg).map((angle, index) => angle - before[index]).filter(change => change > 0);
		expect(movingHands).toHaveLength(3);
		expect(movingHands.every(change => change <= 0.601)).toBe(true);

		now = new Date('2026-09-24T13:05:59.900Z');
		await tick();
		const beforeRollover = secondsAngle();
		expect(beforeRollover).toBeCloseTo(359.4);
		now = new Date('2026-09-24T13:06:00.100Z');
		await tick();
		expect(secondsAngle()).toBeCloseTo(0.6);
		expect((secondsAngle() - beforeRollover + 360) % 360).toBeCloseTo(1.2);
		expect(mocks.ticks.size).toBe(1);
	});

	test.each(['orbit', 'satellite'] as const)('%s keeps the preview hand widths by default and supports thin and thick hands', async design => {
		const view = render(MkAnalogClock, { props: { design, offset: 0, now: () => new Date('2026-09-24T13:05:07.500Z') } });
		const hourHand = view.container.querySelector(`line[y1="${design === 'orbit' ? 94 : 91}"]`)!;
		const minuteHand = view.container.querySelector(`line[y1="${design === 'orbit' ? 95 : 97}"]`)!;
		const widths = () => [hourHand, minuteHand].map(hand => Number(hand.getAttribute('stroke-width')));
		const normal = design === 'orbit' ? [3.3, 2] : [2.6, 2];
		expect(widths()).toEqual(normal);
		await view.rerender({ thickness: 0.1 });
		widths().forEach((width, i) => expect(width).toBeCloseTo(normal[i] * 0.5));
		await view.rerender({ thickness: 0.3 });
		widths().forEach((width, i) => expect(width).toBeCloseTo(normal[i] * 1.5));
	});

	test('linear cursors advance within a second and wrap at the end of each track', async () => {
		let now = new Date('2026-09-24T13:59:59.800Z');
		const view = render(MkAnalogClock, { props: { design: 'linear', offset: 0, now: () => new Date(now.getTime()) } });
		const svg = view.container.querySelector('svg')!;
		expect(svg.hasAttribute('viewBox')).toBe(false);
		expect(view.getByText('00').getAttribute('text-anchor')).toBe('start');
		expect(view.getByText('60').getAttribute('text-anchor')).toBe('end');
		const cursor = svg.querySelector('[data-clock-second-marker]')!;
		const before = parseFloat(cursor.getAttribute('cx')!);
		now = new Date('2026-09-24T13:59:59.900Z');
		await tick();
		expect(parseFloat(cursor.getAttribute('cx')!) - before).toBeCloseTo(100 / 600);
		now = new Date('2026-09-24T14:00:00.100Z');
		await tick();
		expect(parseFloat(cursor.getAttribute('cx')!)).toBeCloseTo(100 / 600);
		expect(svg.getAttribute('aria-label')).toBe('14:00:00');
		expect(parseFloat(svg.querySelector('[data-clock-minute-marker]')!.getAttribute('x')!)).toBeCloseTo(0.1 / 3600 * 100);
		expect(mocks.ticks.size).toBe(1);
		view.unmount();
		expect(mocks.ticks.size).toBe(0);
	});

	test('digital face lights the seven-segment digits and changes date at local midnight', async () => {
		let now = new Date('2026-09-24T15:59:59Z');
		const view = render(MkAnalogClock, { props: { design: 'digital', offset: 480, now: () => new Date(now.getTime()) } });
		const svg = view.container.querySelector('svg')!;
		const segments = () => [...svg.querySelectorAll('[data-clock-digit]')].map(group => [...group.querySelectorAll('polygon')].flatMap((polygon, i) => isLit(polygon) ? [i] : []));
		expect(svg.getAttribute('aria-label')).toBe('23:59:59');
		expect(segments()).toEqual([[0, 1, 3, 4, 6], [0, 1, 2, 3, 6], [0, 2, 3, 5, 6], [0, 1, 2, 3, 5, 6]]);
		now = new Date('2026-09-24T16:00:00Z');
		await tick();
		expect(svg.getAttribute('aria-label')).toBe('00:00:00');
		expect(view.getByText('09/25')).toBeTruthy();
		expect(segments()).toEqual(Array.from({ length: 4 }, () => [0, 1, 2, 3, 4, 5]));
	});

	test.each([
		{ layout: 'zh', grid: '现在是凌晨时光上午下午晚上夜零一二三四五六七八九十一二点零一二三四五十零一二三四五六七八九时刻分秒', expected: '现在是下午一点二十五分' },
		{ layout: 'ja', grid: '現在は静かな時午前午後夜の空零一二三四五六七八九十一二時零一二三四五十零一二三四五六七八九時刻分秒', expected: '現在は午後一時二十五分' },
		{ layout: 'en', grid: 'ITLISASTIMEACQUARTERDCTWENTYFIVEXHALFBTENFTOPASTERUNINEONESIXTHREEFOURFIVETWOEIGHTELEVENSEVENTWELVETENSEOCLOCK', expected: 'ITISTWENTYFIVEPASTONE' },
	])('words face uses the $layout grid and language', ({ layout, grid, expected }) => {
		mocks.wordLocale.wordClockLayout = layout;
		mocks.wordLocale.wordClockGrid = grid;
		const view = render(MkAnalogClock, { props: { design: 'words', offset: 480, now: () => new Date('2026-09-24T05:25:07Z') } });
		const svg = view.container.querySelector('svg')!;
		expect(svg.getAttribute('aria-label')).toBe('13:25:07');
		expect([...svg.querySelectorAll('text')].filter(isLit).map(text => text.textContent).join('')).toBe(expected);
	});

	test.each([
		{ minute: '00', expected: '零' },
		{ minute: '01', expected: '零一' },
		{ minute: '06', expected: '零六' },
		{ minute: '09', expected: '零九' },
		{ minute: '10', expected: '十' },
		{ minute: '20', expected: '二十' },
	])('Chinese words display minute $minute as $expected', ({ minute, expected }) => {
		const view = render(MkAnalogClock, { props: { design: 'words', offset: 0, now: () => new Date(`2026-09-24T03:${minute}:00Z`) } });
		expect([...view.container.querySelectorAll('text')].filter(isLit).map(text => text.textContent).join('')).toBe(`现在是凌晨三点${expected}分`);
	});

	test.each([
		{ layout: 'zh', grid: '現在是凌晨時光上午下午晚上夜零一二三四五六七八九十一二點零一二三四五十零一二三四五六七八九時刻分秒', expected: '現在是凌晨三點零六分' },
		{ layout: 'ja', grid: '現在は静かな時午前午後夜の空零一二三四五六七八九十一二時零一二三四五十零一二三四五六七八九時刻分秒', expected: '現在は午前三時六分' },
	])('leading zero follows the $layout language rule', ({ layout, grid, expected }) => {
		mocks.wordLocale.wordClockLayout = layout;
		mocks.wordLocale.wordClockGrid = grid;
		const view = render(MkAnalogClock, { props: { design: 'words', offset: 0, now: () => new Date('2026-09-24T03:06:00Z') } });
		expect([...view.container.querySelectorAll('text')].filter(isLit).map(text => text.textContent).join('')).toBe(expected);
	});

	test('English words and minute dots stay accurate when the spoken hour crosses midnight', async () => {
		mocks.wordLocale.wordClockLayout = 'en';
		mocks.wordLocale.wordClockGrid = 'ITLISASTIMEACQUARTERDCTWENTYFIVEXHALFBTENFTOPASTERUNINEONESIXTHREEFOURFIVETWOEIGHTELEVENSEVENTWELVETENSEOCLOCK';
		let now = new Date('2026-09-24T23:59:59Z');
		const view = render(MkAnalogClock, { props: { design: 'words', offset: 0, now: () => new Date(now.getTime()) } });
		const svg = view.container.querySelector('svg')!;
		const phrase = () => [...svg.querySelectorAll('text')].filter(isLit).map(text => text.textContent).join('');
		expect(phrase()).toBe('ITISFIVETOTWELVE');
		expect([...svg.querySelectorAll('circle')].filter(isLit)).toHaveLength(4);
		now = new Date('2026-09-25T00:00:00Z');
		await tick();
		expect(phrase()).toBe('ITISTWELVEOCLOCK');
		expect([...svg.querySelectorAll('circle')].filter(isLit)).toHaveLength(0);
	});

	test('HUD keeps the preview content in 24-hour format', () => {
		const view = render(MkAnalogClock, { props: {
			design: 'hud', offset: 0, now: () => new Date('2026-09-24T13:05:07.500Z'),
		} });
		expect([...view.container.querySelectorAll('text')].map(text => text.textContent)).toEqual(['09/24', '13:05', `07 ${i18n.ts._time.second}`]);
	});

	test.each([
		{ time: '2026-09-24T23:45:00Z', offset: 120, date: '09/25', clock: '01:45' },
		{ time: '2026-09-25T00:15:00Z', offset: -120, date: '09/24', clock: '22:15' },
	])('HUD applies offset=$offset to both date and time', ({ time, offset, date, clock }) => {
		const view = render(MkAnalogClock, { props: { design: 'hud', offset, now: () => new Date(time) } });
		expect(view.getByText(date)).toBeTruthy();
		expect(view.getByText(clock)).toBeTruthy();
	});

	test('HUD updates the date at midnight in the configured timezone', async () => {
		let now = new Date('2026-09-24T15:59:59Z');
		const view = render(MkAnalogClock, { props: { design: 'hud', offset: 480, now: () => new Date(now.getTime()) } });
		expect(view.getByText('09/24')).toBeTruthy();
		expect(view.getByText('23:59')).toBeTruthy();
		now = new Date('2026-09-24T16:00:00Z');
		await tick();
		expect(view.getByText('09/25')).toBeTruthy();
		expect(view.getByText('00:00')).toBeTruthy();
	});
});
