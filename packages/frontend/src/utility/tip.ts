/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type TipTone = 'blue' | 'green' | 'purple' | 'gold' | 'red';

/** 打赏金额按档位配色，弹幕、头像和打赏列表共用。 */
export function tipTone(amount: number): TipTone {
	if (amount >= 100) return 'red';
	if (amount >= 50) return 'gold';
	if (amount >= 20) return 'purple';
	if (amount >= 10) return 'green';
	return 'blue';
}
