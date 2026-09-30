/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinAdminService } from '@/core/CheckinAdminService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'read:admin:show-user',
	limit: { duration: 60000, max: 120 },
	description: 'Lists local users with check-in activity or balances, ordered by available cards. A specific userId also includes an inactive user.',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			total: { type: 'integer', optional: false, nullable: false },
			items: {
				type: 'array', optional: false, nullable: false,
				items: {
					type: 'object', optional: false, nullable: false,
					properties: {
						user: { type: 'object', ref: 'UserLite', optional: false, nullable: false },
						grantedCards: { type: 'integer', optional: false, nullable: false },
						usedCards: { type: 'integer', optional: false, nullable: false },
						exchangedCards: { type: 'integer', optional: false, nullable: false },
						availableCards: { type: 'integer', optional: false, nullable: false },
						points: { type: 'integer', optional: false, nullable: false },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinAdminService: CheckinAdminService) {
		super(meta, paramDef, async (ps, me) => this.checkinAdminService.users(ps.offset, ps.limit, me, ps.userId));
	}
}
