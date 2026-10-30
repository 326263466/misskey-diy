/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { CacheService } from '@/core/CacheService.js';
import { QueryService } from '@/core/QueryService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 3600,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		channelId: { type: 'string', nullable: true, format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private globalNotesRankingCache: string[] = [];
	private globalNotesRankingCacheLastFetchedAt = 0;

	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private cacheService: CacheService,
		private noteEntityService: NoteEntityService,
		private featuredService: FeaturedService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let noteIds: string[];
			if (ps.channelId) {
				noteIds = await this.featuredService.getInChannelNotesRanking(ps.channelId, 50);
			} else {
				if (this.globalNotesRankingCacheLastFetchedAt !== 0 && (Date.now() - this.globalNotesRankingCacheLastFetchedAt < 1000 * 60 * 30)) {
					noteIds = this.globalNotesRankingCache;
				} else {
					noteIds = await this.featuredService.getGlobalNotesRanking(100);
					this.globalNotesRankingCache = noteIds;
					this.globalNotesRankingCacheLastFetchedAt = Date.now();
				}
			}

			if (noteIds.length === 0) {
				return [];
			}

			const [
				userIdsWhoMeMuting,
				blockedUserIds,
			] = me ? await Promise.all([
				this.cacheService.userMutingsCache.fetch(me.id),
				this.cacheService.getBlockedUserIds(me.id),
			]) : [new Set<string>(), new Set<string>()];

			const loadNotes = async (rankingIds: string[]) => {
				if (rankingIds.length === 0) return [];
				const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
					.andWhere('note.id IN (:...noteIds)', { noteIds: rankingIds })
					.innerJoinAndSelect('note.user', 'user')
					.leftJoinAndSelect('note.reply', 'reply')
					.leftJoinAndSelect('note.renote', 'renote')
					.leftJoinAndSelect('reply.user', 'replyUser')
					.leftJoinAndSelect('renote.user', 'renoteUser')
					.leftJoinAndSelect('note.channel', 'channel');

				this.queryService.generateBlockedHostQueryForNote(query);
				this.queryService.generateSuspendedUserQueryForNote(query);
				if (me == null) this.queryService.generateUgcVisibilityQueryForVisitor(query);

				return (await query.getMany()).filter(note => {
					if (me && isUserRelated(note, blockedUserIds)) return false;
					if (me && isUserRelated(note.renote, blockedUserIds)) return false;
					if (me && isUserRelated(note, userIdsWhoMeMuting)) return false;

					return true;
				});
			};

			let notes = await loadNotes(noteIds);
			// 开发环境重置数据后，缓存可能仍指向已删除的帖子；此时立即读取一次新的精选排行。
			if (notes.length === 0 && !ps.channelId && noteIds.length > 0) {
				noteIds = await this.featuredService.getGlobalNotesRanking(100);
				this.globalNotesRankingCache = noteIds;
				this.globalNotesRankingCacheLastFetchedAt = Date.now();
				notes = await loadNotes(noteIds);
			}

			return await this.noteEntityService.packMany(notes.slice(0, ps.limit), me);
		});
	}
}
