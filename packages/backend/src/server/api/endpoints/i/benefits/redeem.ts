/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { BENEFIT_REWARD_TYPES } from '@/models/BenefitRedemptionCode.js';
import { BenefitRedemptionService } from '@/core/BenefitRedemptionService.js';
import { CheckinService } from '@/core/CheckinService.js';
import { WalletService } from '@/core/WalletService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['account'], requireCredential: true, prohibitMoved: true, kind: 'write:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		noSuchCode: { message: 'No such redemption code.', code: 'NO_SUCH_REDEMPTION_CODE', id: '01c04041-04e0-4c40-84a1-4af82fd22482' },
		disabled: { message: 'This redemption code is disabled.', code: 'REDEMPTION_CODE_DISABLED', id: '9367db8b-7cc7-4fb6-9954-2bbf36317264' },
		expired: { message: 'This redemption code has expired.', code: 'REDEMPTION_CODE_EXPIRED', id: 'a040ef6e-c3fe-4dcb-ab91-8bc63d818082' },
		exhausted: { message: 'This redemption code has reached its redemption limit.', code: 'REDEMPTION_CODE_EXHAUSTED', id: 'a2f74f58-1e64-41fc-8f7d-dba8905cfb0a' },
		notAllowed: { message: 'This account cannot redeem benefits.', code: 'BENEFIT_NOT_ALLOWED', id: 'dd02240c-b815-4bbe-b4d5-e5bdd32a3f4c' },
		cardLimit: { message: 'The makeup card balance would exceed the limit.', code: 'CARD_LIMIT_EXCEEDED', id: '394c6133-cf23-4c10-b6bf-31793ee3df73' },
		balanceLimit: { message: 'The points balance would exceed the limit.', code: 'BALANCE_LIMIT_EXCEEDED', id: 'becbc3d1-3b19-4642-8894-1a837a5df32a' },
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			newlyRedeemed: { type: 'boolean', optional: false, nullable: false },
			rewardType: { type: 'string', enum: BENEFIT_REWARD_TYPES, optional: false, nullable: false },
			amount: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { code: { type: 'string', pattern: '^[0-9a-fA-F]{32}$' } },
	required: ['code'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private benefitRedemptionService: BenefitRedemptionService) {
		super(meta, paramDef, async (ps, me) => {
			try { return await this.benefitRedemptionService.redeem(me.id, ps.code); } catch (error) {
				if (error instanceof BenefitRedemptionService.NoSuchCodeError) throw new ApiError(meta.errors.noSuchCode);
				if (error instanceof BenefitRedemptionService.DisabledCodeError) throw new ApiError(meta.errors.disabled);
				if (error instanceof BenefitRedemptionService.ExpiredCodeError) throw new ApiError(meta.errors.expired);
				if (error instanceof BenefitRedemptionService.ExhaustedCodeError) throw new ApiError(meta.errors.exhausted);
				if (error instanceof BenefitRedemptionService.NotAllowedError) throw new ApiError(meta.errors.notAllowed);
				if (error instanceof CheckinService.CardLimitError) throw new ApiError(meta.errors.cardLimit);
				if (error instanceof WalletService.BalanceLimitError) throw new ApiError(meta.errors.balanceLimit);
				throw error;
			}
		});
	}
}
