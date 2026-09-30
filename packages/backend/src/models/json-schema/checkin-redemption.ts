/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const checkinRedemptionCodeSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { type: 'string', optional: false, nullable: false },
		name: { type: 'string', optional: false, nullable: false },
		code: { type: 'string', optional: false, nullable: false },
		amount: { type: 'integer', optional: false, nullable: false },
		maxRedemptions: { type: 'integer', optional: false, nullable: false },
		redemptions: { type: 'integer', optional: false, nullable: false },
		expiresAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		enabled: { type: 'boolean', optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
	},
} as const;
