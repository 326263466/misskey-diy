/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedLikeSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		user: { type: 'object', ref: 'UserDetailed', optional: false, nullable: false },
	},
} as const;

export const packedLikeStateSchema = {
	type: 'object',
	properties: {
		likeCount: { type: 'integer', optional: false, nullable: false },
		isLiked: { type: 'boolean', optional: false, nullable: false },
		likeUsers: {
			type: 'array', optional: false, nullable: false,
			items: { type: 'object', ref: 'UserLite', optional: false, nullable: false },
		},
	},
} as const;
