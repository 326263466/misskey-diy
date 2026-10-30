/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { BenefitRedemptionService } from '@/core/BenefitRedemptionService.js';
import { benefitRedemptionCodeUpdateParams, benefitRedemptionCodeSchema } from '@/models/json-schema/benefit-redemption.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'write:admin:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		noSuchCode: { message: 'No such redemption code.', code: 'NO_SUCH_REDEMPTION_CODE', id: '65a99e79-74d4-479d-9fe0-dbd7e10a5a90' },
		invalidConfiguration: { message: 'Choose a valid name, reward, recipient limit and expiration time.', code: 'INVALID_REDEMPTION_CONFIGURATION', id: '72a072f3-aa85-41b5-96a7-0af9c02b9df1' },
		rewardLocked: { message: 'The reward cannot be changed after a claim.', code: 'REDEMPTION_REWARD_LOCKED', id: 'db441aa5-089e-44a2-ba3a-b6b0790738a2' },
		claimLimit: { message: 'The recipient limit cannot be less than the number of existing claims.', code: 'REDEMPTION_LIMIT_TOO_LOW', id: '0f7e96a2-dc22-4cee-bd0d-091b7731c7e8' },
	},
	res: benefitRedemptionCodeSchema,
} as const;

export const paramDef = {
	...benefitRedemptionCodeUpdateParams,
	properties: { ...benefitRedemptionCodeUpdateParams.properties, id: { type: 'string', format: 'misskey:id' } },
	required: [...benefitRedemptionCodeUpdateParams.required, 'id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private benefitRedemptionService: BenefitRedemptionService) {
		super(meta, paramDef, async ps => {
			try { return await this.benefitRedemptionService.update(ps.id, ps); } catch (error) {
				if (error instanceof BenefitRedemptionService.NoSuchCodeError) throw new ApiError(meta.errors.noSuchCode);
				if (error instanceof BenefitRedemptionService.InvalidConfigurationError) throw new ApiError(meta.errors.invalidConfiguration);
				if (error instanceof BenefitRedemptionService.RewardLockedError) throw new ApiError(meta.errors.rewardLocked);
				if (error instanceof BenefitRedemptionService.ClaimLimitError) throw new ApiError(meta.errors.claimLimit);
				throw error;
			}
		});
	}
}
