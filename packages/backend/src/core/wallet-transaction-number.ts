/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomInt } from 'node:crypto';

/** 分段生成，避开 randomInt 的 48 位范围限制和 bigint 的有符号上限。 */
export function generateWalletTransactionNumber(): string {
	return `${randomInt(1_000_000_000, 9_000_000_000)}${String(randomInt(1_000_000_000)).padStart(9, '0')}`;
}
