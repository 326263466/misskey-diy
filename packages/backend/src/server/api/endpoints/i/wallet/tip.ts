/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { WALLET_REQUEST_ID_PATTERN, WalletService } from '@/core/WalletService.js';
import { TipService } from '@/core/TipService.js';
import { ContentTipService } from '@/core/ContentTipService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['account'], requireCredential: true, secure: true, prohibitMoved: true,
	limit: { duration: 60_000, max: 20 },
	errors: {
		noSuchTarget: { message: 'No accessible tip target.', code: 'NO_SUCH_TIP_TARGET', id: 'd3e870d4-9840-42a0-9b17-a9dcd6dfe4a2' },
		noSuchUser: { message: 'No such user.', code: 'NO_SUCH_USER', id: 'ff44395a-b0d8-4714-84d8-29cf189a1aaf' },
		notAllowed: { message: 'These accounts cannot send or receive tips.', code: 'WALLET_NOT_ALLOWED', id: '4057f95a-8c94-4b46-aecc-cb9c9e4e6ed1' },
		invalidAmount: { message: 'Supply 1 to 1000 points with at most two decimal places and a message of up to 100 characters.', code: 'INVALID_AMOUNT', id: 'a30ab5d1-faf2-4d3a-a9a4-75414c4f735b' },
		insufficientBalance: { message: 'Not enough points.', code: 'INSUFFICIENT_BALANCE', id: '2205753b-1f70-45d7-a1c3-da05cc41e45a' },
		balanceLimit: { message: 'The recipient wallet balance would exceed the limit.', code: 'BALANCE_LIMIT_EXCEEDED', id: 'b1844465-9498-4cad-aa7f-c5ecb5f7ee7a' },
		requestConflict: { message: 'This request ID was already used for a different operation.', code: 'REQUEST_CONFLICT', id: '46d584dc-a4cc-4711-bb62-75ff84c14992' },
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			balance: { type: 'number', optional: false, nullable: false },
			amount: { type: 'number', optional: false, nullable: false },
			sent: { type: 'boolean', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		amount: { type: 'number', minimum: 1, maximum: 1000, description: 'Points, with at most two decimal places.' },
		message: { type: 'string', maxLength: 100, default: '' },
		requestId: { type: 'string', pattern: WALLET_REQUEST_ID_PATTERN },
		targetType: { type: 'string', enum: ['note', 'page'] },
		targetId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId', 'amount', 'requestId'],
	dependencies: { targetType: ['targetId'], targetId: ['targetType'] },
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private tipService: TipService, private contentTipService: ContentTipService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				if (ps.targetType && ps.targetId) {
					return await this.contentTipService.send(me.id, ps.userId, ps.amount, ps.message, ps.requestId, { targetType: ps.targetType, targetId: ps.targetId });
				}
				return await this.tipService.send(me.id, ps.userId, ps.amount, ps.message, ps.requestId);
			} catch (error) {
				if (error instanceof ContentTipService.NoSuchTargetError) throw new ApiError(meta.errors.noSuchTarget);
				if (error instanceof WalletService.NoSuchUserError) throw new ApiError(meta.errors.noSuchUser);
				if (error instanceof WalletService.NotAllowedError) throw new ApiError(meta.errors.notAllowed);
				if (error instanceof WalletService.InvalidAmountError) throw new ApiError(meta.errors.invalidAmount);
				if (error instanceof WalletService.InsufficientBalanceError) throw new ApiError(meta.errors.insufficientBalance);
				if (error instanceof WalletService.BalanceLimitError) throw new ApiError(meta.errors.balanceLimit);
				if (error instanceof WalletService.RequestConflictError) throw new ApiError(meta.errors.requestConflict);
				throw error;
			}
		});
	}
}
