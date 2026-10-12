/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedArticleCommentSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { type: 'string', format: 'id', optional: false, nullable: false },
		articleId: { type: 'string', format: 'id', optional: false, nullable: false },
		replyId: { type: 'string', format: 'id', optional: false, nullable: true },
		repliesCount: { type: 'number', optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		user: { type: 'object', ref: 'UserLite', optional: false, nullable: false },
		text: { type: 'string', optional: false, nullable: false },
		files: { type: 'array', optional: false, nullable: false, items: { type: 'object', optional: false, nullable: false, ref: 'DriveFile' } },
		canDelete: { type: 'boolean', optional: false, nullable: false },
		replyTo: {
			type: 'object', optional: false, nullable: true,
			properties: {
				id: { type: 'string', format: 'id', optional: false, nullable: false },
				user: { type: 'object', ref: 'UserLite', optional: false, nullable: false },
				text: { type: 'string', optional: false, nullable: false },
			},
		},
	},
} as const;
