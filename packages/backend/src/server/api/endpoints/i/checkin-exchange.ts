/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinService } from '@/core/CheckinService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['account'], requireCredential: true, prohibitMoved: true, kind: 'write:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		notAllowed: { message: 'This account cannot exchange check-in points.', code: 'CHECKIN_NOT_ALLOWED', id: '30919c72-e97e-4f30-af0e-36e549a563e2' },
		insufficientPoints: { message: 'Not enough check-in points.', code: 'INSUFFICIENT_CHECKIN_POINTS', id: '67374cd3-448c-4521-bce7-b9602c4be5fa' },
		monthlyExchangeLimit: { message: 'You have already exchanged a makeup card this month.', code: 'MONTHLY_EXCHANGE_LIMIT', id: '1c3b48e5-36a3-4b70-a9ba-1ecb1377318e' },
		cardLimit: { message: 'The makeup card balance has reached the limit.', code: 'CARD_LIMIT_EXCEEDED', id: 'acc570b1-a28f-4cc9-a448-395710f75ec5' },
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			points: { type: 'integer', optional: false, nullable: false },
			makeupCards: { type: 'integer', optional: false, nullable: false },
			exchanged: { type: 'boolean', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { requestId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' } },
	required: ['requestId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinService: CheckinService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.checkinService.exchange(me.id, ps.requestId);
			} catch (error) {
				if (error instanceof CheckinService.NotAllowedError) throw new ApiError(meta.errors.notAllowed);
				if (error instanceof CheckinService.InsufficientPointsError) throw new ApiError(meta.errors.insufficientPoints);
				if (error instanceof CheckinService.MonthlyExchangeLimitError) throw new ApiError(meta.errors.monthlyExchangeLimit);
				if (error instanceof CheckinService.CardLimitError) throw new ApiError(meta.errors.cardLimit);
				throw error;
			}
		});
	}
}
