/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { dateOnlyFormat } from '@@/js/intl-const.js';

const locale = dateOnlyFormat.resolvedOptions().locale;
const dayFormat = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' });
const monthFormat = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric' });

export function formatChartDate(value: number | string, unit: 'day' | 'month' = 'day'): string {
	return (unit === 'month' ? monthFormat : dayFormat).format(Number(value));
}
