/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError, In } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { DI } from '@/di-symbols.js';
import type { Packed } from '@/misc/json-schema.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import type { UsersRepository, NotesRepository, FollowingsRepository, PollsRepository, PollVotesRepository, NoteReactionsRepository, NoteFavoritesRepository, ChannelsRepository, MiMeta } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { DebounceLoader } from '@/misc/loader.js';
import { IdService } from '@/core/IdService.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import { isDeletedReply, isOrdinaryReply } from '@/misc/is-reply.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { CacheService } from '@/core/CacheService.js';
import { parseReactionUserPair } from '@/misc/reaction.js';
import type { OnModuleInit } from '@nestjs/common';
import type { CustomEmojiService } from '../CustomEmojiService.js';
import type { ReactionService } from '../ReactionService.js';
import type { UserEntityService } from './UserEntityService.js';
import type { DriveFileEntityService } from './DriveFileEntityService.js';
import type { NoteLikeService } from '../NoteLikeService.js';

type NoteVisibilityData = Pick<Packed<'Note'>, 'id' | 'createdAt' | 'user' | 'userId' | 'visibility' | 'visibleUserIds' | 'mentions'> & { reply?: { userId: string } | null };
type NoteFavoriteState = { favoritesCount: number; isFavorited: boolean };

// is-renote.tsとよしなにリンク
function isPureRenote(note: MiNote): note is MiNote & { renoteId: MiNote['id']; renote: MiNote } {
	return (
		note.renote != null &&
		note.reply == null &&
		note.text == null &&
		note.cw == null &&
		(note.fileIds == null || note.fileIds.length === 0) &&
		!note.hasPoll
	);
}

function getReactionNoteIds(notes: MiNote[]): Set<string> {
	const reactionNoteIds = new Set<string>();
	for (const note of notes) {
		if (isPureRenote(note)) {
			reactionNoteIds.add(note.id);
			reactionNoteIds.add(note.renoteId);
		} else {
			reactionNoteIds.add(note.id);
		}
	}
	return reactionNoteIds;
}

async function nullIfEntityNotFound<T>(promise: Promise<T>): Promise<T | null> {
	try {
		return await promise;
	} catch (err) {
		if (err instanceof EntityNotFoundError) {
			return null;
		}
		throw err;
	}
}

@Injectable()
export class NoteEntityService implements OnModuleInit {
	private userEntityService: UserEntityService;
	private driveFileEntityService: DriveFileEntityService;
	private customEmojiService: CustomEmojiService;
	private reactionService: ReactionService;
	private reactionsBufferingService: ReactionsBufferingService;
	private idService: IdService;
	private cacheService: CacheService;
	private noteLikeService: NoteLikeService;
	private noteLoader = new DebounceLoader(this.findNoteOrFail);

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.pollVotesRepository)
		private pollVotesRepository: PollVotesRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.noteFavoritesRepository)
		private noteFavoritesRepository: NoteFavoritesRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		//private userEntityService: UserEntityService,
		//private driveFileEntityService: DriveFileEntityService,
		//private customEmojiService: CustomEmojiService,
		//private reactionService: ReactionService,
		//private reactionsBufferingService: ReactionsBufferingService,
		//private idService: IdService,
		//private cacheService: CacheService,
	) {
	}

	onModuleInit() {
		this.userEntityService = this.moduleRef.get('UserEntityService');
		this.driveFileEntityService = this.moduleRef.get('DriveFileEntityService');
		this.customEmojiService = this.moduleRef.get('CustomEmojiService');
		this.reactionService = this.moduleRef.get('ReactionService');
		this.reactionsBufferingService = this.moduleRef.get('ReactionsBufferingService');
		this.idService = this.moduleRef.get('IdService');
		this.cacheService = this.moduleRef.get('CacheService');
		this.noteLikeService = this.moduleRef.get('NoteLikeService');
	}

	@bindThis
	private treatVisibility(packedNote: NoteVisibilityData): Packed<'Note'>['visibility'] {
		if (packedNote.visibility === 'public' || packedNote.visibility === 'home') {
			const followersOnlyBefore = packedNote.user.makeNotesFollowersOnlyBefore;
			if (shouldHideNoteByTime(followersOnlyBefore, packedNote.createdAt)) {
				packedNote.visibility = 'followers';
			}
		}
		return packedNote.visibility;
	}

	@bindThis
	public async shouldHideNote(packedNote: NoteVisibilityData, meId: MiUser['id'] | null): Promise<boolean> {
		if (meId === packedNote.userId) return false;
		// TODO: isVisibleForMe を使うようにしても良さそう(型違うけど)

		if (packedNote.user.requireSigninToViewContents && meId == null) {
			return true;
		}

		const hiddenBefore = packedNote.user.makeNotesHiddenBefore;
		if (shouldHideNoteByTime(hiddenBefore, packedNote.createdAt)) {
			return true;
		}

		// visibility が specified かつ自分が指定されていなかったら非表示
		if (packedNote.visibility === 'specified') {
			if (meId == null) {
				return true;
			} else {
				// 指定されているかどうか
				const specified = packedNote.visibleUserIds!.some(id => meId === id);

				if (!specified) {
					return true;
				}
			}
		}

		// visibility が followers かつ自分が投稿者のフォロワーでなかったら非表示
		if (packedNote.visibility === 'followers') {
			if (meId == null) {
				return true;
			} else if (packedNote.reply && (meId === packedNote.reply.userId)) {
				// 自分の投稿に対するリプライ
				return false;
			} else if (packedNote.mentions && packedNote.mentions.some(id => meId === id)) {
				// 自分へのメンション
				return false;
			} else {
				// フォロワーかどうか
				const followings = await this.cacheService.userFollowingsCache.fetch(meId);
				if (!Object.hasOwn(followings, packedNote.userId)) {
					return true;
				}
			}
		}

		return false;
	}

	@bindThis
	public hideNote(packedNote: Packed<'Note'>): void {
		packedNote.visibleUserIds = undefined;
		packedNote.fileIds = [];
		packedNote.files = [];
		packedNote.text = null;
		packedNote.poll = undefined;
		packedNote.cw = null;
		packedNote.isHidden = true;
		packedNote.likeCount = 0;
		packedNote.isLiked = false;
		packedNote.likeUsers = [];
		packedNote.viewsCount = 0;
		packedNote.favoritesCount = 0;
		packedNote.isFavorited = false;
		// TODO: hiddenReason みたいなのを提供しても良さそう
	}

	@bindThis
	private async populatePoll(note: MiNote, meId: MiUser['id'] | null) {
		const poll = await this.pollsRepository.findOneByOrFail({ noteId: note.id });
		const choices = poll.choices.map(c => ({
			text: c,
			votes: poll.votes[poll.choices.indexOf(c)],
			isVoted: false,
		}));

		if (meId) {
			if (poll.multiple) {
				const votes = await this.pollVotesRepository.findBy({
					userId: meId,
					noteId: note.id,
				});

				const myChoices = votes.map(v => v.choice);
				for (const myChoice of myChoices) {
					choices[myChoice].isVoted = true;
				}
			} else {
				const vote = await this.pollVotesRepository.findOneBy({
					userId: meId,
					noteId: note.id,
				});

				if (vote) {
					choices[vote.choice].isVoted = true;
				}
			}
		}

		return {
			multiple: poll.multiple,
			expiresAt: poll.expiresAt?.toISOString() ?? null,
			choices,
		};
	}

	@bindThis
	public async populateMyReaction(note: { id: MiNote['id']; reactions: MiNote['reactions']; reactionAndUserPairCache?: MiNote['reactionAndUserPairCache']; }, meId: MiUser['id'], _hint_?: {
		myReactions: Map<MiNote['id'], string | null>;
	}) {
		if (_hint_?.myReactions) {
			const reaction = _hint_.myReactions.get(note.id);
			if (reaction) {
				return this.reactionService.convertLegacyReaction(reaction);
			} else {
				return undefined;
			}
		}

		const reactionsCount = Object.values(note.reactions).reduce((a, b) => a + b, 0);
		if (reactionsCount === 0) return undefined;
		if (note.reactionAndUserPairCache && reactionsCount <= note.reactionAndUserPairCache.length) {
			const pair = note.reactionAndUserPairCache.find(p => p.startsWith(`${meId}/`));
			if (pair) {
				return this.reactionService.convertLegacyReaction(parseReactionUserPair(pair)[1]);
			} else {
				return undefined;
			}
		}

		// パフォーマンスのためノートが作成されてから2秒以上経っていない場合はリアクションを取得しない
		if (this.idService.parse(note.id).date.getTime() + 2000 > Date.now()) {
			return undefined;
		}

		const reaction = await this.noteReactionsRepository.findOneBy({
			userId: meId,
			noteId: note.id,
		});

		if (reaction) {
			return this.reactionService.convertLegacyReaction(reaction.reaction);
		}

		return undefined;
	}

	@bindThis
	private async getFavoriteStates(noteIds: MiNote['id'][], meId: MiUser['id'] | null): Promise<Map<MiNote['id'], NoteFavoriteState>> {
		const states = new Map(noteIds.map(id => [id, { favoritesCount: 0, isFavorited: false }]));
		if (noteIds.length === 0) return states;

		const rows = await this.noteFavoritesRepository.createQueryBuilder('favorite')
			.select('favorite.noteId', 'noteId')
			.addSelect('COUNT(*)', 'count')
			.addSelect(meId == null ? 'FALSE' : 'BOOL_OR(favorite.userId = :meId)', 'isFavorited')
			.where('favorite.noteId IN (:...noteIds)', { noteIds, meId })
			.groupBy('favorite.noteId')
			.getRawMany<{ noteId: string; count: string; isFavorited: boolean }>();
		for (const row of rows) {
			states.set(row.noteId, { favoritesCount: Number(row.count), isFavorited: row.isFavorited });
		}
		return states;
	}

	@bindThis
	public async isContentVisible(note: MiNote, me?: { id: MiUser['id'] } | null, author?: Packed<'UserLite'>): Promise<boolean> {
		if (isDeletedReply(note)) return false;
		if (me?.id === note.userId) return true;
		if (me != null && (await this.cacheService.userBlockedCache.fetch(me.id)).has(note.userId)) return false;
		const visibilityNote: NoteVisibilityData = {
			id: note.id, createdAt: this.idService.parse(note.id).date.toISOString(), userId: note.userId,
			user: author ?? await this.userEntityService.pack(note.user ?? note.userId, me),
			visibility: note.visibility, visibleUserIds: note.visibleUserIds, mentions: note.mentions,
			reply: note.replyUserId == null ? null : { userId: note.replyUserId },
		};
		this.treatVisibility(visibilityNote);
		return !await this.shouldHideNote(visibilityNote, me?.id ?? null);
	}

	@bindThis
	public async isVisibleForMe(note: MiNote, meId: MiUser['id'] | null): Promise<boolean> {
		// This code must always be synchronized with the checks in QueryService.generateVisibilityQuery.
		// visibility が specified かつ自分が指定されていなかったら非表示
		if (note.visibility === 'specified') {
			if (meId == null) {
				return false;
			} else if (meId === note.userId) {
				return true;
			} else {
				// 指定されているかどうか
				return note.visibleUserIds.some(id => meId === id);
			}
		}

		// visibility が followers かつ自分が投稿者のフォロワーでなかったら非表示
		if (note.visibility === 'followers') {
			if (meId == null) {
				return false;
			} else if (meId === note.userId) {
				return true;
			} else if (note.replyUserId && (meId === note.replyUserId)) {
				// 自分の投稿に対するリプライ
				return true;
			} else if (note.mentions && note.mentions.some(id => meId === id)) {
				// 自分へのメンション
				return true;
			} else {
				// フォロワーかどうか
				const [following, user] = await Promise.all([
					this.followingsRepository.count({
						where: {
							followeeId: note.userId,
							followerId: meId,
						},
						take: 1,
					}),
					this.usersRepository.findOneByOrFail({ id: meId }),
				]);

				/* If we know the following, everyhting is fine.

				But if we do not know the following, it might be that both the
				author of the note and the author of the like are remote users,
				in which case we can never know the following. Instead we have
				to assume that the users are following each other.
				*/
				return following > 0 || (note.userHost != null && user.host != null);
			}
		}

		return true;
	}

	@bindThis
	public async packAttachedFiles(fileIds: MiNote['fileIds'], packedFiles: Map<MiNote['fileIds'][number], Packed<'DriveFile'> | null>): Promise<Packed<'DriveFile'>[]> {
		const missingIds = [];
		for (const id of fileIds) {
			if (!packedFiles.has(id)) missingIds.push(id);
		}
		if (missingIds.length) {
			const additionalMap = await this.driveFileEntityService.packManyByIdsMap(missingIds);
			for (const [k, v] of additionalMap) {
				packedFiles.set(k, v);
			}
		}
		return fileIds.map(id => packedFiles.get(id)).filter(x => x != null);
	}

	@bindThis
	public async pack(
		src: MiNote['id'] | MiNote,
		me?: { id: MiUser['id'] } | null | undefined,
		options?: {
			detail?: boolean;
			skipHide?: boolean;
			withReactionAndUserPairCache?: boolean;
			_hint_?: {
				bufferedReactions: Map<MiNote['id'], { deltas: Record<string, number>; pairs: ([MiUser['id'], string])[] }> | null;
				myReactions: Map<MiNote['id'], string | null>;
				favorites: Map<MiNote['id'], NoteFavoriteState>;
				packedFiles: Map<MiNote['fileIds'][number], Packed<'DriveFile'> | null>;
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>
				noteLikes?: Map<MiNote['id'], Packed<'LikeState'>>;
			};
		},
	): Promise<Packed<'Note'>> {
		const opts = Object.assign({
			detail: true,
			skipHide: false,
			withReactionAndUserPairCache: false,
		}, options);

		const meId = me ? me.id : null;
		const note = typeof src === 'object' ? src : await this.noteLoader.load(src);
		const host = note.userHost;
		const deleted = isDeletedReply(note);
		const likeStates = deleted ? null : opts._hint_?.noteLikes?.has(note.id)
			? opts._hint_.noteLikes
			: await this.noteLikeService.getStates([note.id], me);
		const likes = likeStates?.get(note.id) ?? { likeCount: 0, isLiked: false, likeUsers: [] };
		const favorites = deleted ? { favoritesCount: 0, isFavorited: false }
			: opts._hint_?.favorites.get(note.id) ?? (await this.getFavoriteStates([note.id], meId)).get(note.id)!;

		const bufferedReactions = deleted ? { deltas: {}, pairs: [] } : opts._hint_?.bufferedReactions != null
			? (opts._hint_.bufferedReactions.get(note.id) ?? { deltas: {}, pairs: [] })
			: this.meta.enableReactionsBuffering
				? await this.reactionsBufferingService.get(note.id)
				: { deltas: {}, pairs: [] };
		const reactions = deleted ? {} : this.reactionService.convertLegacyReactions(this.reactionsBufferingService.mergeReactions(note.reactions, bufferedReactions.deltas ?? {}));

		const reactionAndUserPairCache = note.reactionAndUserPairCache.concat(bufferedReactions.pairs.map(x => x.join('/')));

		let text = note.text;

		if (note.name && (note.url ?? note.uri)) {
			text = `【${note.name}】\n${(note.text ?? '').trim()}\n\n${note.url ?? note.uri}`;
		}

		const channel = note.channelId
			? note.channel
				? note.channel
				: await this.channelsRepository.findOneBy({ id: note.channelId })
			: null;

		const reactionEmojiNames = Object.keys(reactions)
			.filter(x => x.startsWith(':') && x.includes('@') && !x.includes('@.')) // リモートカスタム絵文字のみ
			.map(x => this.reactionService.decodeReaction(x).reaction.replaceAll(':', ''));
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;

		const packed: Packed<'Note'> = await awaitAll({
			id: note.id,
			isDeleted: deleted || undefined,
			deletedBy: deleted ? note.deletedBy ?? undefined : undefined,
			...likes,
			createdAt: this.idService.parse(note.id).date.toISOString(),
			userId: note.userId,
			user: packedUsers?.get(note.userId) ?? this.userEntityService.pack(note.user ?? note.userId, me),
			text: text,
			cw: note.cw,
			visibility: note.visibility,
			localOnly: note.localOnly,
			reactionAcceptance: note.reactionAcceptance,
			visibleUserIds: note.visibility === 'specified' ? note.visibleUserIds : undefined,
			renoteCount: note.renoteCount,
			repliesCount: note.repliesCount,
			viewsCount: deleted ? 0 : note.viewsCount,
			favoritesCount: favorites.favoritesCount,
			reactionCount: Object.values(reactions).reduce((a, b) => a + b, 0),
			reactions: reactions,
			reactionEmojis: this.customEmojiService.populateEmojis(reactionEmojiNames, host),
			reactionAndUserPairCache: opts.withReactionAndUserPairCache ? reactionAndUserPairCache : undefined,
			emojis: host != null ? this.customEmojiService.populateEmojis(note.emojis, host) : undefined,
			tags: note.tags.length > 0 ? note.tags : undefined,
			fileIds: note.fileIds,
			files: packedFiles != null ? this.packAttachedFiles(note.fileIds, packedFiles) : this.driveFileEntityService.packManyByIds(note.fileIds),
			replyId: note.replyId,
			renoteId: deleted ? null : note.renoteId,
			isPublishedReply: note.replyId != null && note.renoteId == null ? !isOrdinaryReply(note) : undefined,
			channelId: note.channelId ?? undefined,
			channel: channel ? {
				id: channel.id,
				name: channel.name,
				color: channel.color,
				isSensitive: channel.isSensitive,
				allowRenoteToExternal: channel.allowRenoteToExternal,
				userId: channel.userId,
			} : undefined,
			mentions: note.mentions.length > 0 ? note.mentions : undefined,
			hasPoll: !deleted && note.hasPoll || undefined,
			uri: note.uri ?? undefined,
			url: note.url ?? undefined,

			...(opts.detail ? {
				clippedCount: note.clippedCount,

				// そもそもJOINしていない場合はundefined、JOINしたけど存在していなかった場合はnullで区別される
				reply: (note.replyId && note.reply === null) ? null : note.replyId ? nullIfEntityNotFound(this.pack(note.reply ?? note.replyId, me, {
					detail: false,
					skipHide: opts.skipHide,
					withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
					_hint_: options?._hint_,
				})) : undefined,

				// そもそもJOINしていない場合はundefined、JOINしたけど存在していなかった場合はnullで区別される
				renote: deleted ? undefined : (note.renoteId && note.renote === null) ? null : note.renoteId ? nullIfEntityNotFound(this.pack(note.renote ?? note.renoteId, me, {
					detail: true,
					skipHide: opts.skipHide,
					withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
					_hint_: options?._hint_,
				})) : undefined,

				poll: !deleted && note.hasPoll ? this.populatePoll(note, meId) : undefined,

				...(meId && Object.keys(reactions).length > 0 ? {
					myReaction: this.populateMyReaction({
						id: note.id,
						reactions: reactions,
						reactionAndUserPairCache: reactionAndUserPairCache,
					}, meId, options?._hint_),
				} : {}),

			} : {}),

			...(meId ? {
				isFavorited: favorites.isFavorited,
			} : {}),
		});

		this.treatVisibility(packed);

		if (!opts.skipHide && (await this.shouldHideNote(packed, meId))) {
			this.hideNote(packed);
		}

		return packed;
	}

	@bindThis
	public async packMany(
		notes: MiNote[],
		me?: { id: MiUser['id'] } | null | undefined,
		options?: {
			detail?: boolean;
			skipHide?: boolean;
		},
	) {
		if (notes.length === 0) return [];

		const bufferedReactions = this.meta.enableReactionsBuffering ? await this.reactionsBufferingService.getMany([...getReactionNoteIds(notes)]) : null;

		const meId = me ? me.id : null;
		const myReactionsMap = new Map<MiNote['id'], string | null>();
		if (meId) {
			const idsNeedFetchMyReaction = new Set<MiNote['id']>();

			// パフォーマンスのためノートが作成されてから2秒以上経っていない場合はリアクションを取得しない
			const oldId = this.idService.gen(Date.now() - 2000);
			const collectMyReaction = (note: MiNote, includeRecent: boolean): void => {
				if (!includeRecent && note.id >= oldId) {
					myReactionsMap.set(note.id, null);
					return;
				}

				const reactionsCount = Object.values(this.reactionsBufferingService.mergeReactions(note.reactions, bufferedReactions?.get(note.id)?.deltas ?? {})).reduce((a, b) => a + b, 0);
				if (reactionsCount === 0) {
					myReactionsMap.set(note.id, null);
				} else if (reactionsCount <= note.reactionAndUserPairCache.length + (bufferedReactions?.get(note.id)?.pairs.length ?? 0)) {
					const pairInBuffer = bufferedReactions?.get(note.id)?.pairs.find(p => p[0] === meId);
					if (pairInBuffer) {
						myReactionsMap.set(note.id, pairInBuffer[1]);
					} else {
						const pair = note.reactionAndUserPairCache.find(p => p.startsWith(`${meId}/`));
						myReactionsMap.set(note.id, pair ? parseReactionUserPair(pair)[1] : null);
					}
				} else {
					idsNeedFetchMyReaction.add(note.id);
				}
			};

			for (const note of notes) {
				if (isPureRenote(note)) {
					collectMyReaction(note.renote, true);
					collectMyReaction(note, true);
				} else {
					collectMyReaction(note, false);
				}
			}

			const myReactions = idsNeedFetchMyReaction.size > 0 ? await this.noteReactionsRepository.findBy({
				userId: meId,
				noteId: In(Array.from(idsNeedFetchMyReaction)),
			}) : [];

			for (const id of idsNeedFetchMyReaction) {
				myReactionsMap.set(id, myReactions.find(reaction => reaction.noteId === id)?.reaction ?? null);
			}
		}

		// 同时统计本体及引用目标，避免列表逐条查询收藏数和自己的收藏状态。
		const favoriteTargetIds = [...new Set(notes.flatMap(note => [note.id, note.replyId, note.renoteId]).filter(id => id != null))];
		const favorites = await this.getFavoriteStates(favoriteTargetIds, meId);

		await this.customEmojiService.prefetchEmojis(this.aggregateNoteEmojis(notes));
		// TODO: 本当は renote とか reply がないのに renoteId とか replyId があったらここで解決しておく
		const fileIds = notes.map(n => [n.fileIds, n.renote?.fileIds, n.reply?.fileIds]).flat(2).filter(x => x != null);
		const packedFiles = fileIds.length > 0 ? await this.driveFileEntityService.packManyByIdsMap(fileIds) : new Map();
		const users = [
			...notes.map(({ user, userId }) => user ?? userId),
			...notes.map(({ replyUserId }) => replyUserId).filter(x => x != null),
			...notes.map(({ renoteUserId }) => renoteUserId).filter(x => x != null),
		];
		const packedUsers = await this.userEntityService.packMany(users, me)
			.then(users => new Map(users.map(u => [u.id, u])));
		const likeNoteIds = [...new Set(notes.flatMap(note => [note.id, note.replyId, note.renoteId]).filter(id => id != null))];
		const noteLikes = await this.noteLikeService.getStates(likeNoteIds, me);

		return await Promise.all(notes.map(n => this.pack(n, me, {
			...options,
			_hint_: {
				bufferedReactions,
				myReactions: myReactionsMap,
				favorites,
				packedFiles,
				packedUsers,
				noteLikes,
			},
		})));
	}

	@bindThis
	public aggregateNoteEmojis(notes: MiNote[]) {
		let emojis: { name: string | null; host: string | null; }[] = [];
		for (const note of notes) {
			emojis = emojis.concat(note.emojis
				.map(e => this.customEmojiService.parseEmojiStr(e, note.userHost)));
			if (note.renote) {
				emojis = emojis.concat(note.renote.emojis
					.map(e => this.customEmojiService.parseEmojiStr(e, note.renote!.userHost)));
				if (note.renote.user) {
					emojis = emojis.concat(note.renote.user.emojis
						.map(e => this.customEmojiService.parseEmojiStr(e, note.renote!.userHost)));
				}
			}
			const customReactions = Object.keys(note.reactions).map(x => this.reactionService.decodeReaction(x)).filter(x => x.name != null) as typeof emojis;
			emojis = emojis.concat(customReactions);
			if (note.user) {
				emojis = emojis.concat(note.user.emojis
					.map(e => this.customEmojiService.parseEmojiStr(e, note.userHost)));
			}
		}
		return emojis.filter(x => x.name != null && x.host != null) as { name: string; host: string; }[];
	}

	@bindThis
	private findNoteOrFail(id: string): Promise<MiNote> {
		return this.notesRepository.findOneOrFail({
			where: { id },
			relations: {
				user: true,
				renote: true,
				reply: true,
			},
		});
	}

	@bindThis
	public async fetchDiffs(noteIds: MiNote['id'][], me?: { id: MiUser['id'] } | null) {
		if (noteIds.length === 0) return [];

		const notes = await this.notesRepository.find({
			where: {
				id: In(noteIds),
			},
			select: {
				id: true,
				threadId: true,
				userId: true,
				visibility: true,
				visibleUserIds: true,
				mentions: true,
				replyUserId: true,
				userHost: true,
				reactions: true,
				reactionAndUserPairCache: true,
				repliesCount: true,
				renoteCount: true,
				viewsCount: true,
				deletedBy: true,
			},
		});

		const bufferedReactionsMap = this.meta.enableReactionsBuffering ? await this.reactionsBufferingService.getMany(noteIds) : null;
		const authors = await this.userEntityService.packMany([...new Set(notes.map(note => note.userId))], me);
		const authorsById = new Map(authors.map(user => [user.id, user]));
		const visible = await Promise.all(notes.map(note => this.isContentVisible(note, me, authorsById.get(note.userId))));
		const visibleNoteIds = notes.filter((_note, index) => visible[index]).map(note => note.id);
		const [likeStates, favoriteStates] = await Promise.all([
			this.noteLikeService.getStates(visibleNoteIds, me),
			this.getFavoriteStates(visibleNoteIds, me?.id ?? null),
		]);
		const visibleIds = new Set(visibleNoteIds);

		const packings = notes.filter(note => !isDeletedReply(note)).map(note => {
			const bufferedReactions = bufferedReactionsMap?.get(note.id);
			//const reactionAndUserPairCache = note.reactionAndUserPairCache.concat(bufferedReactions.pairs.map(x => x.join('/')));

			const reactions = this.reactionService.convertLegacyReactions(this.reactionsBufferingService.mergeReactions(note.reactions, bufferedReactions?.deltas ?? {}));

			const reactionEmojiNames = Object.keys(reactions)
				.filter(x => x.startsWith(':') && x.includes('@') && !x.includes('@.')) // リモートカスタム絵文字のみ
				.map(x => this.reactionService.decodeReaction(x).reaction.replaceAll(':', ''));

			return this.customEmojiService.populateEmojis(reactionEmojiNames, note.userHost).then(reactionEmojis => ({
				id: note.id,
				...(likeStates.get(note.id) ?? { likeCount: 0, isLiked: false, likeUsers: [] }),
				...(favoriteStates.get(note.id) ?? { favoritesCount: 0, isFavorited: false }),
				viewsCount: visibleIds.has(note.id) ? note.viewsCount : 0,
				reactions,
				reactionEmojis,
				repliesCount: note.repliesCount,
				renoteCount: note.renoteCount,
			}));
		});
		const deletedPackings = notes.filter(note => isDeletedReply(note)).map(note => ({
			id: note.id,
			isDeleted: true as const,
			deletedBy: note.deletedBy,
			likeCount: 0, isLiked: false, likeUsers: [],
			favoritesCount: 0, isFavorited: false, viewsCount: 0,
			reactions: {}, reactionEmojis: {}, repliesCount: note.repliesCount, renoteCount: 0,
		}));

		return await Promise.all([...packings, ...deletedPackings]);
	}
}
