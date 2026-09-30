/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { checkinCalendar, checkinDateInZone, shiftCheckinMonth } from '@/utility/checkin.js';

describe('check-in calendar dates', () => {
	test('aligns February 2024 to Sunday-first weeks and includes leap day', () => {
		const dates = checkinCalendar('2024-02');
		expect(dates.slice(0, 5)).toEqual([null, null, null, null, '2024-02-01']);
		expect(dates.filter(Boolean)).toHaveLength(29);
		expect(dates.at(-3)).toBe('2024-02-29');
		expect(dates.slice(-2)).toEqual([null, null]);
		expect(dates).toHaveLength(35);
	});

	test.each([['1900-02', 28], ['2000-02', 29], ['2025-02', 28], ['2026-08', 31]] as const)('uses the correct Gregorian month length for %s', (month, days) => {
		const dates = checkinCalendar(month);
		expect(dates.filter(Boolean)).toHaveLength(days);
		expect(dates.filter(Boolean).at(-1)).toBe(`${month}-${days}`);
		expect(dates.length % 7).toBe(0);
	});

	test('keeps a Saturday-starting 31-day month in six complete weeks', () => {
		const dates = checkinCalendar('2026-08');
		expect(dates).toHaveLength(42);
		expect(dates[6]).toBe('2026-08-01');
		expect(dates[36]).toBe('2026-08-31');
	});

	test('navigates across years without month-end rollover', () => {
		expect(shiftCheckinMonth('2026-01', -1)).toBe('2025-12');
		expect(shiftCheckinMonth('2025-12', 1)).toBe('2026-01');
		expect(shiftCheckinMonth('2024-03', -1)).toBe('2024-02');
		expect(shiftCheckinMonth('2024-02', 12)).toBe('2025-02');
	});

	test('uses the server time zone at midnight and year boundaries', () => {
		const before = new Date('2025-12-31T15:59:59Z');
		const after = new Date('2025-12-31T16:00:00Z');
		expect(checkinDateInZone(before, 'Asia/Shanghai')).toBe('2025-12-31');
		expect(checkinDateInZone(after, 'Asia/Shanghai')).toBe('2026-01-01');
		expect(checkinDateInZone(after, 'UTC')).toBe('2025-12-31');
		expect(checkinDateInZone(new Date('2024-03-01T02:00:00Z'), 'America/New_York')).toBe('2024-02-29');
	});
});
