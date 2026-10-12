/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckoutService } from '@/core/shop/CheckoutService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { orderFeeProperties, orderIdSchema, productIdSchema, redemptionCodeSchema, requestIdSchema, versionSchema } from '@/server/api/commerce-schema.js';
import { commerceApiErrors, throwCommerceApiError } from '@/server/api/commerce-errors.js';

export const meta = {
	tags: ['orders'], requireCredential: true, prohibitMoved: true, kind: 'write:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		limitExceeded: commerceApiErrors.limitExceeded,
		priceChanged: commerceApiErrors.priceChanged,
		noSuchProduct: commerceApiErrors.noSuchProduct,
		insufficientPoints: commerceApiErrors.insufficientPoints,
		requestConflict: commerceApiErrors.requestConflict,
		notAllowed: commerceApiErrors.notAllowed,
		sellerBalanceLimit: commerceApiErrors.sellerBalanceLimit,
		platformBalanceLimit: commerceApiErrors.platformBalanceLimit,
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			productId: { ...productIdSchema, optional: false, nullable: false },
			quantity: { type: 'integer', optional: false, nullable: false },
			points: { type: 'number', optional: false, nullable: false },
			...orderFeeProperties,
			purchased: { type: 'boolean', optional: false, nullable: false },
			orderId: { ...orderIdSchema, optional: false, nullable: false },
			deliveryText: { type: 'string', optional: false, nullable: false },
			redemptionCode: redemptionCodeSchema,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		productId: productIdSchema,
		quantity: { type: 'integer', minimum: 1, maximum: 1000000 },
		expectedPrice: { type: 'integer', minimum: 1, maximum: 1000000 },
		expectedVersion: versionSchema,
		requestId: requestIdSchema,
	},
	required: ['productId', 'quantity', 'requestId', 'expectedPrice', 'expectedVersion'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkoutService: CheckoutService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.checkoutService.purchase(me.id, ps.productId, ps.quantity, ps.requestId, ps.expectedPrice, ps.expectedVersion);
			} catch (error) {
				throwCommerceApiError(error);
			}
		});
	}
}
