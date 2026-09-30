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
		notAllowed: { message: 'This account cannot check in.', code: 'CHECKIN_NOT_ALLOWED', id: '1a13b5d8-339a-4c6f-b366-b3f36ce9b772' },
		invalidDate: { message: 'Choose a past date on or after your registration date.', code: 'INVALID_CHECKIN_DATE', id: '2900ef1b-ad98-4ddb-a665-55400a1a2309' },
		noCards: { message: 'No makeup cards are available.', code: 'NO_MAKEUP_CARDS', id: '0be3fae4-1633-44f9-9750-15f977e4f2ce' },
	},
	res: checkinResultSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: { date: { type: 'string', pattern: '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' } },
	required: ['date'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinService: CheckinService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.checkinService.makeup(me.id, ps.date);
			} catch (error) {
				if (error instanceof CheckinService.NotAllowedError) throw new ApiError(meta.errors.notAllowed);
				if (error instanceof CheckinService.InvalidDateError) throw new ApiError(meta.errors.invalidDate);
				if (error instanceof CheckinService.NoMakeupCardsError) throw new ApiError(meta.errors.noCards);
				throw error;
			}
		});
	}
}
