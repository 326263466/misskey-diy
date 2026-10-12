/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomMembershipSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		userId: {
			type: 'string',
			optional: false, nullable: false,
		},
		role: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['owner', 'administrator', 'member'],
		},
		nickname: { type: 'string', optional: false, nullable: false },
		isSilenced: { type: 'boolean', optional: false, nullable: false },
		silenceUntil: { type: 'string', format: 'date-time', optional: false, nullable: true },
		user: {
			type: 'object',
			optional: true, nullable: false,
			ref: 'UserLite',
		},
		roomId: {
			type: 'string',
			optional: false, nullable: false,
		},
		room: {
			type: 'object',
			optional: true, nullable: false,
			ref: 'ChatRoom',
		},
	},
} as const;
