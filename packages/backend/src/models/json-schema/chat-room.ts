/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomSchema = {
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
		ownerId: {
			type: 'string',
			optional: false, nullable: false,
		},
		owner: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		memberCount: {
			type: 'integer',
			optional: false, nullable: false,
			minimum: 1,
			description: 'Number of members, including the owner.',
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		avatarId: {
			type: 'string',
			format: 'misskey:id',
			optional: true, nullable: true,
		},
		avatarUrl: {
			type: 'string',
			format: 'url',
			optional: true, nullable: true,
		},
		joinPolicy: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['public', 'approval', 'invitation', 'closed'],
		},
		isMember: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		myRole: {
			type: 'string',
			optional: false, nullable: true,
			enum: ['owner', 'administrator', 'member'],
		},
		announcement: { type: 'string', optional: false, nullable: false },
		ownerNickname: { type: 'string', optional: false, nullable: false },
		myNickname: { type: 'string', optional: false, nullable: false },
		myIsSilenced: { type: 'boolean', optional: false, nullable: false },
		mySilenceUntil: { type: 'string', format: 'date-time', optional: false, nullable: true },
		isSilenced: { type: 'boolean', optional: false, nullable: false },
		silenceUntil: { type: 'string', format: 'date-time', optional: false, nullable: true },
		isMuted: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		mutedUntil: { type: 'string', format: 'date-time', optional: false, nullable: true },
		invitationExists: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		joinRequestPending: { type: 'boolean', optional: false, nullable: false },
	},
} as const;
