/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';
import type { MiOrder } from '@/models/Order.js';

/** 类型 + UTC 下单时间（秒）+ 六位随机十六进制值，在订单事务中保存。 */
export function generateOrderNumber(order: Pick<MiOrder, 'createdAt' | 'receipt'>): string {
	const prefix = order.receipt.type === 'physical' ? 'SW' : 'CDK';
	const time = order.createdAt.toISOString().replace(/[-:T]/g, '').slice(0, 14);
	return `${prefix}${time}${randomBytes(3).toString('hex')}`;
}
