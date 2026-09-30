/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinService } from '@/core/CheckinService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['users'], requireCredential: false,
	limit: { duration: 60000, max: 60 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			timeZone: { type: 'string', optional: false, nullable: false },
			today: { type: 'string', optional: false, nullable: false },
			month: { type: 'string', optional: false, nullable: false },
			type: { type: 'string', enum: ['consecutive', 'total', 'monthly'], optional: false, nullable: false },
			items: {
				type: 'array', optional: false, nullable: false,
				items: {
					type: 'object', optional: false, nullable: false,
					properties: {
						rank: { type: 'integer', optional: false, nullable: false },
						days: { type: 'integer', optional: false, nullable: false },
						user: { type: 'object', ref: 'UserDetailedNotMe', optional: false, nullable: false },
					},
				},
			},
			myRank: {
				type: 'object', optional: false, nullable: true,
				properties: {
					rank: { type: 'integer', optional: false, nullable: false },
					days: { type: 'integer', optional: false, nullable: false },
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		type: { type: 'string', enum: ['consecutive', 'total', 'monthly'], default: 'consecutive' },
		offset: { type: 'integer', minimum: 0, maximum: 99, default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinService: CheckinService) {
		super(meta, paramDef, async (ps, me) => this.checkinService.ranking(ps.type, ps.offset, ps.limit, me));
	}
}
