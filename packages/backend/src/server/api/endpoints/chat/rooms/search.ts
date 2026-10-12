/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { ChatRoomsRepository, ChatRoomMembershipsRepository, ChatRoomInvitationsRepository } from '@/models/_.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { QueryService } from '@/core/QueryService.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: 60_000, max: 30 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: { type: 'object', optional: false, nullable: false, ref: 'ChatRoom' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', maxLength: 256 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: ['query'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,
		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,
		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');
			const memberships = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
				.select('membership.roomId').where('membership.userId = :meId');
			const invitations = this.chatRoomInvitationsRepository.createQueryBuilder('invitation')
				.select('invitation.roomId').where('invitation.userId = :meId').andWhere('invitation.ignored = FALSE').andWhere('invitation.isRequest = FALSE');
			// 公开群和审核群可被发现，其他群仅向已有成员和受邀者显示。
			const query = this.queryService.makePaginationQuery(this.chatRoomsRepository.createQueryBuilder('room'), ps.sinceId, ps.untilId)
				.andWhere('room.isArchived = FALSE')
				.andWhere(new Brackets(qb => {
					qb.where('room.joinPolicy IN (:...discoverablePolicies)', { discoverablePolicies: ['public', 'approval'] })
						.orWhere('room.ownerId = :meId')
						.orWhere(`room.id IN (${memberships.getQuery()})`)
						.orWhere(`room.id IN (${invitations.getQuery()})`);
				}))
				.setParameter('meId', me.id);
			if (ps.query.trim()) {
				query.andWhere(new Brackets(qb => {
					qb.where('room.id = :roomId')
						.orWhere('room.name ILIKE :search')
						.orWhere('room.description ILIKE :search');
				})).setParameters({
					roomId: ps.query.trim(),
					search: `%${sqlLikeEscape(ps.query.trim())}%`,
				});
			}
			return this.chatEntityService.packRooms(await query.take(ps.limit).getMany(), me);
		});
	}
}
