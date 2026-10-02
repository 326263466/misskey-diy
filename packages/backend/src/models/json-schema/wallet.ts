/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { WALLET_TRANSACTION_TYPES } from '@/models/WalletTransaction.js';

export const walletSettingsSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		exchangeEnabled: { type: 'boolean', optional: false, nullable: false },
		exchangeRate: { type: 'integer', optional: false, nullable: false },
	},
} as const;

export const walletSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		balance: { type: 'integer', optional: false, nullable: false },
		reservedBalance: { type: 'integer', optional: false, nullable: false },
		points: { type: 'integer', optional: false, nullable: false },
		...walletSettingsSchema.properties,
	},
} as const;

export const walletTransactionSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { type: 'string', format: 'id', optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		type: { type: 'string', enum: WALLET_TRANSACTION_TYPES, optional: false, nullable: false },
		amount: { type: 'integer', optional: false, nullable: false },
		balance: { type: 'integer', optional: false, nullable: false },
		description: { type: 'string', optional: false, nullable: true },
		relatedId: { type: 'string', format: 'id', optional: false, nullable: true },
		pointsSpent: { type: 'integer', optional: false, nullable: true },
		actorId: { type: 'string', format: 'id', optional: false, nullable: true },
	},
} as const;
