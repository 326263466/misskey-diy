/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { CONTENT_LIMITS } from 'misskey-js';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { Redis } from 'ioredis';
import { DI } from '@/di-symbols.js';
import { MiArticleComment } from '@/models/ArticleComment.js';
import { MiArticleCommentLike } from '@/models/ArticleCommentLike.js';
import { MiArticleFavorite } from '@/models/ArticleFavorite.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiPage } from '@/models/Page.js';
import { MiPageLike } from '@/models/PageLike.js';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { PageEntityService } from '@/core/entities/PageEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DriveFileValidationService } from '@/core/DriveFileValidationService.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { canReadArticle, isArticle } from '@/misc/article-access.js';

type Viewer = { id: MiUser['id'] };

@Injectable()
export class ArticleService {
	public static NoSuchArticleError = class extends Error {};
	public static NoSuchCommentError = class extends Error {};
	public static InvalidCommentError = class extends Error {};
	public static AccessDeniedError = class extends Error {};
	public static AlreadyLikedError = class extends Error {};
	public static NotLikedError = class extends Error {};

	constructor(
		@Inject(DI.db) private db: DataSource,
		@Inject(DI.redis) private redisClient: Redis,
		private idService: IdService,
		private roleService: RoleService,
		private pageEntityService: PageEntityService,
		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private driveFileValidationService: DriveFileValidationService,
	) {}

	public static isArticle(page: MiPage): boolean {
		return isArticle(page);
	}

	private async getArticleRecord(articleId: string, manager = this.db.manager, lock = false): Promise<MiPage> {
		const article = await manager.findOne(MiPage, { where: { id: articleId }, ...(lock ? { lock: { mode: 'for_no_key_update' as const } } : {}) });
		if (!article || !ArticleService.isArticle(article)) throw new ArticleService.NoSuchArticleError();
		return article;
	}

	public async getArticle(articleId: string, viewer: Viewer | null, manager = this.db.manager, lock = false): Promise<MiPage> {
		const article = await this.getArticleRecord(articleId, manager, lock);
		if (!await canReadArticle(article, viewer, manager)) throw new ArticleService.NoSuchArticleError();
		return article;
	}

	public async show(articleId: string, viewer: Viewer | null, ip?: string | null) {
		const article = await this.getArticle(articleId, viewer);
		await this.countView(article, viewer, ip);
		return {
			article: await this.pageEntityService.pack(article, viewer),
			commentsCount: await this.commentsQuery(articleId, viewer).andWhere('comment.isDeleted = false').getCount(),
			isFavorited: viewer ? await this.db.getRepository(MiArticleFavorite).existsBy({ articleId, userId: viewer.id }) : false,
		};
	}

	private async countView(article: MiPage, viewer: Viewer | null, ip?: string | null) {
		if (viewer?.id === article.userId || (!viewer && !ip) || this.redisClient.status !== 'ready') return;
		// 登录访客按账号、匿名访客按 IP 去重；缓存中不保留原始 IP。
		const identity = createHash('sha256').update(viewer ? `user:${viewer.id}` : `ip:${ip}`).digest('hex');
		const key = `article:view:${article.id}:${identity}`;
		const counting = (async () => {
			if (await this.redisClient.set(key, '1', 'EX', 30 * 60, 'NX') !== 'OK') return;
			const result = await this.db.getRepository(MiPage).createQueryBuilder().update()
				.set({ articleViews: () => '"articleViews" + 1' })
				.where('id = :id AND "articleViews" < 2147483647', { id: article.id })
				.returning('articleViews').execute();
			article.articleViews = (result.raw as { articleViews: number }[])[0]?.articleViews ?? article.articleViews;
		})().catch(() => { /* 统计故障不影响阅读。 */ });
		let timeout: NodeJS.Timeout | undefined;
		try {
			// Redis 离线队列或数据库行锁都可能长时间等待，阅读最多等待 200ms。
			await Promise.race([counting, new Promise<void>(resolve => { timeout = setTimeout(resolve, 200); })]);
		} finally { clearTimeout(timeout); }
	}

	public async filterAccessiblePages(pages: MiPage[], viewer: Viewer | null): Promise<MiPage[]> {
		const checks = new Map<string, Promise<boolean>>();
		const accessible = await Promise.all(pages.map(async page => {
			if (!ArticleService.isArticle(page)) return true;
			const key = JSON.stringify([page.userId, page.visibility, page.visibleUserIds]);
			if (!checks.has(key)) {
				checks.set(key, this.getArticle(page.id, viewer).then(() => true).catch(error => {
					if (error instanceof ArticleService.NoSuchArticleError) return false;
					throw error;
				}));
			}
			return checks.get(key)!;
		}));
		return pages.filter((_, index) => accessible[index]);
	}

	public async setLiked(articleId: string, viewer: Viewer, liked: boolean, requireChange = false) {
		return this.db.transaction(async manager => {
			const article = await this.getArticleRecord(articleId, manager, true);
			const visible = await canReadArticle(article, viewer, manager);
			if (liked && !visible) throw new ArticleService.NoSuchArticleError();
			const likes = manager.getRepository(MiPageLike);
			const exists = await likes.existsBy({ pageId: articleId, userId: viewer.id });
			if (requireChange && exists === liked) throw liked ? new ArticleService.AlreadyLikedError() : new ArticleService.NotLikedError();
			if (liked && !exists) await likes.insert({ id: this.idService.gen(), pageId: articleId, userId: viewer.id });
			else if (!liked && exists) await likes.delete({ pageId: articleId, userId: viewer.id });
			const likedCount = await likes.countBy({ pageId: articleId });
			await manager.update(MiPage, articleId, { likedCount });
			// 撤销只清理自己的记录，不能借响应读取不可见文章的统计。
			return { likedCount: visible ? likedCount : 0, isLiked: liked };
		});
	}

	public async setFavorite(articleId: string, viewer: Viewer, favorited: boolean) {
		return this.db.transaction(async manager => {
			if (favorited) await this.getArticle(articleId, viewer, manager, true);
			else await this.getArticleRecord(articleId, manager, true);
			const favorites = manager.getRepository(MiArticleFavorite);
			if (favorited) {
				await favorites.createQueryBuilder().insert().values({ id: this.idService.gen(), articleId, userId: viewer.id }).orIgnore().execute();
			} else {
				await favorites.delete({ articleId, userId: viewer.id });
			}
			return { isFavorited: favorited };
		});
	}

	private commentsQuery(articleId: string, viewer: Viewer | null, manager = this.db.manager, alias = 'comment') {
		const query = manager.getRepository(MiArticleComment).createQueryBuilder(alias)
			.where(`${alias}.articleId = :articleId`, { articleId });
		if (viewer) {
			const blocking = manager.getRepository(MiBlocking).createQueryBuilder('blocking').select('1')
				.where(`(blocking.blockerId = :viewerId AND blocking.blockeeId = ${alias}.userId) OR (blocking.blockerId = ${alias}.userId AND blocking.blockeeId = :viewerId)`, { viewerId: viewer.id });
			query.andWhere(`NOT EXISTS (${blocking.getQuery()})`).setParameters(blocking.getParameters());
		}
		return query;
	}

	private commentTreeQuery(articleId: string, viewer: Viewer | null, condition: string, parameters: Record<string, unknown>, direction: 'ancestors' | 'descendants' = 'descendants', manager = this.db.manager) {
		// 同一实体属性重复选择会被 TypeORM 二次展开，rootId 使用原始列引用。
		const root = this.commentsQuery(articleId, viewer, manager, 'root')
			.select('root.id', 'id').addSelect('root.replyId', 'replyId').addSelect('root.isDeleted', 'isDeleted').addSelect('"root"."id"', 'rootId')
			.andWhere(condition, parameters);
		const relative = this.commentsQuery(articleId, viewer, manager, 'relative')
			.select('relative.id', 'id').addSelect('relative.replyId', 'replyId').addSelect('relative.isDeleted', 'isDeleted').addSelect('tree."rootId"', 'rootId')
			.innerJoin('comment_tree', 'tree', direction === 'descendants' ? 'relative.replyId = tree.id' : 'relative.id = tree."replyId"');
		// UNION 去重让异常环也能结束；拉黑过滤贯穿每一层，不跨不可见父评论串联讨论。
		return manager.createQueryBuilder()
			.addCommonTableExpression(`${root.getQuery()} UNION ${relative.getQuery()}`, 'comment_tree', { recursive: true })
			.from('comment_tree', 'tree')
			.setParameters({ ...root.getParameters(), ...relative.getParameters() });
	}

	private displayedCommentsQuery(articleId: string, viewer: Viewer | null, manager = this.db.manager) {
		const descendants = this.commentTreeQuery(articleId, viewer, 'root.id = comment.id', {}, 'descendants', manager)
			.select('1').where('tree."isDeleted" = false');
		return this.commentsQuery(articleId, viewer, manager)
			.andWhere(`(comment.isDeleted = false OR EXISTS (${descendants.getQuery()}))`)
			.setParameters(descendants.getParameters());
	}

	public async comments(articleId: string, viewer: Viewer | null, limit: number, untilId?: string, replyId?: string | null, sinceId?: string) {
		const article = await this.getArticle(articleId, viewer);
		const query = this.displayedCommentsQuery(articleId, viewer);
		// 只传 sinceId 时按时间正序翻页，用于子评论从最早的开始展示。
		const ascending = !untilId && !!sinceId;
		if (untilId) query.andWhere('comment.id < :untilId', { untilId });
		else if (sinceId) query.andWhere('comment.id > :sinceId', { sinceId });
		if (replyId === null) {
			// 拉黑造成的不可见父评论不占位，其正常回复独立显示；删除则保留原层级。
			const parent = this.commentsQuery(articleId, viewer, this.db.manager, 'parent').select('1')
				.andWhere('parent.id = comment.replyId');
			query.andWhere(`NOT EXISTS (${parent.getQuery()})`).setParameters(parent.getParameters());
		} else if (replyId !== undefined) {
			const descendants = this.commentTreeQuery(articleId, viewer, 'root.id = :replyId', { replyId })
				.select('tree.id').where('tree.id <> :replyId');
			query.andWhere(`comment.id IN (${descendants.getQuery()})`).setParameters(descendants.getParameters());
		}
		const comments = await query.orderBy('comment.id', ascending ? 'ASC' : 'DESC').take(limit).getMany();
		return this.packComments(comments, article, viewer);
	}

	public async createComment(articleId: string, viewer: Viewer, text: string, replyId?: string, fileIds: string[] = []) {
		const trimmed = text.trim();
		if ((!trimmed && fileIds.length === 0) || Array.from(text).length > CONTENT_LIMITS.commentText || trimmed.includes('\u0000')) throw new ArticleService.InvalidCommentError();
		const { article, comment } = await this.db.transaction(async manager => {
			const article = await this.getArticle(articleId, viewer, manager, true);
			if (replyId && !await this.commentsQuery(articleId, viewer, manager).andWhere('comment.id = :replyId AND comment.isDeleted = false', { replyId }).getExists()) throw new ArticleService.NoSuchCommentError();
			await this.driveFileValidationService.validateImages(manager, viewer.id, fileIds);
			const comment = manager.create(MiArticleComment, { id: this.idService.gen(), articleId, userId: viewer.id, text: trimmed, fileIds, isDeleted: false, replyId: replyId ?? null });
			await manager.insert(MiArticleComment, comment);
			return { article, comment };
		});
		return (await this.packComments([comment], article, viewer))[0];
	}

	public async setCommentLiked(commentId: string, viewer: Viewer, liked: boolean) {
		const comment = await this.db.getRepository(MiArticleComment).findOneBy({ id: commentId });
		if (!comment) throw new ArticleService.NoSuchCommentError();
		return this.db.transaction(async manager => {
			// 与评论创建和删除共用文章行锁，重试及并发不会重复点赞。
			const article = await this.getArticle(comment.articleId, viewer, manager, true).catch(error => {
				if (!liked && error instanceof ArticleService.NoSuchArticleError) return null;
				throw error;
			});
			const visible = article != null && await this.commentsQuery(comment.articleId, viewer, manager).andWhere('comment.id = :commentId AND comment.isDeleted = false', { commentId }).getExists();
			if (liked && !visible) throw new ArticleService.NoSuchCommentError();
			const likes = manager.getRepository(MiArticleCommentLike);
			if (liked) {
				await likes.createQueryBuilder().insert().values({ id: this.idService.gen(), commentId, userId: viewer.id }).orIgnore().execute();
			} else {
				await likes.delete({ commentId, userId: viewer.id });
			}
			// 撤回不受拉黑或可见范围变化限制，也不返回不可见评论的统计。
			return { likedCount: visible ? await likes.countBy({ commentId }) : 0, isLiked: liked };
		});
	}

	public async deleteComment(commentId: string, viewer: Viewer) {
		const comment = await this.db.getRepository(MiArticleComment).findOneBy({ id: commentId });
		if (!comment) throw new ArticleService.NoSuchCommentError();
		return this.db.transaction(async manager => {
			// 与创建、回复及文章删除按相同顺序锁定文章，避免校验后目标被删除。
			const article = await this.getArticle(comment.articleId, viewer, manager, true).catch(error => {
				if (comment.userId === viewer.id && error instanceof ArticleService.NoSuchArticleError) return null;
				throw error;
			});
			if (comment.userId !== viewer.id && article?.userId !== viewer.id && !await this.roleService.isModerator(viewer)) throw new ArticleService.AccessDeniedError();
			const result = await manager.update(MiArticleComment, { id: commentId, articleId: comment.articleId, isDeleted: false }, { isDeleted: true, text: '', fileIds: [] });
			if (!result.affected) throw new ArticleService.NoSuchCommentError();
			await manager.delete(MiArticleCommentLike, { commentId });
			// 作者仍可清理自己的评论，但不可借删除响应读取已不可见的文章讨论。
			if (article == null) return { commentId, commentsCount: 0, removedIds: [commentId], updatedComments: [] };
			const ancestors = this.commentTreeQuery(article.id, viewer, 'root.id = :commentId', { commentId }, 'ancestors', manager).select('tree.id');
			const affected = await this.commentsQuery(article.id, viewer, manager)
				.andWhere(`comment.id IN (${ancestors.getQuery()})`).setParameters(ancestors.getParameters()).getMany();
			const packed = await this.packComments(affected, article, viewer, manager);
			return {
				commentId,
				commentsCount: await this.commentsQuery(article.id, viewer, manager).andWhere('comment.isDeleted = false').getCount(),
				removedIds: packed.filter(item => item.isDeleted && item.repliesCount === 0).map(item => item.id),
				updatedComments: packed.filter(item => !item.isDeleted || item.repliesCount > 0),
			};
		});
	}

	private async packComments(comments: MiArticleComment[], article: MiPage, viewer: Viewer | null, manager = this.db.manager) {
		if (comments.length === 0) return [];
		const replyCounts = await this.commentTreeQuery(article.id, viewer, 'root.id IN (:...rootIds)', { rootIds: comments.map(comment => comment.id) }, 'descendants', manager)
			.select('tree."rootId"', 'rootId')
			.addSelect('COUNT(*)', 'count')
			.where('tree."isDeleted" = false AND tree.id <> tree."rootId"')
			.groupBy('tree."rootId"')
			.getRawMany<{ rootId: string; count: string }>();
		const repliesCount = new Map(replyCounts.map(count => [count.rootId, Number(count.count)]));
		const likeCounts = await manager.getRepository(MiArticleCommentLike).createQueryBuilder('commentLike')
			.select('commentLike.commentId', 'commentId')
			.addSelect('COUNT(*)', 'count')
			.addSelect('BOOL_OR(commentLike.userId = :viewerId)', 'isLiked')
			.where('commentLike.commentId IN (:...ids)', { ids: comments.map(comment => comment.id) })
			.setParameter('viewerId', viewer?.id ?? null)
			.groupBy('commentLike.commentId')
			.getRawMany<{ commentId: string; count: string; isLiked: boolean | null }>();
		const likes = new Map(likeCounts.map(count => [count.commentId, count]));
		const replyIds = comments.flatMap(comment => comment.replyId ? [comment.replyId] : []);
		const replies = replyIds.length ? await this.commentsQuery(article.id, viewer, manager).andWhere('comment.id IN (:...replyIds)', { replyIds }).getMany() : [];
		const replyMap = new Map(replies.map(reply => [reply.id, reply]));
		const userIds = [...new Set([...comments, ...replies].map(comment => comment.userId))];
		const users = new Map((await this.userEntityService.packMany(userIds, viewer)).map(user => [user.id, user]));
		const fileIds = [...new Set(comments.flatMap(comment => comment.isDeleted ? [] : comment.fileIds))];
		const files = fileIds.length ? await manager.getRepository(MiDriveFile).findBy({ id: In(fileIds) }) : [];
		const packedFiles = new Map((await this.driveFileEntityService.packMany(files)).map(file => [file.id, file]));
		const moderator = viewer ? await this.roleService.isModerator(viewer) : false;
		return comments.map(comment => {
			const reply = comment.replyId ? replyMap.get(comment.replyId) : undefined;
			return {
				id: comment.id, articleId: comment.articleId, replyId: reply?.id ?? null,
				isDeleted: comment.isDeleted,
				repliesCount: repliesCount.get(comment.id) ?? 0,
				likedCount: comment.isDeleted ? 0 : Number(likes.get(comment.id)?.count ?? 0),
				isLiked: !comment.isDeleted && likes.get(comment.id)?.isLiked === true,
				createdAt: this.idService.parse(comment.id).date.toISOString(),
				user: users.get(comment.userId)!, text: comment.isDeleted ? '' : comment.text,
				files: comment.isDeleted ? [] : comment.fileIds.flatMap(id => packedFiles.has(id) ? [packedFiles.get(id)!] : []),
				canDelete: !comment.isDeleted && !!viewer && (viewer.id === comment.userId || viewer.id === article.userId || moderator),
				replyTo: reply ? { id: reply.id, user: users.get(reply.userId)!, text: reply.isDeleted ? '' : reply.text.slice(0, 160), isDeleted: reply.isDeleted } : null,
			};
		});
	}
}
