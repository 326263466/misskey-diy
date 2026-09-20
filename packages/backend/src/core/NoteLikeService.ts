/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiNote } from '@/models/Note.js';
import { MiNoteLike } from '@/models/NoteLike.js';
import type { MiUser, NoteLikesRepository, NotesRepository, UsersRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { isDeletedReply } from '@/misc/is-reply.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { QueryService } from '@/core/QueryService.js';

export function emptyLikeState(): Packed<'LikeState'> {
	return { likeCount: 0, isLiked: false, likeUsers: [] };
}

@Injectable()
export class NoteLikeService {
	constructor(
		@Inject(DI.db) private db: DataSource,
		@Inject(DI.noteLikesRepository) private noteLikesRepository: NoteLikesRepository,
		@Inject(DI.notesRepository) private notesRepository: NotesRepository,
		@Inject(DI.usersRepository) private usersRepository: UsersRepository,
		private idService: IdService,
		private userEntityService: UserEntityService,
		private noteEntityService: NoteEntityService,
		private userBlockingService: UserBlockingService,
		private globalEventService: GlobalEventService,
		private queryService: QueryService,
	) {}

	public async setLike(noteId: MiNote['id'], me: { id: MiUser['id'] }, liked: boolean): Promise<Packed<'LikeState'>> {
		const note = await this.resolveNote(noteId, me);
		const changed = await this.db.transaction(async manager => {
			// 加锁复查，避免与并发删除交错后把点赞写到已删除的帖子上
			const current = await manager.findOne(MiNote, { where: { id: noteId }, lock: { mode: 'pessimistic_write' } });
			if (current == null || isDeletedReply(current)) throw new IdentifiableError('like-target-unavailable', 'Content unavailable');
			if (liked) {
				const result = await manager.createQueryBuilder().insert().into(MiNoteLike)
					.values({ id: this.idService.gen(), noteId, userId: me.id })
					.orIgnore().returning('id').execute();
				return result.raw.length > 0;
			}
			return (await manager.delete(MiNoteLike, { noteId, userId: me.id })).affected !== 0;
		});
		if (changed) this.globalEventService.publishNoteStream(note, 'statsUpdated', null);
		return (await this.getStates([noteId], me)).get(noteId) ?? emptyLikeState();
	}

	public async getStates(noteIds: MiNote['id'][], me?: { id: MiUser['id'] } | null): Promise<Map<string, Packed<'LikeState'>>> {
		if (noteIds.length === 0) return new Map();
		const ranked = this.noteLikesRepository.createQueryBuilder('noteLike')
			.select('noteLike.noteId', 'noteId')
			.addSelect('noteLike.userId', 'userId')
			.addSelect('COUNT(*) OVER (PARTITION BY noteLike.noteId)', 'likeCount')
			.addSelect('BOOL_OR(noteLike.userId = :viewerId) OVER (PARTITION BY noteLike.noteId)', 'isLiked')
			.addSelect('ROW_NUMBER() OVER (PARTITION BY noteLike.noteId ORDER BY noteLike.id DESC)', 'position')
			.where('noteLike.noteId IN (:...noteIds)', { noteIds, viewerId: me?.id ?? null });
		const rows = await this.noteLikesRepository.manager.createQueryBuilder()
			.select('ranked.*').from(`(${ranked.getQuery()})`, 'ranked')
			.where('ranked.position <= 3').setParameters(ranked.getParameters())
			.orderBy('ranked.position', 'ASC')
			.getRawMany<{ noteId: string; userId: string; likeCount: string; isLiked: boolean | null }>();
		const userIds = [...new Set(rows.map(row => row.userId))];
		const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
		const packedUsers = new Map((await this.userEntityService.packMany(users, me)).map(user => [user.id, user]));
		// Keep known zero states distinct from notes omitted from a caller's batch.
		const result = new Map<string, Packed<'LikeState'>>(noteIds.map(id => [id, emptyLikeState()]));
		for (const row of rows) {
			const state = result.get(row.noteId)!;
			state.likeCount = Number(row.likeCount);
			state.isLiked = row.isLiked === true;
			const user = packedUsers.get(row.userId);
			if (user != null) state.likeUsers.push(user);
		}
		return result;
	}

	public async list(noteId: MiNote['id'], me: { id: MiUser['id'] } | null, params: { limit: number; sinceId?: string; untilId?: string }): Promise<Packed<'Like'>[]> {
		await this.resolveNote(noteId, me);
		const query = this.queryService.makePaginationQuery(this.noteLikesRepository.createQueryBuilder('noteLike'), params.sinceId, params.untilId)
			.andWhere('noteLike.noteId = :noteId', { noteId })
			.innerJoinAndSelect('noteLike.user', 'user');
		const likes = await query.limit(params.limit).getMany();
		// 列表要渲染关注按钮，需要 UserDetailed 携带的关注关系字段
		const users = new Map((await this.userEntityService.packMany(likes.map(like => like.user!), me, { schema: 'UserDetailed' })).map(user => [user.id, user]));
		return likes.map(like => ({ id: like.id, createdAt: this.idService.parse(like.id).date.toISOString(), user: users.get(like.userId)! }));
	}

	private async resolveNote(noteId: MiNote['id'], me: { id: MiUser['id'] } | null): Promise<MiNote> {
		const note = await this.notesRepository.findOneBy({ id: noteId });
		if (note == null || isDeletedReply(note) || !await this.noteEntityService.isContentVisible(note, me)) {
			throw new IdentifiableError('like-target-unavailable', 'Content unavailable');
		}
		if (me != null && note.userId !== me.id && await this.userBlockingService.checkBlocked(note.userId, me.id)) {
			throw new IdentifiableError('like-target-unavailable', 'Content unavailable');
		}
		return note;
	}
}
