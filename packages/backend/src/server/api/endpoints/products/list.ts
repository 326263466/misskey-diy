/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CatalogService } from '@/core/shop/CatalogService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { productIdSchema, productSchema } from '@/server/api/commerce-schema.js';
import { packProducts } from '@/server/api/commerce-presenter.js';

export const meta = {
	tags: ['products'], requireCredential: true, kind: 'read:account',
	limit: { duration: 60000, max: 120 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			points: { type: 'number', optional: false, nullable: false },
			products: { type: 'array', optional: false, nullable: false, items: productSchema },
			nextId: { ...productIdSchema, optional: false, nullable: true },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
		untilId: productIdSchema,
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private catalogService: CatalogService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const result = await this.catalogService.list(me.id, ps.limit, ps.untilId);
			return { ...result, products: await packProducts(result.products, this.catalogService, this.userEntityService, me) };
		});
	}
}
