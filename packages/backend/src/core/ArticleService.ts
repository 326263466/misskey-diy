/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { CONTENT_LIMITS } from 'misskey-js';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, IsNull, LessThan } from 'typeorm';
import type { Redis } from 'ioredis';
import { DI } from '@/di-symbols.js';
import { MiArticleComment } from '@/models/ArticleComment.js';
import { MiArticleFavorite } from '@/models/ArticleFavorite.js';
import { MiPage } from '@/models/Page.js';
import { MiPageLike } from '@/models/PageLike.js';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { PageEntityService } from '@/core/entities/PageEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DriveFileLifecycleService } from '@/core/DriveFileLifecycleService.js';
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
		private driveFileLifecycleService: DriveFileLifecycleService,
	) {}

	public static isArticle(page: MiPage): boolean {
		return isArticle(page);
	}

	public async getArticle(articleId: string, viewer: Viewer | null, manager = this.db.manager, lock = false): Promise<MiPage> {
		const article = await manager.findOne(MiPage, { where: { id: articleId }, ...(lock ? { lock: { mode: 'for_no_key_update' as const } } : {}) });
		if (!article || !ArticleService.isArticle(article)) throw new ArticleService.NoSuchArticleError();
		if (!await canReadArticle(article, viewer, manager)) throw new ArticleService.NoSuchArticleError();
		return article;
	}

	public async show(articleId: string, viewer: Viewer | null, ip?: string | null) {
		const article = await this.getArticle(articleId, viewer);
		await this.countView(article, viewer, ip);
		return {
			article: await this.pageEntityService.pack(article, viewer),
			commentsCount: await this.db.getRepository(MiArticleComment).countBy({ articleId }),
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
			await this.getArticle(articleId, viewer, manager, true);
			const likes = manager.getRepository(MiPageLike);
			const exists = await likes.existsBy({ pageId: articleId, userId: viewer.id });
			if (requireChange && exists === liked) throw liked ? new ArticleService.AlreadyLikedError() : new ArticleService.NotLikedError();
			if (liked && !exists) await likes.insert({ id: this.idService.gen(), pageId: articleId, userId: viewer.id });
			else if (!liked && exists) await likes.delete({ pageId: articleId, userId: viewer.id });
			const likedCount = await likes.countBy({ pageId: articleId });
			await manager.update(MiPage, articleId, { likedCount });
			return { likedCount, isLiked: liked };
		});
	}

	public async setFavorite(articleId: string, viewer: Viewer, favorited: boolean) {
		return this.db.transaction(async manager => {
			await this.getArticle(articleId, viewer, manager, true);
			const favorites = manager.getRepository(MiArticleFavorite);
			if (favorited) {
				await favorites.createQueryBuilder().insert().values({ id: this.idService.gen(), articleId, userId: viewer.id }).orIgnore().execute();
			} else {
				await favorites.delete({ articleId, userId: viewer.id });
			}
			return { isFavorited: favorited };
		});
	}

	public async comments(articleId: string, viewer: Viewer | null, limit: number, untilId?: string, replyId?: string | null) {
		const article = await this.getArticle(articleId, viewer);
		const comments = await this.db.getRepository(MiArticleComment).find({
			where: {
				articleId,
				...(untilId ? { id: LessThan(untilId) } : {}),
				...(replyId !== undefined ? { replyId: replyId === null ? IsNull() : replyId } : {}),
			},
			order: { id: 'DESC' }, take: limit,
		});
		return this.packComments(comments, article, viewer);
	}

	public async createComment(articleId: string, viewer: Viewer, text: string, replyId?: string, fileIds: string[] = []) {
		const trimmed = text.trim();
		if ((!trimmed && fileIds.length === 0) || Array.from(text).length > CONTENT_LIMITS.commentText || trimmed.includes('\u0000')) throw new ArticleService.InvalidCommentError();
		const { article, comment } = await this.db.transaction(async manager => {
			const article = await this.getArticle(articleId, viewer, manager, true);
			if (replyId && !await manager.existsBy(MiArticleComment, { id: replyId, articleId })) throw new ArticleService.NoSuchCommentError();
			await this.driveFileLifecycleService.validateImages(manager, viewer.id, fileIds);
			const comment = manager.create(MiArticleComment, { id: this.idService.gen(), articleId, userId: viewer.id, text: trimmed, fileIds, replyId: replyId ?? null });
			await manager.insert(MiArticleComment, comment);
			return { article, comment };
		});
		return (await this.packComments([comment], article, viewer))[0];
	}

	public async deleteComment(commentId: string, viewer: Viewer) {
		const comment = await this.db.getRepository(MiArticleComment).findOneBy({ id: commentId });
		if (!comment) throw new ArticleService.NoSuchCommentError();
		await this.db.transaction(async manager => {
			// 与创建、回复及文章删除按相同顺序锁定文章，避免校验后目标被删除。
			const article = await this.getArticle(comment.articleId, viewer, manager, true);
			if (comment.userId !== viewer.id && article.userId !== viewer.id && !await this.roleService.isModerator(viewer)) throw new ArticleService.AccessDeniedError();
			const result = await manager.delete(MiArticleComment, { id: commentId, articleId: article.id });
			if (!result.affected) throw new ArticleService.NoSuchCommentError();
		});
	}

	private async packComments(comments: MiArticleComment[], article: MiPage, viewer: Viewer | null) {
		if (comments.length === 0) return [];
		const replyCounts = await this.db.getRepository(MiArticleComment).createQueryBuilder('comment')
			.select('comment.replyId', 'replyId')
			.addSelect('COUNT(*)', 'count')
			.where('comment.articleId = :articleId', { articleId: article.id })
			.andWhere('comment.replyId IN (:...ids)', { ids: comments.map(comment => comment.id) })
			.groupBy('comment.replyId')
			.getRawMany<{ replyId: string; count: string }>();
		const repliesCount = new Map(replyCounts.map(count => [count.replyId, Number(count.count)]));
		const replyIds = comments.flatMap(comment => comment.replyId ? [comment.replyId] : []);
		const replies = replyIds.length ? await this.db.getRepository(MiArticleComment).findBy({ id: In(replyIds), articleId: article.id }) : [];
		const replyMap = new Map(replies.map(reply => [reply.id, reply]));
		const userIds = [...new Set([...comments, ...replies].map(comment => comment.userId))];
		const users = new Map((await this.userEntityService.packMany(userIds, viewer)).map(user => [user.id, user]));
		const fileIds = [...new Set(comments.flatMap(comment => comment.fileIds))];
		const files = fileIds.length ? await this.db.getRepository(MiDriveFile).findBy({ id: In(fileIds) }) : [];
		const packedFiles = new Map((await this.driveFileEntityService.packMany(files)).map(file => [file.id, file]));
		const moderator = viewer ? await this.roleService.isModerator(viewer) : false;
		return comments.map(comment => {
			const reply = comment.replyId ? replyMap.get(comment.replyId) : undefined;
			return {
				id: comment.id, articleId: comment.articleId, replyId: comment.replyId,
				repliesCount: repliesCount.get(comment.id) ?? 0,
				createdAt: this.idService.parse(comment.id).date.toISOString(),
				user: users.get(comment.userId)!, text: comment.text,
				files: comment.fileIds.flatMap(id => packedFiles.has(id) ? [packedFiles.get(id)!] : []),
				canDelete: !!viewer && (viewer.id === comment.userId || viewer.id === article.userId || moderator),
				replyTo: reply ? { id: reply.id, user: users.get(reply.userId)!, text: reply.text.slice(0, 160) } : null,
			};
		});
	}
}
