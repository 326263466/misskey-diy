/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ColumnOptions } from 'typeorm';

// PostgreSQL numeric 返回字符串；积分金额仍按两位小数运算。
export const coinColumn = {
	type: 'numeric', precision: 12, scale: 2,
	transformer: { to: (value: number) => value, from: (value: string) => Number(value) },
} satisfies ColumnOptions;
