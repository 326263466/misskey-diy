/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinRedemptionService } from '@/core/CheckinRedemptionService.js';
import { checkinRedemptionCodeSchema } from '@/models/json-schema/checkin-redemption.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'write:admin:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		invalidConfiguration: { message: 'Choose a nonblank name and a future expiration time.', code: 'INVALID_REDEMPTION_CONFIGURATION', id: 'dfe36234-7826-4091-87d6-4f5d3d1b1772' },
	},
	res: checkinRedemptionCodeSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 100 },
		amount: { type: 'integer', minimum: 1, maximum: 10000 },
		maxRedemptions: { type: 'integer', minimum: 1, maximum: 1000000 },
		// Endpoint AJV only registers misskey:id; validate the timestamp shape without an unsupported format.
		expiresAt: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$', nullable: true },
	},
	required: ['name', 'amount', 'maxRedemptions'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinRedemptionService: CheckinRedemptionService) {
		super(meta, paramDef, async (ps, me) => {
			try { return await this.checkinRedemptionService.create(ps, me); } catch (error) {
				if (error instanceof CheckinRedemptionService.InvalidConfigurationError) throw new ApiError(meta.errors.invalidConfiguration);
				throw error;
			}
		});
	}
}
