/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { WalletService } from '@/core/WalletService.js';
import { walletSettingsSchema } from '@/models/json-schema/wallet.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'read:admin:meta',
	res: walletSettingsSchema,
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private walletService: WalletService) {
		super(meta, paramDef, async () => this.walletService.getSettings());
	}
}
