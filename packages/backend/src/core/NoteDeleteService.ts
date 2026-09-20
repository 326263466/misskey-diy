/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets, DataSource, In, IsNull, Not } from 'typeorm';
import { Injectable, Inject } from '@nestjs/common';
import { MiUser, type MiLocalUser, type MiRemoteUser } from '@/models/User.js';
import { MiNote, type IMentionedRemoteUsers } from '@/models/Note.js';
import type { InstancesRepository, MiMeta, NotesRepository, UsersRepository } from '@/models/_.js';
import { RelayService } from '@/core/RelayService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import NotesChart from '@/core/chart/charts/notes.js';
import PerUserNotesChart from '@/core/chart/charts/per-user-notes.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { DELETED_REPLY_THREAD_PREFIX, getNoteThreadId, isDeletedReply } from '@/misc/is-reply.js';
import { lockNoteReplyAncestors } from '@/misc/note-comments.js';

@Injectable()
export class NoteDeleteService {
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private relayService: RelayService,
		private federatedInstanceService: FederatedInstanceService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private searchService: SearchService,
		private moderationLogService: ModerationLogService,
		private notesChart: NotesChart,
		private perUserNotesChart: PerUserNotesChart,
		private instanceChart: InstanceChart,
	) {}

	/**
	 * 投稿を削除します。
	 * @param user 投稿者
	 * @param note 投稿
	 */
	async delete(user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; }, note: MiNote, quiet = false, deleter?: MiUser) {
		const deletedBy = deleter != null && deleter.id !== note.userId ? 'community' : 'author';
		if (note.replyId != null) {
			await this.deleteComment(user, note, quiet, deleter, deletedBy);
			return;
		}
		const deletedAt = new Date();
		let deletedNotes: MiNote[] = [];
		let ancestors: MiNote[] = [];
		const authors = new Map<MiUser['id'], typeof user>([[user.id, user]]);
		const renoteTargets = new Map<string, { note: MiNote; removed: MiNote[] }>();

		await this.db.transaction(async (transaction) => {
			const locked = await lockNoteReplyAncestors(transaction, note.id);
			if (!locked.some(target => target.id === note.id && target.userId === user.id)) return;
			const rows = await transaction.query<MiNote[]>(`
				WITH RECURSIVE descendants AS (
					SELECT id FROM note WHERE id = $1
					UNION
					SELECT n.id FROM note n INNER JOIN descendants d ON n."replyId" = d.id
				)
				SELECT n.* FROM note n INNER JOIN descendants d ON d.id = n.id ORDER BY n.id FOR UPDATE OF n
			`, [note.id]);
			deletedNotes = rows.map(row => this.notesRepository.create(row));
			const deletedIds = new Set(deletedNotes.map(target => target.id));
			ancestors = locked.filter(target => !deletedIds.has(target.id));
			for (const author of await transaction.findBy(MiUser, { id: In(deletedNotes.map(target => target.userId)) })) {
				authors.set(author.id, author);
			}

			// 外键仅清理这些帖子的点赞、回应、投票及收藏等关联。
			await transaction.delete(MiNote, { id: In([...deletedIds]) });
			for (const ancestor of ancestors) {
				await transaction.decrement(MiNote, { id: ancestor.id }, 'repliesCount', deletedNotes.length);
			}

			for (const target of deletedNotes) {
				const author = authors.get(target.userId);
				if (target.renoteId == null || deletedIds.has(target.renoteId) || target.renoteUserId === target.userId || author?.isBot) continue;
				let renote = renoteTargets.get(target.renoteId);
				if (!renote) {
					const original = await transaction.findOneBy(MiNote, { id: target.renoteId });
					if (original == null) continue;
					renote = { note: original, removed: [] };
					renoteTargets.set(target.renoteId, renote);
				}
				renote.removed.push(target);
			}
			for (const { note: original, removed } of renoteTargets.values()) {
				await transaction.createQueryBuilder().update(MiNote)
					.set({ renoteCount: () => 'GREATEST("renoteCount" - :removed, 0)' })
					.where('id = :id', { id: original.id }).setParameter('removed', removed.length).execute();
			}
			await transaction.query(`UPDATE "user" u SET "notesCount" = (SELECT COUNT(*) FROM note n WHERE n."userId" = u.id) WHERE u.id = ANY($1::varchar[])`, [[...authors.keys()]]);
		});

		if (deletedNotes.length === 0) return;
		if (!quiet) {
			for (const ancestor of ancestors) this.globalEventService.publishNoteStream(ancestor, 'unreplied', { noteId: note.id, deletedBy });
			for (const { note: original, removed } of renoteTargets.values()) {
				for (const target of removed) this.globalEventService.publishNoteStream(original, 'unrenoted', { noteId: target.id });
			}
		}
		for (const target of deletedNotes) {
			const author = authors.get(target.userId);
			const targetDeletedBy = target.id === note.id ? deletedBy : target.deletedBy ?? undefined;
			if (!quiet) this.globalEventService.publishNoteStream(target, 'deleted', { deletedAt, deletedBy: targetDeletedBy });
			if (!quiet && author != null && !isDeletedReply(target)) await this.postDelete(author, target);
			await this.searchService.unindexNote(target);
		}

		if (deleter && (note.userId !== deleter.id)) {
			const user = await this.usersRepository.findOneByOrFail({ id: note.userId });
			this.moderationLogService.log(deleter, 'deleteNote', {
				noteId: note.id,
				noteUserId: note.userId,
				noteUserUsername: user.username,
				noteUserHost: user.host,
				note: note,
			});
		}
	}

	private async deleteComment(user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; }, note: MiNote, quiet: boolean, deleter: MiUser | undefined, deletedBy: 'author' | 'community'): Promise<void> {
		let deleted = false;
		let ancestors: MiNote[] = [];
		await this.db.transaction(async transaction => {
			const locked = await lockNoteReplyAncestors(transaction, note.id);
			const current = locked.find(target => target.id === note.id && target.userId === user.id);
			if (current == null || isDeletedReply(current)) return;
			ancestors = locked.filter(target => target.id !== note.id);
			const result = await transaction.update(MiNote, { id: current.id }, {
				threadId: `${DELETED_REPLY_THREAD_PREFIX}${getNoteThreadId(current)}`,
				text: null, cw: null, name: null, fileIds: [], attachedFileTypes: [], tags: [], emojis: [],
				deletedBy,
			});
			deleted = result.affected === 1;
		});
		if (!deleted) return;
		if (!quiet) {
			for (const ancestor of ancestors) this.globalEventService.publishNoteStream(ancestor, 'unreplied', { noteId: note.id, deletedBy });
			this.globalEventService.publishNoteStream(note, 'deleted', { deletedAt: new Date(), deletedBy });
			await this.postDelete(user, note);
		}
		await this.searchService.unindexNote(note);
		if (deleter && note.userId !== deleter.id) {
			const author = await this.usersRepository.findOneByOrFail({ id: note.userId });
			this.moderationLogService.log(deleter, 'deleteNote', {
				noteId: note.id, noteUserId: note.userId, noteUserUsername: author.username, noteUserHost: author.host, note,
			});
		}
	}

	private async postDelete(user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; }, note: MiNote): Promise<void> {
		//#region ローカルの投稿なら削除アクティビティを配送
		if (this.userEntityService.isLocalUser(user) && !note.localOnly) {
			let renote: MiNote | null = null;

			// if deleted note is renote
			if (isRenote(note) && !isQuote(note)) {
				renote = await this.notesRepository.findOneBy({
					id: note.renoteId,
				});
			}

			const content = this.apRendererService.addContext(renote
				? this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note), user)
				: this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), user));

			this.deliverToConcerned(user, note, content);
		}
		//#endregion

		this.notesChart.update(note, false);
		if (this.meta.enableChartsForRemoteUser || (user.host == null)) {
			this.perUserNotesChart.update(user, note, false);
		}

		if (this.meta.enableStatsForFederatedInstances) {
			if (this.userEntityService.isRemoteUser(user)) {
				this.federatedInstanceService.fetchOrRegister(user.host).then(async i => {
					this.instancesRepository.decrement({ id: i.id }, 'notesCount', 1);
					if (this.meta.enableChartsForFederatedInstances) {
						this.instanceChart.updateNote(i.host, note, false);
					}
				});
			}
		}
	}

	@bindThis
	private async getMentionedRemoteUsers(note: MiNote) {
		const where = [] as any[];

		// mention / reply / dm
		const uris = (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(x => x.uri);
		if (uris.length > 0) {
			where.push(
				{ uri: In(uris) },
			);
		}

		// renote / quote
		if (note.renoteUserId) {
			where.push({
				id: note.renoteUserId,
			});
		}

		if (where.length === 0) return [];

		return await this.usersRepository.find({
			where,
		}) as MiRemoteUser[];
	}

	@bindThis
	private async getRenotedOrRepliedRemoteUsers(note: MiNote) {
		const query = this.notesRepository.createQueryBuilder('note')
			.leftJoinAndSelect('note.user', 'user')
			.where(new Brackets(qb => {
				qb.orWhere('note.renoteId = :renoteId', { renoteId: note.id });
				qb.orWhere('note.replyId = :replyId', { replyId: note.id });
			}))
			.andWhere({ userHost: Not(IsNull()) });
		const notes = await query.getMany() as (MiNote & { user: MiRemoteUser })[];
		const remoteUsers = notes.map(({ user }) => user);
		return remoteUsers;
	}

	@bindThis
	private async deliverToConcerned(user: { id: MiLocalUser['id']; host: null; }, note: MiNote, content: any) {
		this.apDeliverManagerService.deliverToFollowers(user, content);
		this.relayService.deliverToRelays(user, content);
		this.apDeliverManagerService.deliverToUsers(user, content, [
			...await this.getMentionedRemoteUsers(note),
			...await this.getRenotedOrRepliedRemoteUsers(note),
		]);
	}
}
