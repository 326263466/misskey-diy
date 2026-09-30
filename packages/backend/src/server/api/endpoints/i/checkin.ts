/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinService } from '@/core/CheckinService.js';
import { checkinResultSchema } from '@/models/json-schema/checkin.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['account'], requireCredential: true, prohibitMoved: true, kind: 'write:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		notAllowed: { message: 'This account cannot check in.', code: 'CHECKIN_NOT_ALLOWED', id: '44269c10-65d4-4dfd-ba6d-fec63568b10c' },
		cardLimit: { message: 'The makeup card balance has reached the limit.', code: 'CARD_LIMIT_EXCEEDED', id: '73a042d7-8eea-4255-abc4-1b86b137e361' },
	},
	res: checkinResultSchema,
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinService: CheckinService) {
		super(meta, paramDef, async (_ps, me) => {
			try {
				return await this.checkinService.checkin(me.id);
			} catch (error) {
				if (error instanceof CheckinService.NotAllowedError) throw new ApiError(meta.errors.notAllowed);
				if (error instanceof CheckinService.CardLimitError) throw new ApiError(meta.errors.cardLimit);
				throw error;
			}
		});
	}
}
