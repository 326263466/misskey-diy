/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { OrderService } from '@/core/order/OrderService.js';
import { CatalogService } from '@/core/shop/CatalogService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { orderIdSchema, orderSchema } from '@/server/api/commerce-schema.js';
import { packOrders } from '@/server/api/commerce-presenter.js';

export const meta = {
	tags: ['orders'], requireCredential: true, kind: 'read:account',
	limit: { duration: 60000, max: 120 },
	res: { type: 'array', optional: false, nullable: false, items: orderSchema },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
		untilId: orderIdSchema,
		mode: { type: 'string', enum: ['purchases', 'sales'], default: 'purchases' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private orderService: OrderService,
		private catalogService: CatalogService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const orders = await this.orderService.list(me.id, ps.limit, ps.untilId, ps.mode);
			return packOrders(orders, this.catalogService, this.userEntityService, me);
		});
	}
}
