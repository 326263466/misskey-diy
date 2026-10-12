/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { PaymentService } from '@/core/payment/PaymentService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { feeRateBpsSchema } from '@/server/api/commerce-schema.js';

export const meta = {
	tags: ['payments'], requireCredential: true, kind: 'read:account',
	limit: { duration: 60000, max: 120 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { feeRateBps: { ...feeRateBpsSchema, optional: false, nullable: false } },
	},
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private paymentService: PaymentService) {
		super(meta, paramDef, async () => {
			const { feeRateBps } = await this.paymentService.getSettings();
			return { feeRateBps };
		});
	}
}
