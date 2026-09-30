/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinService } from '@/core/CheckinService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'write:admin:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		noSuchBatch: { message: 'No such check-in card batch.', code: 'NO_SUCH_CARD_BATCH', id: 'f718319f-c598-4eab-a4f7-5246fbe9f535' },
		notRevokable: { message: 'Only attributed administrator grants can be reclaimed.', code: 'CARD_BATCH_NOT_REVOKABLE', id: 'c8223fca-2c22-4689-bc4f-cbe6d702c8fa' },
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			batchId: { type: 'string', optional: false, nullable: false },
			revokedCards: { type: 'integer', optional: false, nullable: false },
			makeupCards: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { batchId: { type: 'string', format: 'misskey:id' } },
	required: ['batchId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinService: CheckinService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.checkinService.revokeCards(ps.batchId, me);
			} catch (error) {
				if (error instanceof CheckinService.NoSuchCardBatchError) throw new ApiError(meta.errors.noSuchBatch);
				if (error instanceof CheckinService.CardBatchNotRevokableError) throw new ApiError(meta.errors.notRevokable);
				throw error;
			}
		});
	}
}
