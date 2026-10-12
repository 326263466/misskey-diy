/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateRedemptionCode(): string {
	// 32 字符表均匀映射随机字节，20 位提供 100 位随机强度。
	return Array.from(randomBytes(20), byte => alphabet[byte & 31]).join('');
}

export function formatRedemptionCode(value: string): string {
	return value.match(/.{5}/g)!.join('-');
}
