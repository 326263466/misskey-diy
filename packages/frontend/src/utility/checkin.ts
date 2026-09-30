/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function shiftCheckinMonth(month: string, offset: number): string {
	const date = new Date(`${month}-01T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + offset);
	return date.toISOString().slice(0, 7);
}

export function checkinCalendar(month: string): (string | null)[] {
	const first = new Date(`${month}-01T00:00:00Z`);
	const last = new Date(`${shiftCheckinMonth(month, 1)}-01T00:00:00Z`);
	last.setUTCDate(0);
	const dates: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
	for (let day = 1; day <= last.getUTCDate(); day++) dates.push(`${month}-${String(day).padStart(2, '0')}`);
	while (dates.length % 7 !== 0) dates.push(null);
	return dates;
}

export function checkinDateInZone(value: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
	const get = (type: string): string => parts.find(part => part.type === type)!.value;
	return `${get('year')}-${get('month')}-${get('day')}`;
}
