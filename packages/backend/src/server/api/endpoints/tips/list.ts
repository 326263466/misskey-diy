/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ContentTipService } from '@/core/ContentTipService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['account'], requireCredential: false,
	limit: { duration: 60_000, max: 120 },
	errors: {
		noSuchTarget: { message: 'No accessible tip target.', code: 'NO_SUCH_TIP_TARGET', id: '4492f7a8-1c4f-4bf5-85fc-1f5007f42b0c' },
	},
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			items: {
				type: 'array', optional: false, nullable: false,
				items: {
					type: 'object', optional: false, nullable: false,
					properties: {
						id: { type: 'string', format: 'id', optional: false, nullable: false },
						createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
						user: { type: 'object', ref: 'UserLite', optional: false, nullable: true },
						amount: { type: 'number', optional: false, nullable: false },
						message: { type: 'string', optional: false, nullable: true },
					},
				},
			},
			totalCount: { type: 'integer', optional: false, nullable: false },
			totalAmount: { type: 'number', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		targetType: { type: 'string', enum: ['note', 'page'] },
		targetId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: ['targetType', 'targetId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private tipService: ContentTipService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return await this.tipService.list({ targetType: ps.targetType, targetId: ps.targetId }, me, ps.limit, ps.untilId);
			} catch (error) {
				if (error instanceof ContentTipService.NoSuchTargetError) throw new ApiError(meta.errors.noSuchTarget);
				throw error;
			}
		});
	}
}
