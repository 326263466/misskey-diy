/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { WalletService } from '@/core/WalletService.js';
import { WALLET_TRANSACTION_TYPES } from '@/models/WalletTransaction.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['account'], requireCredential: true, kind: 'read:account',
	description: 'Daily points income, expense and closing balance of the current user.',
	limit: { duration: 60_000, max: 30 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			income: { type: 'number', optional: false, nullable: false },
			expense: { type: 'number', optional: false, nullable: false },
			days: {
				type: 'array', optional: false, nullable: false,
				items: {
					type: 'object', optional: false, nullable: false,
					properties: {
						date: { type: 'string', optional: false, nullable: false, description: 'Local date (YYYY-MM-DD).' },
						income: { type: 'number', optional: false, nullable: false },
						expense: { type: 'number', optional: false, nullable: false },
						balance: { type: 'number', optional: false, nullable: false, description: 'Available balance at the end of the day.' },
					},
				},
			},
			types: {
				type: 'array', optional: false, nullable: false,
				items: {
					type: 'object', optional: false, nullable: false,
					properties: {
						type: { type: 'string', enum: WALLET_TRANSACTION_TYPES, optional: false, nullable: false },
						income: { type: 'number', optional: false, nullable: false },
						expense: { type: 'number', optional: false, nullable: false },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		days: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
		timezoneOffset: { type: 'integer', minimum: -840, maximum: 840, default: 0, description: 'Same as Date#getTimezoneOffset().' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private walletService: WalletService) {
		super(meta, paramDef, async (ps, me) => this.walletService.stats(me.id, ps.days, ps.timezoneOffset));
	}
}
