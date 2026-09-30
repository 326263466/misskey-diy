/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinAdminService } from '@/core/CheckinAdminService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'read:admin:show-user',
	limit: { duration: 60000, max: 60 },
	description: 'Returns retained check-in card records and current local-user balances. Used cards include all card sources.',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			grantedCards: { type: 'integer', optional: false, nullable: false },
			grantCount: { type: 'integer', optional: false, nullable: false },
			grantedUsers: { type: 'integer', optional: false, nullable: false },
			usedCards: { type: 'integer', optional: false, nullable: false },
			usedUsers: { type: 'integer', optional: false, nullable: false },
			exchangedCards: { type: 'integer', optional: false, nullable: false },
			availableCards: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { userId: { type: 'string', format: 'misskey:id' } },
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinAdminService: CheckinAdminService) {
		super(meta, paramDef, async ps => this.checkinAdminService.stats(ps.userId));
	}
}
