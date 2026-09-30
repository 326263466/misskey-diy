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
	description: 'Lists retained administrator grants, makeup uses, or point exchanges. For makeup uses, createdAt is the operation time and date is the missed day.',
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
						operator: { type: 'object', ref: 'UserLite', optional: false, nullable: true },
						recipientUsername: { type: 'string', optional: false, nullable: true },
						batchId: { type: 'string', optional: false, nullable: true },
						usageStatus: { type: 'string', enum: ['legacy', 'unused', 'partial', 'used', 'revoked'], optional: false, nullable: false },
						used: { type: 'integer', optional: false, nullable: true },
						remaining: { type: 'integer', optional: false, nullable: true },
						revoked: { type: 'integer', optional: false, nullable: true },
						amount: { type: 'integer', optional: false, nullable: false },
						before: { type: 'integer', optional: false, nullable: true },
						after: { type: 'integer', optional: false, nullable: true },
						date: { type: 'string', optional: false, nullable: true },
						pointsSpent: { type: 'integer', optional: false, nullable: true },
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
		type: { type: 'string', enum: ['grant', 'use', 'exchange'], default: 'grant' },
		offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinAdminService: CheckinAdminService) {
		super(meta, paramDef, async (ps, me) => this.checkinAdminService.history(ps.type, ps.offset, ps.limit, me, ps.userId));
	}
}
