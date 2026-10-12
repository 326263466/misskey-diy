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
import { commerceApiErrors, throwCommerceApiError } from '@/server/api/commerce-errors.js';
import { packOrders } from '@/server/api/commerce-presenter.js';

export const meta = {
	tags: ['orders'], requireCredential: true, kind: 'read:account',
	limit: { duration: 60000, max: 120 },
	errors: { noSuchOrder: commerceApiErrors.noSuchOrder },
	res: orderSchema,
} as const;

export const paramDef = {
	type: 'object', properties: { orderId: orderIdSchema }, required: ['orderId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private orderService: OrderService,
		private catalogService: CatalogService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const order = await this.orderService.show(me.id, ps.orderId);
				return (await packOrders([order], this.catalogService, this.userEntityService, me))[0];
			} catch (error) {
				throwCommerceApiError(error);
			}
		});
	}
}
