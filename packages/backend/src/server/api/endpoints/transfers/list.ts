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
	res: { type: 'array', optional: false, nullable: false, items: packedTransferSchema },
	errors: transferApiErrors,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
		untilId: { type: 'string', format: 'misskey:id' },
		direction: { type: 'string', enum: ['sent', 'received'] },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private transferService: TransferService) {
		super(meta, paramDef, async (ps, me) => {
			return this.transferService.list(me.id, ps.limit, ps.untilId, ps.direction).catch(throwTransferApiError);
		});
	}
}
