/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { WALLET_MAX_BALANCE, WALLET_REQUEST_ID_PATTERN, WalletService } from '@/core/WalletService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['account'], requireCredential: true, prohibitMoved: true, kind: 'write:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		notAllowed: { message: 'This account cannot exchange check-in points.', code: 'WALLET_NOT_ALLOWED', id: '61ae5a77-dee9-446c-8c35-0561064c5535' },
		disabled: { message: 'Point exchange is disabled.', code: 'EXCHANGE_DISABLED', id: 'cef49c96-ce04-4a9b-a289-28a22cf30fba' },
		insufficientPoints: { message: 'Not enough check-in points.', code: 'INSUFFICIENT_CHECKIN_POINTS', id: 'b0dcc51f-8fb0-4d85-aec2-873ca9212ba8' },
		balanceLimit: { message: 'The wallet balance would exceed the limit.', code: 'BALANCE_LIMIT_EXCEEDED', id: '6c8bead6-aec5-43ce-bdba-e3304ea918c9' },
		requestConflict: { message: 'This request ID was already used for a different operation.', code: 'REQUEST_CONFLICT', id: '5e7cc0cc-e891-4353-9f8e-ef96a02b3bd4' },
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			balance: { type: 'integer', optional: false, nullable: false },
			points: { type: 'integer', optional: false, nullable: false },
			exchanged: { type: 'boolean', optional: false, nullable: false },
			amount: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		points: { type: 'integer', minimum: 1, maximum: WALLET_MAX_BALANCE },
		requestId: { type: 'string', pattern: WALLET_REQUEST_ID_PATTERN },
	},
	required: ['points', 'requestId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private walletService: WalletService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.walletService.exchange(me.id, ps.points, ps.requestId);
			} catch (error) {
				if (error instanceof WalletService.NotAllowedError) throw new ApiError(meta.errors.notAllowed);
				if (error instanceof WalletService.ExchangeDisabledError) throw new ApiError(meta.errors.disabled);
				if (error instanceof WalletService.InsufficientPointsError) throw new ApiError(meta.errors.insufficientPoints);
				if (error instanceof WalletService.BalanceLimitError) throw new ApiError(meta.errors.balanceLimit);
				if (error instanceof WalletService.RequestConflictError) throw new ApiError(meta.errors.requestConflict);
				throw error;
			}
		});
	}
}
