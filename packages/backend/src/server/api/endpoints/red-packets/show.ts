/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RedPacketService } from '@/core/RedPacketService.js';
import { packedRedPacketSchema } from '@/models/json-schema/red-packet.js';
import { redPacketApiErrors, throwRedPacketApiError } from '@/server/api/red-packet-errors.js';

export const meta = {
	tags: ['red-packets'],
	requireCredential: true,
	secure: true,
	limit: { duration: 60_000, max: 120 },
	res: packedRedPacketSchema,
	errors: redPacketApiErrors,
} as const;

export const paramDef = {
	type: 'object',
	properties: { redPacketId: { type: 'string', format: 'misskey:id' } },
	required: ['redPacketId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private redPacketService: RedPacketService) {
		super(meta, paramDef, async (ps, me) => {
			return this.redPacketService.show(ps.redPacketId, me).catch(throwRedPacketApiError);
		});
	}
}

