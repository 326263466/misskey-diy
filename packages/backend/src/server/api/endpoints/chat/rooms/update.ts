/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { contentTooLongError } from '@/misc/content-limits.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService, ChatRoomAccessError } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { chatInteractionApiErrors, toChatInteractionApiError } from '@/server/api/chat-interaction-errors.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,
	prohibitMoved: true,

	kind: 'write:chat',
	limit: { duration: 60000, max: 60 },

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoom',
	},

	errors: {
		contentTooLong: { ...contentTooLongError, id: 'c1de07d3-c83e-4d6b-a2a6-640809c603c1' },
		invalidSilenceUntil: chatInteractionApiErrors.invalidSilenceUntil,
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'fcdb0f92-bda6-47f9-bd05-343e0e020932',
		},
		noSuchAvatar: {
			message: 'No such avatar file.',
			code: 'NO_SUCH_AVATAR',
			id: '60aa80d2-2a11-4904-b5b7-4c87bcb8da76',
		},
		avatarNotAnImage: {
			message: 'The avatar must be an image.',
			code: 'AVATAR_NOT_AN_IMAGE',
			id: '7f454a9f-9fb4-482d-a27c-0bd46253e2c5',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', maxLength: 256 },
		description: { type: 'string', maxLength: 1024 },
		announcement: { type: 'string', maxLength: 2048 },
		joinPolicy: { type: 'string', enum: ['public', 'approval', 'invitation', 'closed'] },
		avatarId: { type: 'string', format: 'misskey:id', nullable: true },
		isSilenced: { type: 'boolean' },
		silenceUntil: { type: 'string', nullable: true, maxLength: 40 },
	},
	required: ['roomId'],
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

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}
			const role = await this.chatService.getRoomRole(room, me.id);
			if (role !== 'owner' && (role !== 'administrator' || ps.name !== undefined || ps.description !== undefined || ps.joinPolicy !== undefined || ps.avatarId !== undefined)) throw new ApiError(meta.errors.noSuchRoom);
			if (ps.avatarId != null) {
				const avatar = await this.driveFilesRepository.findOneBy({ id: ps.avatarId, userId: me.id });
				if (avatar == null) throw new ApiError(meta.errors.noSuchAvatar);
				if (!avatar.type.startsWith('image/')) throw new ApiError(meta.errors.avatarNotAnImage);
			}

			const updated = await this.chatService.updateRoom(room, {
				name: ps.name,
				description: ps.description,
				announcement: ps.announcement,
				joinPolicy: ps.joinPolicy,
				avatarId: ps.avatarId,
				isSilenced: ps.isSilenced,
				silenceUntil: ps.silenceUntil === undefined ? undefined : ps.silenceUntil === null ? null : new Date(ps.silenceUntil),
			}, me.id).catch(error => {
				if (error instanceof IdentifiableError && error.id === contentTooLongError.id) throw new ApiError(meta.errors.contentTooLong);
				if (error instanceof ChatRoomAccessError) throw new ApiError(meta.errors.noSuchRoom);
				throw toChatInteractionApiError(error) ?? error;
			});

			return this.chatEntityService.packRoom(updated, me);
		});
	}
}
