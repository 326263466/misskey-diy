/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckinRedemptionService } from '@/core/CheckinRedemptionService.js';
import { checkinRedemptionCodeSchema } from '@/models/json-schema/checkin-redemption.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'write:admin:account',
	limit: { duration: 60000, max: 30 },
	errors: {
		noSuchCode: { message: 'No such redemption code.', code: 'NO_SUCH_REDEMPTION_CODE', id: '65a99e79-74d4-479d-9fe0-dbd7e10a5a90' },
	},
	res: checkinRedemptionCodeSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: { id: { type: 'string', format: 'misskey:id' }, enabled: { type: 'boolean' } },
	required: ['id', 'enabled'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private checkinRedemptionService: CheckinRedemptionService) {
		super(meta, paramDef, async ps => {
			try { return await this.checkinRedemptionService.update(ps.id, ps.enabled); } catch (error) {
				if (error instanceof CheckinRedemptionService.NoSuchCodeError) throw new ApiError(meta.errors.noSuchCode);
				throw error;
			}
		});
	}
}
