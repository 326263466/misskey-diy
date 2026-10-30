/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { BENEFIT_REWARD_TYPES } from '@/models/BenefitRedemptionCode.js';
import { BenefitRedemptionService } from '@/core/BenefitRedemptionService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['account'], requireCredential: true, kind: 'read:account',
	limit: { duration: 60000, max: 60 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			total: { type: 'integer', optional: false, nullable: false },
			items: {
				type: 'array', optional: false, nullable: false,
				items: {
					type: 'object', optional: false, nullable: false,
					properties: {
						id: { type: 'string', optional: false, nullable: false },
						rewardType: { type: 'string', enum: BENEFIT_REWARD_TYPES, optional: false, nullable: false },
						amount: { type: 'integer', optional: false, nullable: false },
						createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private benefitRedemptionService: BenefitRedemptionService) {
		super(meta, paramDef, async (ps, me) => this.benefitRedemptionService.history(me.id, ps.offset, ps.limit));
	}
}
