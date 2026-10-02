/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinService } from '@/core/CheckinService.js';
import { checkinStatusSchema } from '@/models/json-schema/checkin.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['account'], requireCredential: true, kind: 'read:account',
	limit: { duration: 60000, max: 120 },
	res: checkinStatusSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: { month: { type: 'string', pattern: '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' } },
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinService: CheckinService) {
		super(meta, paramDef, async (ps, me) => this.checkinService.getStatus(me.id, ps.month));
	}
}
