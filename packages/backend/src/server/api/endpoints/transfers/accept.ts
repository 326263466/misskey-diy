/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { TransferService } from '@/core/TransferService.js';
import { packedTransferSchema } from '@/models/json-schema/transfer.js';
import { transferApiErrors, throwTransferApiError } from '@/server/api/transfer-errors.js';

export const meta = {
	tags: ['transfers'], requireCredential: true, secure: true,
	limit: { duration: 60_000, max: 120 },
	res: packedTransferSchema, errors: transferApiErrors,
} as const;

export const paramDef = {
	type: 'object',
	properties: { transferId: { type: 'string', format: 'misskey:id' } },
	required: ['transferId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private transferService: TransferService) {
		super(meta, paramDef, async (ps, me) => {
			return this.transferService.accept(ps.transferId, me.id).catch(throwTransferApiError);
		});
	}
}
