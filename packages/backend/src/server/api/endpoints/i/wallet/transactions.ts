/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { WalletService } from '@/core/WalletService.js';
import { walletTransactionSchema } from '@/models/json-schema/wallet.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['account'], requireCredential: true, kind: 'read:account',
	res: { type: 'array', optional: false, nullable: false, items: walletTransactionSchema },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private walletService: WalletService) {
		super(meta, paramDef, async (ps, me) => this.walletService.transactions(me.id, ps.limit, ps.untilId));
	}
}
