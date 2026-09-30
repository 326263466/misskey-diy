/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinRedemptionService } from '@/core/CheckinRedemptionService.js';
import { checkinRedemptionCodeSchema } from '@/models/json-schema/checkin-redemption.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'read:admin:show-user',
	limit: { duration: 60000, max: 60 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			total: { type: 'integer', optional: false, nullable: false },
			items: { type: 'array', optional: false, nullable: false, items: checkinRedemptionCodeSchema },
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
	constructor(private checkinRedemptionService: CheckinRedemptionService) {
		super(meta, paramDef, async ps => this.checkinRedemptionService.list(ps.offset, ps.limit));
	}
}
