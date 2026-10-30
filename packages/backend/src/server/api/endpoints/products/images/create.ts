/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { canTrade } from '@/core/commerce/types.js';
import { ProductImageService } from '@/core/product/ProductImageService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { productImageApiErrors, productImageSchema, throwProductImageApiError } from '@/server/api/product-image-schema.js';

export const meta = {
	tags: ['products'], requireCredential: true, prohibitMoved: true, kind: 'write:account',
	requireFile: true,
	limit: { key: 'products:images', duration: 60000, max: 30 },
	errors: {
		invalidImage: productImageApiErrors.invalidImage,
		imageLimit: productImageApiErrors.imageLimit,
		notAllowed: productImageApiErrors.notAllowed,
	},
	res: productImageSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private productImageService: ProductImageService,
	) {
		super(meta, paramDef, async (ps, me, token, file, cleanup) => {
			try {
				if (!canTrade(me)) throw new ApiError(meta.errors.notAllowed);
				return await this.productImageService.upload(me.id, file!.path);
			} catch (error) {
				throwProductImageApiError(error);
			} finally {
				cleanup!();
			}
		});
	}
}
