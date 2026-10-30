/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NotAllowedError } from '@/core/commerce/types.js';
import { ProductImageService } from '@/core/product/ProductImageService.js';
import { commerceApiErrors } from '@/server/api/commerce-errors.js';
import { ApiError } from '@/server/api/error.js';

export const productImageIdSchema = { type: 'string', pattern: '^[a-f0-9]{32}$' } as const;

export const productImageSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { ...productImageIdSchema, optional: false, nullable: false },
		url: { type: 'string', optional: false, nullable: false },
		type: { type: 'string', optional: false, nullable: false },
		size: { type: 'integer', optional: false, nullable: false },
	},
} as const;

export const productImageApiErrors = {
	invalidImage: { message: 'Invalid marketplace product image.', code: 'INVALID_PRODUCT_IMAGE', id: '108358bd-2b0f-47aa-80f6-79f4c2747237' },
	imageLimit: { message: 'The unused product image limit has been reached.', code: 'PRODUCT_IMAGE_LIMIT', id: 'af156764-1cc6-4f72-8ef1-922e4c157cc4' },
	imageInUse: { message: 'This image is still used by a product.', code: 'PRODUCT_IMAGE_IN_USE', id: '89fce555-b85a-4a66-8b23-94b9391bad44' },
	accessDenied: { message: 'Reading drive files requires the read:drive permission.', code: 'ACCESS_DENIED', id: 'd0854cfb-5846-4244-a87f-7bd2238dd304', kind: 'permission' },
	notAllowed: commerceApiErrors.notAllowed,
} as const;

export function throwProductImageApiError(error: unknown): never {
	if (error instanceof ProductImageService.InvalidImageError) throw new ApiError(productImageApiErrors.invalidImage);
	if (error instanceof ProductImageService.ImageLimitError) throw new ApiError(productImageApiErrors.imageLimit);
	if (error instanceof ProductImageService.ImageInUseError) throw new ApiError(productImageApiErrors.imageInUse);
	if (error instanceof NotAllowedError) throw new ApiError(productImageApiErrors.notAllowed);
	throw error;
}
