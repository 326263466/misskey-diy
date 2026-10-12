/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { TipService } from '@/core/TipService.js';
import { WALLET_REQUEST_ID_PATTERN, WalletService } from '@/core/WalletService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['account'], requireCredential: true, secure: true, prohibitMoved: true,
	limit: { duration: 60_000, max: 20 },
	errors: {
		noSuchUser: { message: 'No such user.', code: 'NO_SUCH_USER', id: 'ce3c213d-a9ca-4b4b-b707-617a21b80c2f' },
		notAllowed: { message: 'These accounts cannot send or receive tips.', code: 'WALLET_NOT_ALLOWED', id: 'cfbffdb9-55f3-4b0b-b0d6-c34430bf2f72' },
		invalidAmount: { message: 'Supply 1 to 1000 points with at most two decimal places and a message of up to 100 characters.', code: 'INVALID_AMOUNT', id: '6d7fd834-b4b1-47d2-8dd1-37ac9f7465cc' },
		insufficientBalance: { message: 'Not enough points.', code: 'INSUFFICIENT_BALANCE', id: 'b8da13f3-44ef-4b2e-bf57-fad2d0a7e60b' },
		balanceLimit: { message: 'The recipient wallet balance would exceed the limit.', code: 'BALANCE_LIMIT_EXCEEDED', id: '6bfae74c-2a10-470a-b1c2-2dab39f35dc2' },
		requestConflict: { message: 'This request ID was already used for a different operation.', code: 'REQUEST_CONFLICT', id: 'ac3e62ba-6451-4e62-a58d-e15104cfa09c' },
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
		amount: { type: 'number', minimum: 1, maximum: 1000 },
		message: { type: 'string', maxLength: 100, default: '' },
		requestId: { type: 'string', pattern: WALLET_REQUEST_ID_PATTERN },
	},
	required: ['userId', 'amount', 'requestId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private tipService: TipService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.tipService.send(me.id, ps.userId, ps.amount, ps.message, ps.requestId);
			} catch (error) {
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
