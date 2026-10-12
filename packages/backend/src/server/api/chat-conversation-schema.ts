/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const chatConversationSchema = {
	type: 'object', optional: false, nullable: false,
	properties: {
		userId: { type: 'string', format: 'misskey:id', optional: false, nullable: true },
		roomId: { type: 'string', format: 'misskey:id', optional: false, nullable: true },
		notificationMode: { type: 'string', enum: ['all', 'silent', 'assistant', 'blocked'], optional: false, nullable: false },
		mutedUntil: { type: 'string', format: 'date-time', optional: false, nullable: true },
		hidden: { type: 'boolean', optional: false, nullable: false },
		hiddenThroughId: { type: 'string', format: 'misskey:id', optional: false, nullable: true },
		markedUnread: { type: 'boolean', optional: false, nullable: false },
	},
} as const;
