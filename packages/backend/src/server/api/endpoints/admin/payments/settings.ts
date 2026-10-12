/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { PaymentService } from '@/core/payment/PaymentService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { paymentSettingsSchema } from '@/server/api/commerce-schema.js';

export const meta = {
	tags: ['admin'], requireCredential: true, requireAdmin: true, kind: 'read:admin:meta',
	limit: { duration: 60000, max: 60 },
	res: paymentSettingsSchema,
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private paymentService: PaymentService) {
		super(meta, paramDef, async () => this.paymentService.getSettings());
	}
}
