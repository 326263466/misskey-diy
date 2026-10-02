/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RedPacketService } from '@/core/RedPacketService.js';
import { WALLET_REQUEST_ID_PATTERN } from '@/core/WalletService.js';
import { redPacketCoverIds } from '@/models/RedPacket.js';
import { packedRedPacketSummarySchema } from '@/models/json-schema/red-packet.js';
import { redPacketApiErrors, throwRedPacketApiError } from '@/server/api/red-packet-errors.js';

export const meta = {
	tags: ['red-packets'],
	requireCredential: true,
	secure: true,
	prohibitMoved: true,
	limit: { duration: 60_000, max: 20 },
	res: packedRedPacketSummarySchema,
	errors: redPacketApiErrors,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		kind: { type: 'string', enum: ['direct', 'group', 'tip'] },
		audience: { type: 'string', enum: ['public', 'recipients', 'room'] },
		roomId: { type: 'string', format: 'misskey:id' },
		recipientIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, maxItems: 10000, uniqueItems: true },
		mode: { type: 'string', enum: ['equal', 'random'] },
		totalCoins: { type: 'integer', minimum: 1, maximum: 1_000_000 },
		count: { type: 'integer', minimum: 1, maximum: 100 },
		message: { type: 'string', maxLength: 100, default: '' },
		expiresInHours: { type: 'integer', minimum: 1, maximum: 24 },
		requestId: { type: 'string', pattern: WALLET_REQUEST_ID_PATTERN },
		coverId: { type: 'string', enum: redPacketCoverIds, default: 'classic' },
		coverFileId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['kind', 'audience', 'mode', 'totalCoins', 'count', 'expiresInHours', 'requestId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private redPacketService: RedPacketService) {
		super(meta, paramDef, async (ps, me) => {
			return this.redPacketService.create(ps, me).catch(throwRedPacketApiError);
		});
	}
}
