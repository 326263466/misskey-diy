/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { WALLET_MAX_EXCHANGE_RATE, WalletService } from '@/core/WalletService.js';
import { walletSettingsSchema } from '@/models/json-schema/wallet.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'write:admin:meta',
	limit: { duration: 60000, max: 30 },
	res: walletSettingsSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		exchangeEnabled: { type: 'boolean' },
		exchangeRate: { type: 'integer', minimum: 1, maximum: WALLET_MAX_EXCHANGE_RATE },
	},
	required: ['exchangeEnabled', 'exchangeRate'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private walletService: WalletService) {
		super(meta, paramDef, async (ps) => this.walletService.updateSettings(ps));
	}
}
