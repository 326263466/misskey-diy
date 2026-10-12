/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** 金额先转为整数分再运算，避免自动计算总额时产生浮点尾差。 */
export function toCoinUnits(coins: number): number {
	return Math.round(coins * 100);
}

export function isCoinAmount(coins: number): boolean {
	const units = toCoinUnits(coins);
	return Number.isSafeInteger(units) && units / 100 === coins;
}
