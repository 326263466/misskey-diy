/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { CatalogService } from '@/core/shop/CatalogService.js';
import type { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { MiLocalUser } from '@/models/User.js';

async function participants(ids: (string | null)[], catalogService: CatalogService, userEntityService: UserEntityService, me: MiLocalUser) {
	const userIds = [...new Set(ids.filter((id): id is string => id != null))];
	const users = await catalogService.visibleParticipants(userIds);
	const packed = await userEntityService.packMany(users, me, { schema: 'UserLite' });
	return new Map(packed.map(user => [user.id, user]));
}

export async function packProducts<T extends { sellerId: string | null }>(products: T[], catalogService: CatalogService, userEntityService: UserEntityService, me: MiLocalUser) {
	const users = await participants(products.map(product => product.sellerId), catalogService, userEntityService, me);
	return products.map(product => ({ ...product, seller: product.sellerId ? users.get(product.sellerId) ?? null : null }));
}

export async function packOrders<T extends { sellerId: string | null; buyerId: string }>(orders: T[], catalogService: CatalogService, userEntityService: UserEntityService, me: MiLocalUser) {
	const users = await participants(orders.flatMap(order => [order.sellerId, order.buyerId]), catalogService, userEntityService, me);
	return orders.map(order => ({ ...order, seller: order.sellerId ? users.get(order.sellerId) ?? null : null, buyer: users.get(order.buyerId) ?? null }));
}
