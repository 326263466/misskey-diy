/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { BenefitRedemptionService } from '@/core/BenefitRedemptionService.js';
import { benefitRedemptionCodeCreateParams, benefitRedemptionCodeSchema } from '@/models/json-schema/benefit-redemption.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'write:admin:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		invalidConfiguration: { message: 'Choose a valid name, reward, recipient limit and future expiration time.', code: 'INVALID_REDEMPTION_CONFIGURATION', id: 'dfe36234-7826-4091-87d6-4f5d3d1b1772' },
	},
	res: benefitRedemptionCodeSchema,
} as const;

export const paramDef = benefitRedemptionCodeCreateParams;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private benefitRedemptionService: BenefitRedemptionService) {
		super(meta, paramDef, async (ps, me) => {
			try { return await this.benefitRedemptionService.create(ps, me); } catch (error) {
				if (error instanceof BenefitRedemptionService.InvalidConfigurationError) throw new ApiError(meta.errors.invalidConfiguration);
				throw error;
			}
		});
	}
}
