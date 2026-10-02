/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { WALLET_MAX_BALANCE, WALLET_REQUEST_ID_PATTERN, WalletService } from '@/core/WalletService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'write:admin:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		noSuchUser: { message: 'No such user.', code: 'NO_SUCH_USER', id: '06fb20dc-0287-4b23-b927-8d875e88e602' },
		notAllowed: { message: 'Only local accounts can use this wallet.', code: 'WALLET_NOT_ALLOWED', id: '2eaae440-dba3-4f14-9989-ac728131aa41' },
		invalidAmount: { message: 'Supply a nonzero integer amount and, optionally, a reason of up to 500 characters.', code: 'INVALID_AMOUNT', id: '0ff8529e-cdc5-474e-9c0b-e662ece41392' },
		insufficientBalance: { message: 'Not enough virtual currency.', code: 'INSUFFICIENT_BALANCE', id: 'd166755b-1a89-444f-a28b-b442cfb2f335' },
		balanceLimit: { message: 'The wallet balance would exceed the limit.', code: 'BALANCE_LIMIT_EXCEEDED', id: '012c99ab-7b0a-4185-8bd6-2978533e688c' },
		requestConflict: { message: 'This request ID was already used for a different operation.', code: 'REQUEST_CONFLICT', id: 'e7287efb-e887-4883-b1b0-71be05b9adc5' },
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			balance: { type: 'integer', optional: false, nullable: false },
			adjusted: { type: 'boolean', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		amount: { type: 'integer', minimum: -WALLET_MAX_BALANCE, maximum: WALLET_MAX_BALANCE },
		reason: { type: 'string', maxLength: 500, default: '' },
		requestId: { type: 'string', pattern: WALLET_REQUEST_ID_PATTERN },
	},
	required: ['userId', 'amount', 'requestId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private walletService: WalletService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.walletService.adjust(ps.userId, ps.amount, ps.reason, ps.requestId, me.id);
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
