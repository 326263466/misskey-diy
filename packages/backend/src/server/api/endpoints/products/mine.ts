/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ProductService } from '@/core/product/ProductService.js';
import { CatalogService } from '@/core/shop/CatalogService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { productSchema } from '@/server/api/commerce-schema.js';
import { packProducts } from '@/server/api/commerce-presenter.js';

export const meta = {
	tags: ['products'], requireCredential: true, kind: 'read:account',
	limit: { duration: 60000, max: 60 },
	res: { type: 'array', optional: false, nullable: false, items: productSchema },
} as const;

export const paramDef = {
	type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 } }, required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private productService: ProductService,
		private catalogService: CatalogService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const products = await this.productService.mine(me.id);
			return packProducts(products.slice(0, ps.limit), this.catalogService, this.userEntityService, me);
		});
	}
}
