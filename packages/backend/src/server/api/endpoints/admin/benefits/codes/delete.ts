/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { BenefitRedemptionService } from '@/core/BenefitRedemptionService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'write:admin:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		noSuchCode: { message: 'No such redemption code.', code: 'NO_SUCH_REDEMPTION_CODE', id: 'ac719515-a3d3-4556-8356-61abd8feda10' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { id: { type: 'string', format: 'misskey:id' } },
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private benefitRedemptionService: BenefitRedemptionService) {
		super(meta, paramDef, async ps => {
			try {
				await this.benefitRedemptionService.remove(ps.id);
			} catch (error) {
				if (error instanceof BenefitRedemptionService.NoSuchCodeError) throw new ApiError(meta.errors.noSuchCode);
				throw error;
			}
		});
	}
}
