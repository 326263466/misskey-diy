/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { WALLET_TRANSACTION_TYPES } from '@/models/WalletTransaction.js';

export const walletSettingsSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		exchangeEnabled: { type: 'boolean', optional: false, nullable: false },
		exchangeRate: { type: 'number', optional: false, nullable: false, description: 'Legacy field. Point exchange is disabled.' },
		pointsPerCoin: { type: 'integer', optional: false, nullable: true, description: 'Legacy field. Point exchange is disabled.' },
	},
} as const;

export const walletSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		balance: { type: 'number', optional: false, nullable: false },
		reservedBalance: { type: 'number', optional: false, nullable: false },
		points: { type: 'number', optional: false, nullable: false },
		...walletSettingsSchema.properties,
	},
} as const;

export const walletTransactionSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { type: 'string', format: 'id', optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		type: { type: 'string', enum: WALLET_TRANSACTION_TYPES, optional: false, nullable: false },
		// Historical coin rows are normalized to points before they reach clients.
		currency: { type: 'string', enum: ['points'], optional: false, nullable: false },
		amount: { type: 'number', optional: false, nullable: false },
		balance: { type: 'number', optional: false, nullable: false },
		reservedAmount: { type: 'number', optional: false, nullable: false },
		reservedBalance: { type: 'number', optional: false, nullable: false },
		description: { type: 'string', optional: false, nullable: true },
		relatedId: { type: 'string', format: 'id', optional: false, nullable: true },
		pointsSpent: { type: 'integer', optional: false, nullable: true },
		actorId: { type: 'string', format: 'id', optional: false, nullable: true },
		flow: {
			type: 'object', optional: false, nullable: false,
			properties: {
				from: { type: 'string', enum: ['user', 'system', 'redPacket', 'reserved', 'unknown'], optional: false, nullable: false },
				to: { type: 'string', enum: ['user', 'system', 'redPacket', 'reserved', 'unknown'], optional: false, nullable: false },
				fromUserId: { type: 'string', format: 'id', optional: false, nullable: true },
				toUserId: { type: 'string', format: 'id', optional: false, nullable: true },
				fromUser: { type: 'object', ref: 'UserLite', optional: false, nullable: true },
				toUser: { type: 'object', ref: 'UserLite', optional: false, nullable: true },
			},
		},
	},
} as const;
