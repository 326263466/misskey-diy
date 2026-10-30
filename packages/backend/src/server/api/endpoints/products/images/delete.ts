/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ProductImageService } from '@/core/product/ProductImageService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { productImageApiErrors, productImageIdSchema, throwProductImageApiError } from '@/server/api/product-image-schema.js';

export const meta = {
	tags: ['products'], requireCredential: true, prohibitMoved: true, kind: 'write:account',
	limit: { duration: 60000, max: 60 },
	errors: {
		imageInUse: productImageApiErrors.imageInUse,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { imageId: productImageIdSchema },
	required: ['imageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private productImageService: ProductImageService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.productImageService.deleteUnused(ps.imageId, me.id);
			} catch (error) {
				throwProductImageApiError(error);
			}
		});
	}
}
