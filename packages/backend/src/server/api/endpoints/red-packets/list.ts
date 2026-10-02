/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RedPacketService } from '@/core/RedPacketService.js';
import { redPacketApiErrors, throwRedPacketApiError } from '@/server/api/red-packet-errors.js';
import { packedRedPacketSummarySchema } from '@/models/json-schema/red-packet.js';

export const meta = {
	tags: ['red-packets'],
	requireCredential: true,
	secure: true,
	errors: redPacketApiErrors,
	limit: { duration: 60_000, max: 120 },
	res: { type: 'array', optional: false, nullable: false, items: packedRedPacketSummarySchema },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		scope: { type: 'string', enum: ['sent', 'received', 'claimable'], default: 'sent' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private redPacketService: RedPacketService) {
		super(meta, paramDef, async (ps, me) => this.redPacketService.list(me, ps.limit, ps.untilId, ps.scope).catch(throwRedPacketApiError));
	}
}
