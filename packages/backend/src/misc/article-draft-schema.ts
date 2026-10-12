/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const articleDraftIdSchema = { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' } as const;

export const articleDraftSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		id: { type: 'string', optional: false, nullable: false },
		revision: { type: 'integer', optional: false, nullable: false },
		updatedAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
		title: { type: 'string', optional: false, nullable: false },
		summary: { type: 'string', optional: false, nullable: false },
		text: { type: 'string', optional: false, nullable: false },
		name: { type: 'string', optional: false, nullable: false },
		articleCategoryId: { type: 'string', optional: false, nullable: true },
		articleTags: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
		articleId: { type: 'string', optional: false, nullable: true },
		cover: { type: 'object', optional: false, nullable: true, ref: 'DriveFile' },
	},
} as const;
