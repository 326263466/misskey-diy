/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CatalogService } from '@/core/shop/CatalogService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { productIdSchema, productSchema } from '@/server/api/commerce-schema.js';
import { commerceApiErrors, throwCommerceApiError } from '@/server/api/commerce-errors.js';
import { packProducts } from '@/server/api/commerce-presenter.js';

export const meta = {
	tags: ['products'], requireCredential: true, kind: 'read:account',
	limit: { duration: 60000, max: 120 },
	errors: { noSuchProduct: commerceApiErrors.noSuchProduct },
	res: productSchema,
} as const;

export const paramDef = {
	type: 'object', properties: { productId: productIdSchema }, required: ['productId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private catalogService: CatalogService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const product = await this.catalogService.show(me.id, ps.productId);
				return (await packProducts([product], this.catalogService, this.userEntityService, me))[0];
			} catch (error) {
				throwCommerceApiError(error);
			}
		});
	}
}
