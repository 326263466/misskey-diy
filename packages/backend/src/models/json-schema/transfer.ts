/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { transferStatuses } from '@/models/Transfer.js';

export const packedTransferSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { type: 'string', format: 'id', optional: false, nullable: false },
		senderId: { type: 'string', format: 'id', optional: false, nullable: false },
		recipientId: { type: 'string', format: 'id', optional: false, nullable: false },
		amount: { type: 'number', optional: false, nullable: false },
		message: { type: 'string', optional: false, nullable: true },
		status: { type: 'string', enum: transferStatuses, optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		expiresAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		completedAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
	},
} as const;
