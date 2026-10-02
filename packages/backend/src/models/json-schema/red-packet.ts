/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { redPacketCoverIds } from '@/models/RedPacket.js';

export const packedRedPacketSummarySchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { type: 'string', format: 'id', optional: false, nullable: false },
		senderId: { type: 'string', format: 'id', optional: false, nullable: false },
		kind: { type: 'string', enum: ['direct', 'group', 'tip'], optional: false, nullable: false },
		audience: { type: 'string', enum: ['public', 'recipients', 'room'], optional: false, nullable: false },
		roomId: { type: 'string', format: 'id', optional: false, nullable: true },
		mode: { type: 'string', enum: ['equal', 'random'], optional: false, nullable: false },
		message: { type: 'string', optional: false, nullable: false },
		coverId: { type: 'string', enum: redPacketCoverIds, optional: false, nullable: false },
		coverFileId: { type: 'string', optional: false, nullable: true },
		coverUrl: { type: 'string', optional: false, nullable: true },
		totalCoins: { type: 'integer', optional: false, nullable: false },
		count: { type: 'integer', optional: false, nullable: false },
		remainingCoins: { type: 'integer', optional: false, nullable: false },
		remainingCount: { type: 'integer', optional: false, nullable: false },
		expiresAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		status: { type: 'string', enum: ['active', 'exhausted', 'expired', 'cancelled'], optional: false, nullable: false },
		claimedCoins: { type: 'integer', optional: false, nullable: true },
	},
} as const;

export const packedRedPacketSchema = {
	...packedRedPacketSummarySchema,
	properties: {
		...packedRedPacketSummarySchema.properties,
		claims: {
			type: 'array', optional: false, nullable: false,
			items: {
				type: 'object', optional: false, nullable: false,
				properties: {
					id: { type: 'string', format: 'id', optional: false, nullable: false },
					user: { type: 'object', ref: 'UserLite', optional: false, nullable: true },
					coins: { type: 'integer', optional: false, nullable: false },
					createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
				},
			},
		},
	},
} as const;
