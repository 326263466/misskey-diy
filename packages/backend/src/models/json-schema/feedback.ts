/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedFeedbackSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', optional: false, nullable: false, format: 'id' },
		createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
		updatedAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
		title: { type: 'string', optional: false, nullable: false },
		description: { type: 'string', optional: false, nullable: false },
		category: { type: 'string', optional: false, nullable: false, enum: ['bug', 'feature', 'other'] },
		status: { type: 'string', optional: false, nullable: false, enum: ['open', 'inProgress', 'resolved', 'closed'] },
		response: { type: 'string', optional: false, nullable: true },
		userId: { type: 'string', optional: false, nullable: false, format: 'id' },
		user: { type: 'object', optional: false, nullable: false, ref: 'UserLite' },
	},
} as const;
