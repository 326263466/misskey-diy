/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { WalletService } from '@/core/WalletService.js';
import { walletSchema } from '@/models/json-schema/wallet.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['account'], requireCredential: true, kind: 'read:account',
	res: walletSchema,
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private walletService: WalletService) {
		super(meta, paramDef, async (_ps, me) => this.walletService.show(me.id));
	}
}
