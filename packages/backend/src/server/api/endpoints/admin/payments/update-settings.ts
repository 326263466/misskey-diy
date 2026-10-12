/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { PaymentService } from '@/core/payment/PaymentService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { feeRateBpsSchema, paymentSettingsSchema } from '@/server/api/commerce-schema.js';
import { commerceApiErrors, throwCommerceApiError } from '@/server/api/commerce-errors.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, prohibitMoved: true, kind: 'write:admin:meta',
	limit: { duration: 60000, max: 30 },
	errors: { invalidPaymentSettings: commerceApiErrors.invalidPaymentSettings },
	res: paymentSettingsSchema,
} as const;

export const paramDef = {
	type: 'object', properties: { feeRateBps: feeRateBpsSchema }, required: ['feeRateBps'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private paymentService: PaymentService) {
		super(meta, paramDef, async (ps) => {
			try {
				return await this.paymentService.updateSettings(ps.feeRateBps);
			} catch (error) {
				throwCommerceApiError(error);
			}
		});
	}
}
