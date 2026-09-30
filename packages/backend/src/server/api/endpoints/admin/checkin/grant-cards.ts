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
		noSuchUser: { message: 'No such user.', code: 'NO_SUCH_USER', id: 'fd5d8129-bc97-4597-88a5-9c4eb55218d7' },
		notAllowed: { message: 'This account cannot receive makeup cards.', code: 'CHECKIN_NOT_ALLOWED', id: '5bae171c-7665-42b7-bd75-e331a5f07dcf' },
		cardLimit: { message: 'The makeup card balance would exceed the limit.', code: 'CARD_LIMIT_EXCEEDED', id: 'b6943282-2caa-48be-abe3-bb9866c77bfd' },
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { makeupCards: { type: 'integer', optional: false, nullable: false } },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		amount: { type: 'integer', minimum: 1, maximum: 10000 },
	},
	required: ['userId', 'amount'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinService: CheckinService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.checkinService.grantCards(ps.userId, ps.amount, me);
			} catch (error) {
				if (error instanceof CheckinService.NoSuchUserError) throw new ApiError(meta.errors.noSuchUser);
				if (error instanceof CheckinService.NotAllowedError) throw new ApiError(meta.errors.notAllowed);
				if (error instanceof CheckinService.CardLimitError) throw new ApiError(meta.errors.cardLimit);
				throw error;
			}
		});
	}
}
