/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 商品采用独立标识格式，允许字母、数字、连字符和下划线。
export const productIdSchema = { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' } as const;
export const orderIdSchema = { type: 'string', format: 'misskey:id', minLength: 19, maxLength: 19, pattern: '^[0-9]{19}$' } as const;
export const requestIdSchema = { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' } as const;
export const versionSchema = { type: 'string', minLength: 1, maxLength: 64 } as const;

export const productInputProperties = {
	name: { type: 'string', minLength: 1, maxLength: 40, pattern: '^(?=[\\s\\S]*\\S)[^\\u0000]*$' },
	description: { type: 'string', maxLength: 200, pattern: '^[^\\u0000]*$' },
	type: { type: 'string', enum: ['physical', 'virtual'] },
	category: { type: 'string', maxLength: 20, pattern: '^[^\\u0000]*$' },
	imageUrl: { type: 'string', maxLength: 2048, pattern: '^(https?://[^\\s\\u0000]+)?$' },
	unit: { type: 'string', minLength: 1, maxLength: 8, pattern: '^(?=[\\s\\S]*\\S)[^\\u0000]*$' },
	price: { type: 'integer', minimum: 1, maximum: 1000000 },
	perUserLimit: { type: 'integer', minimum: 0, maximum: 1000000 },
	stockLimit: { type: 'integer', minimum: 0, maximum: 1000000 },
	deliveryText: { type: 'string', maxLength: 2000, pattern: '^[^\\u0000]*$' },
	enabled: { type: 'boolean' },
} as const;

export const productRequired = ['name', 'description', 'type', 'category', 'imageUrl', 'unit', 'price', 'perUserLimit', 'stockLimit', 'deliveryText', 'enabled'] as const;

export const productSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { ...productIdSchema, optional: false, nullable: false },
		name: { type: 'string', optional: false, nullable: false },
		description: { type: 'string', optional: false, nullable: false },
		price: { type: 'integer', optional: false, nullable: false },
		unit: { type: 'string', optional: false, nullable: false },
		type: { type: 'string', enum: ['physical', 'virtual'], optional: false, nullable: false },
		category: { type: 'string', optional: false, nullable: false },
		imageUrl: { type: 'string', optional: false, nullable: false },
		version: { type: 'string', optional: false, nullable: false },
		enabled: { type: 'boolean', optional: false, nullable: false },
		stockLimit: { type: 'integer', optional: false, nullable: false },
		perUserLimit: { type: 'integer', optional: false, nullable: false },
		maxQuantity: { type: 'integer', optional: false, nullable: false },
		purchasedQuantity: { type: 'integer', optional: false, nullable: false },
		remainingStock: { type: 'integer', optional: false, nullable: true },
		remainingAllowance: { type: 'integer', optional: false, nullable: true },
		unavailableReason: { type: 'string', optional: false, nullable: true },
		sellerId: { type: 'string', format: 'misskey:id', optional: false, nullable: true },
		seller: { type: 'object', ref: 'UserLite', optional: false, nullable: true },
		isOwner: { type: 'boolean', optional: false, nullable: false },
		deliveryText: { type: 'string', optional: false, nullable: true },
	},
} as const;

export const redemptionCodeSchema = { type: 'string', optional: false, nullable: true } as const;

export const feeRateBpsSchema = { type: 'integer', minimum: 0, maximum: 10000 } as const;
export const orderFeeProperties = {
	feeRateBps: { ...feeRateBpsSchema, optional: false, nullable: true },
	platformFee: { type: 'number', optional: false, nullable: true },
	sellerAmount: { type: 'number', optional: false, nullable: true },
} as const;

export const paymentSettingsSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		feeRateBps: { ...feeRateBpsSchema, optional: false, nullable: false },
		platformBalance: { type: 'number', optional: false, nullable: false },
	},
} as const;

export const orderSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { ...orderIdSchema, optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		productId: { ...productIdSchema, optional: false, nullable: false },
		name: { type: 'string', optional: false, nullable: false },
		type: { type: 'string', enum: ['physical', 'virtual'], optional: false, nullable: false },
		quantity: { type: 'integer', optional: false, nullable: false },
		total: { type: 'integer', optional: false, nullable: false },
		...orderFeeProperties,
		unit: { type: 'string', optional: false, nullable: false },
		deliveryText: { type: 'string', optional: false, nullable: false },
		sellerId: { type: 'string', format: 'misskey:id', optional: false, nullable: true },
		seller: { type: 'object', ref: 'UserLite', optional: false, nullable: true },
		buyerId: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
		buyer: { type: 'object', ref: 'UserLite', optional: false, nullable: true },
		transactionId: { type: 'string', format: 'misskey:id', optional: false, nullable: true },
		redemptionCode: redemptionCodeSchema,
	},
} as const;
