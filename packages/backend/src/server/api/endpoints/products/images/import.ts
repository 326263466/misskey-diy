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
	limit: { key: 'products:images', duration: 60000, max: 30 },
	errors: {
		invalidImage: productImageApiErrors.invalidImage,
		imageLimit: productImageApiErrors.imageLimit,
		accessDenied: productImageApiErrors.accessDenied,
		notAllowed: productImageApiErrors.notAllowed,
	},
	res: productImageSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
		url: { type: 'string', maxLength: 2048, pattern: '^https?://[^\\s\\u0000]+$' },
	},
	required: [],
	oneOf: [{ required: ['fileId'] }, { required: ['url'] }],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private productImageService: ProductImageService,
	) {
		super(meta, paramDef, async (ps, me, token) => {
			try {
				if (!canTrade(me)) throw new ApiError(meta.errors.notAllowed);
				if (ps.fileId && token && !token.permission.includes('read:drive')) throw new ApiError(meta.errors.accessDenied);
				return await this.productImageService.import(me.id, ps);
			} catch (error) {
				throwProductImageApiError(error);
			}
		});
	}
}
