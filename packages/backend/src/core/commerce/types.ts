/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiProduct } from '@/models/Product.js';
import type { MiUser } from '@/models/User.js';

export const COMMERCE_MAX_QUANTITY = 1_000_000;
export const COMMERCE_MAX_ORDER_TOTAL = 2_000_000_000;
export const COMMERCE_MAX_PRODUCTS = 100;
export const COMMERCE_REQUEST_ID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
export type ProductInput = Pick<MiProduct, 'name' | 'description' | 'type' | 'category' | 'imageUrl' | 'unit' | 'price' | 'perUserLimit' | 'stockLimit' | 'deliveryText' | 'enabled'>;

export class NoSuchProductError extends Error {}
export class NoSuchOrderError extends Error {}
export class PriceChangedError extends Error {}
export class LimitError extends Error {}
export class InvalidProductError extends Error {}
export class ProductLimitError extends Error {}
export class NotAllowedError extends Error {}
export class RequestConflictError extends Error {}
export class InsufficientPointsError extends Error {}
export class SellerBalanceLimitError extends Error {}

export function canTrade(user: MiUser | null): user is MiUser {
	return user != null && user.host === null && !user.isSuspended && !user.isDeleted && !user.movedToUri && !user.username.includes('.');
}

export function purchaseAvailability(product: MiProduct, purchasedQuantity: number) {
	const remainingStock = product.stockLimit > 0 ? Math.max(0, product.stockLimit - Number(product.soldCount)) : null;
	const remainingAllowance = product.perUserLimit > 0 ? Math.max(0, product.perUserLimit - purchasedQuantity) : null;
	const maxQuantity = Math.min(COMMERCE_MAX_QUANTITY, Math.floor(COMMERCE_MAX_ORDER_TOTAL / product.price), remainingStock ?? COMMERCE_MAX_QUANTITY, remainingAllowance ?? COMMERCE_MAX_QUANTITY);
	const unavailableReason = remainingStock === 0 ? 'sold-out' : remainingAllowance === 0 ? 'purchase-limit' : null;
	return { maxQuantity, remainingStock, remainingAllowance, unavailableReason, purchasedQuantity };
}
