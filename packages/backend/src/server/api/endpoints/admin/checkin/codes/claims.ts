/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinRedemptionService } from '@/core/CheckinRedemptionService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'read:admin:show-user',
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
						createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
						userId: { type: 'string', optional: false, nullable: false },
						user: { type: 'object', ref: 'UserLite', optional: false, nullable: true },
						amount: { type: 'integer', optional: false, nullable: false },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		codeId: { type: 'string', format: 'misskey:id' },
		offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
	},
	required: ['codeId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinRedemptionService: CheckinRedemptionService) {
		super(meta, paramDef, async (ps, me) => this.checkinRedemptionService.claims(ps.codeId, ps.offset, ps.limit, me));
	}
}
