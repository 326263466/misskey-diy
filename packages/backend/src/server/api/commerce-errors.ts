/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	NoSuchProductError, NoSuchOrderError, PriceChangedError, LimitError, InvalidProductError, ProductLimitError,
	NotAllowedError, RequestConflictError, InsufficientPointsError, SellerBalanceLimitError,
} from '@/core/commerce/types.js';
import { PaymentService } from '@/core/payment/PaymentService.js';
import { ApiError } from '@/server/api/error.js';

export const commerceApiErrors = {
	limitExceeded: { message: 'The purchase limit or available stock has been exceeded.', code: 'MARKETPLACE_LIMIT_EXCEEDED', id: 'a66c374d-1290-4e9a-a422-a2c5476f33c7' },
	priceChanged: { message: 'The product has changed. Refresh and confirm again.', code: 'MARKETPLACE_PRODUCT_CHANGED', id: '943b2815-55d7-43d2-9889-d5e44175b701' },
	noSuchProduct: { message: 'No such marketplace product.', code: 'NO_SUCH_MARKETPLACE_PRODUCT', id: '5dfe0b3d-c00d-4378-bd3f-46bda65bc7a8' },
	insufficientPoints: { message: 'Not enough points.', code: 'MARKETPLACE_INSUFFICIENT_POINTS', id: '98f9c8c5-0f67-4b7b-90c6-5c60c3e8d8cb' },
	requestConflict: { message: 'This request ID was already used for a different operation.', code: 'MARKETPLACE_REQUEST_CONFLICT', id: 'a0c7b3ca-e4bb-4768-9ce6-43fd4cbe7091' },
	notAllowed: { message: 'This account cannot trade in the marketplace.', code: 'MARKETPLACE_NOT_ALLOWED', id: '7d16cc88-5983-4894-bf1e-2a6d1ea22110' },
	invalidProduct: { message: 'Invalid marketplace product settings.', code: 'INVALID_MARKETPLACE_PRODUCT', id: '4432de0f-7d53-4e50-ac62-db32bde73bb9' },
	productLimit: { message: 'The product publication limit has been reached.', code: 'MARKETPLACE_PRODUCT_LIMIT', id: '1a529f5b-2c82-43fc-bd69-3a0fa215d3c6' },
	noSuchOrder: { message: 'No such marketplace order.', code: 'NO_SUCH_MARKETPLACE_ORDER', id: '286a43d2-d05e-461d-8d2c-b13435f0159e' },
	sellerBalanceLimit: { message: 'The seller cannot receive this payment.', code: 'MARKETPLACE_SELLER_BALANCE_LIMIT', id: '9b8b3f29-f91e-4764-968f-f2f935422a32' },
	invalidPaymentSettings: { message: 'Invalid payment settings.', code: 'INVALID_PAYMENT_SETTINGS', id: '9f5386de-ef28-47b1-822f-6530d3f8acf3' },
	platformBalanceLimit: { message: 'The platform cannot receive this payment.', code: 'PLATFORM_BALANCE_LIMIT', id: 'd3c25ca7-d400-4dec-a9ca-62b4dc8f621d' },
} as const;

export function throwCommerceApiError(error: unknown): never {
	if (error instanceof LimitError) throw new ApiError(commerceApiErrors.limitExceeded);
	if (error instanceof PriceChangedError) throw new ApiError(commerceApiErrors.priceChanged);
	if (error instanceof NoSuchProductError) throw new ApiError(commerceApiErrors.noSuchProduct);
	if (error instanceof InsufficientPointsError) throw new ApiError(commerceApiErrors.insufficientPoints);
	if (error instanceof RequestConflictError) throw new ApiError(commerceApiErrors.requestConflict);
	if (error instanceof NotAllowedError) throw new ApiError(commerceApiErrors.notAllowed);
	if (error instanceof InvalidProductError) throw new ApiError(commerceApiErrors.invalidProduct);
	if (error instanceof ProductLimitError) throw new ApiError(commerceApiErrors.productLimit);
	if (error instanceof NoSuchOrderError) throw new ApiError(commerceApiErrors.noSuchOrder);
	if (error instanceof SellerBalanceLimitError) throw new ApiError(commerceApiErrors.sellerBalanceLimit);
	if (error instanceof PaymentService.InvalidSettingsError) throw new ApiError(commerceApiErrors.invalidPaymentSettings);
	if (error instanceof PaymentService.PlatformBalanceLimitError) throw new ApiError(commerceApiErrors.platformBalanceLimit);
	throw error;
}
