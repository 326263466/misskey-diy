/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { packedRedPacketSummarySchema } from './red-packet.js';

const messageAttachmentProperties = {
	systemEvent: {
		type: 'object', optional: true, nullable: true,
		properties: {
			type: { type: 'string', enum: ['membersJoined'], optional: false, nullable: false },
			userIds: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
			users: { type: 'array', optional: false, nullable: false, items: { type: 'object', ref: 'UserLite', optional: false, nullable: false } },
			invited: { type: 'boolean', optional: false, nullable: false },
		},
	},
	isPoke: { type: 'boolean', optional: true, nullable: false },
	pokeUserId: { type: 'string', format: 'id', optional: true, nullable: true },
	pokeUser: { type: 'object', ref: 'UserLite', optional: true, nullable: true },
	replyId: { type: 'string', format: 'id', optional: true, nullable: true },
	replyType: { type: 'string', enum: ['reply', 'quote'], optional: true, nullable: true },
	reply: {
		type: 'object', optional: true, nullable: true,
		properties: {
			id: { type: 'string', optional: false, nullable: false },
			fromUser: { type: 'object', ref: 'UserLite', optional: false, nullable: false },
			text: { type: 'string', optional: false, nullable: true },
			fileName: { type: 'string', optional: false, nullable: true },
			hasRedPacket: { type: 'boolean', optional: false, nullable: false },
		},
	},
	redPacketId: { type: 'string', format: 'id', optional: true, nullable: true },
	redPacket: { ...packedRedPacketSummarySchema, optional: true, nullable: true },
	redPacketClaims: {
		type: 'array', optional: true, nullable: false,
		description: 'Password packet rewards claimed by this message sender; included only in the message creation response.',
		items: {
			type: 'object', optional: false, nullable: false,
			properties: {
				redPacketId: { type: 'string', format: 'id', optional: false, nullable: false },
				coins: { type: 'number', optional: false, nullable: false },
			},
		},
	},
} as const;

// 四种消息 packed schema 共有的编辑标记字段。
const editedAtProperty = {
	editedAt: {
		type: 'string',
		format: 'date-time',
		optional: false, nullable: true,
	},
} as const;

export const packedChatMessageSchema = {
	type: 'object',
	properties: {
		...messageAttachmentProperties,
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		...editedAtProperty,
		fromUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		fromUser: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		toUserId: {
			type: 'string',
			optional: true, nullable: true,
		},
		toUser: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'UserLite',
		},
		toRoomId: {
			type: 'string',
			optional: true, nullable: true,
		},
		toRoom: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'ChatRoom',
		},
		isAutoReply: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		text: {
			type: 'string',
			optional: true, nullable: true,
		},
		fileId: {
			type: 'string',
			optional: true, nullable: true,
		},
		file: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'DriveFile',
		},
		isRead: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		reactions: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false, nullable: false,
					},
					user: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'UserLite',
					},
				},
			},
		},
	},
} as const;

export const packedChatMessageLiteSchema = {
	type: 'object',
	properties: {
		...messageAttachmentProperties,
		isAutoReply: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		...editedAtProperty,
		fromUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		fromUser: {
			type: 'object',
			optional: true, nullable: false,
			ref: 'UserLite',
		},
		toUserId: {
			type: 'string',
			optional: true, nullable: true,
		},
		toRoomId: {
			type: 'string',
			optional: true, nullable: true,
		},
		text: {
			type: 'string',
			optional: true, nullable: true,
		},
		fileId: {
			type: 'string',
			optional: true, nullable: true,
		},
		file: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'DriveFile',
		},
		reactions: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false, nullable: false,
					},
					user: {
						type: 'object',
						optional: true, nullable: true,
						ref: 'UserLite',
					},
				},
			},
		},
	},
} as const;

export const packedChatMessageLiteFor1on1Schema = {
	type: 'object',
	properties: {
		...messageAttachmentProperties,
		isAutoReply: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		...editedAtProperty,
		fromUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		toUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		text: {
			type: 'string',
			optional: true, nullable: true,
		},
		fileId: {
			type: 'string',
			optional: true, nullable: true,
		},
		file: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'DriveFile',
		},
		reactions: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false, nullable: false,
					},
				},
			},
		},
	},
} as const;

export const packedChatMessageLiteForRoomSchema = {
	type: 'object',
	properties: {
		...messageAttachmentProperties,
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		...editedAtProperty,
		fromUserId: {
			type: 'string',
			optional: false, nullable: false,
		},
		fromUser: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		toRoomId: {
			type: 'string',
			optional: false, nullable: false,
		},
		text: {
			type: 'string',
			optional: true, nullable: true,
		},
		fileId: {
			type: 'string',
			optional: true, nullable: true,
		},
		file: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'DriveFile',
		},
		reactions: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false, nullable: false,
					},
					user: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'UserLite',
					},
				},
			},
		},
	},
} as const;
