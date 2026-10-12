/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { contentTooLongError } from '@/misc/content-limits.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService, ChatRoomInvitationError } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import type { DriveFilesRepository } from '@/models/_.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1day'),
		max: 10,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoom',
	},

	errors: {
		contentTooLong: { ...contentTooLongError, id: '7f3ac346-1c71-4a80-bb2f-5ea346e71e65' },
		invalidInvitees: { message: 'The selected users cannot be added to this room.', code: 'INVALID_INVITEES', id: 'dd92bc18-98ca-4bd2-a349-8ffcc7c4adc0' },
		noSuchAvatar: {
			message: 'No such avatar file.',
			code: 'NO_SUCH_AVATAR',
			id: '62f82367-92aa-486c-9ed6-93a7a7d323c7',
		},
		avatarNotAnImage: {
			message: 'The avatar must be an image.',
			code: 'AVATAR_NOT_AN_IMAGE',
			id: '058b29fb-0214-4df0-b946-da1c803799b0',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', maxLength: CONTENT_LIMITS.chatRoomName },
		description: { type: 'string', maxLength: CONTENT_LIMITS.chatRoomDescription },
		joinPolicy: { type: 'string', enum: ['public', 'approval', 'invitation', 'closed'], default: 'public' },
		avatarId: { type: 'string', format: 'misskey:id', nullable: true },
		initialUserIds: { type: 'array', minItems: 2, maxItems: 49, uniqueItems: true, items: { type: 'string', format: 'misskey:id' } },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			if (ps.avatarId != null) {
				const avatar = await this.driveFilesRepository.findOneBy({ id: ps.avatarId, userId: me.id });
				if (avatar == null) throw new ApiError(meta.errors.noSuchAvatar);
				if (!avatar.type.startsWith('image/')) throw new ApiError(meta.errors.avatarNotAnImage);
			}

			const room = await this.chatService.createRoom(me, {
				name: ps.name,
				description: ps.description ?? '',
				joinPolicy: ps.joinPolicy,
				avatarId: ps.avatarId,
				initialUserIds: ps.initialUserIds,
			}).catch(error => {
				if (error instanceof IdentifiableError && error.id === contentTooLongError.id) throw new ApiError(meta.errors.contentTooLong);
				if (error instanceof ChatRoomInvitationError) throw new ApiError(meta.errors.invalidInvitees, { reason: error.reason, userId: error.userId, chatScope: error.chatScope });
				throw error;
			});
			return await this.chatEntityService.packRoom(room, me);
		});
	}
}
