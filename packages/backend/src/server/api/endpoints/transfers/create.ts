/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { TransferService } from '@/core/TransferService.js';
import { WALLET_MAX_BALANCE, WALLET_REQUEST_ID_PATTERN } from '@/core/WalletService.js';
import { packedTransferSchema } from '@/models/json-schema/transfer.js';
import { transferApiErrors, throwTransferApiError } from '@/server/api/transfer-errors.js';

export const meta = {
	tags: ['transfers'], requireCredential: true, secure: true, prohibitMoved: true,
	limit: { duration: 60_000, max: 30 },
	res: packedTransferSchema, errors: transferApiErrors,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		recipientId: { type: 'string', format: 'misskey:id' },
		amount: { type: 'number', minimum: 0.01, maximum: WALLET_MAX_BALANCE },
		message: { type: 'string', maxLength: 200 },
		requestId: { type: 'string', pattern: WALLET_REQUEST_ID_PATTERN },
	},
	required: ['recipientId', 'amount', 'requestId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private transferService: TransferService) {
		super(meta, paramDef, async (ps, me) => {
			return this.transferService.create(ps, me.id).catch(throwTransferApiError);
		});
	}
}
