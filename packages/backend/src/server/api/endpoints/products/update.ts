/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ProductService } from '@/core/product/ProductService.js';
import { CatalogService } from '@/core/shop/CatalogService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { productIdSchema, productInputProperties, productRequired, productSchema, versionSchema } from '@/server/api/commerce-schema.js';
import { commerceApiErrors, throwCommerceApiError } from '@/server/api/commerce-errors.js';
import { packProducts } from '@/server/api/commerce-presenter.js';

export const meta = {
	tags: ['products'], requireCredential: true, prohibitMoved: true, kind: 'write:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		invalidProduct: commerceApiErrors.invalidProduct,
		noSuchProduct: commerceApiErrors.noSuchProduct,
		priceChanged: commerceApiErrors.priceChanged,
		notAllowed: commerceApiErrors.notAllowed,
	},
	res: productSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: { ...productInputProperties, productId: productIdSchema, expectedVersion: versionSchema },
	required: [...productRequired, 'productId', 'expectedVersion'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private productService: ProductService,
		private catalogService: CatalogService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const product = await this.productService.update(me.id, ps.productId, ps, ps.expectedVersion);
				return (await packProducts([product], this.catalogService, this.userEntityService, me))[0];
			} catch (error) {
				throwCommerceApiError(error);
			}
		});
	}
}
