/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isDeepStrictEqual } from 'node:util';
import { CONTENT_LIMITS } from 'misskey-js';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { IsNull, Not } from 'typeorm';
import type { OnModuleInit } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiArticleDraft } from '@/models/ArticleDraft.js';
import type { ArticleDraftData } from '@/models/ArticleDraft.js';
import { MiPage } from '@/models/Page.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { isArticle } from '@/misc/article-access.js';
import { assertArticleTagsAvailable, getArticleTags, normalizeArticleTags } from '@/misc/article-tags.js';
import { MiMeta } from '@/models/Meta.js';
import { assertContentLength } from '@/misc/content-limits.js';
import type { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';

export type ArticleDraftInput = Omit<ArticleDraftData, 'fileIds'>;

@Injectable()
export class ArticleDraftService implements OnModuleInit {
	public static NotFoundError = class extends Error {};
	public static ConflictError = class extends Error {};
	public static LimitError = class extends Error {};
	public static InvalidContentError = class extends Error {};
	public static InvalidArticleError = class extends Error {};
	public static InvalidCoverError = class extends Error {};
	public static FileUnavailableError = class extends Error {};
	private driveFileEntityService: DriveFileEntityService;

	constructor(
		@Inject(DI.db) private db: DataSource,
		private moduleRef: ModuleRef,
	) {}

	onModuleInit() {
		this.driveFileEntityService = this.moduleRef.get('DriveFileEntityService');
	}

	public async save(userId: string, draftId: string, expectedRevision: number, input: ArticleDraftInput) {
		const data: ArticleDraftData = {
			title: input.title, summary: input.summary, text: input.text, name: input.name,
			articleCategoryId: input.articleCategoryId, articleTags: normalizeArticleTags(input.articleTags),
			articleId: input.articleId, coverId: input.coverId, fileIds: input.coverId ? [input.coverId] : [],
		};
		if ([data.title, data.summary, data.text, ...data.articleTags].some(value => value.includes('\u0000'))) throw new ArticleDraftService.InvalidContentError();
		if (!data.coverId && ![data.title, data.summary, data.text].some(value => value.replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu, '').length > 0)) {
			throw new ArticleDraftService.InvalidContentError();
		}
		try {
			return await this.db.transaction(async manager => {
				// 同账号串行检查数量和版本，首次写入也不会产生重复稿或突破上限。
				await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`article-drafts:${userId}`]);
				let article: MiPage | null = null;
				if (data.articleId) {
					article = await manager.findOneBy(MiPage, { id: data.articleId, userId });
					if (!article || !isArticle(article)) throw new ArticleDraftService.InvalidArticleError();
					data.name = article.name;
				}
				const existing = await manager.findOneBy(MiArticleDraft, { userId, draftId });
				if (existing) {
					if (existing.data == null) throw new ArticleDraftService.ConflictError();
					if (existing.revision !== expectedRevision) {
						// 仅接受紧邻版本的相同请求重试，不能覆盖另一设备的新内容。
						if (existing.revision === expectedRevision + 1 && isDeepStrictEqual(existing.data, data)) return existing;
						throw new ArticleDraftService.ConflictError();
					}
					if (isDeepStrictEqual(existing.data, data)) return existing;
				} else {
					if (expectedRevision !== 0) throw new ArticleDraftService.ConflictError();
					if (await manager.countBy(MiArticleDraft, { userId, data: Not(IsNull()) }) >= 100) throw new ArticleDraftService.LimitError();
				}
				assertContentLength(data.title, CONTENT_LIMITS.articleTitle, existing?.data?.title ?? article?.title);
				assertContentLength(data.summary, CONTENT_LIMITS.articleSummary, existing?.data?.summary ?? article?.summary);
				assertContentLength(data.text, CONTENT_LIMITS.articleText, existing?.data?.text ?? article?.content[0].text);
				await assertArticleTagsAvailable(data.articleTags, manager.getRepository(MiMeta), [
					...(existing?.data?.articleTags ?? []), ...(article ? getArticleTags(article.content) : []),
				]);
				if (data.coverId) {
					const cover = await manager.findOneBy(MiDriveFile, { id: data.coverId, userId });
					if (!cover || cover.deletingAt || !cover.type.startsWith('image/') || cover.isSensitive) throw new ArticleDraftService.InvalidCoverError();
				}
				const draft = manager.create(MiArticleDraft, { userId, draftId, data, revision: expectedRevision + 1, updatedAt: new Date() });
				await manager.save(draft);
				return draft;
			});
		} catch (error) {
			if (error != null && typeof error === 'object' && 'constraint' in error && error.constraint === 'CHK_drive_file_reference_available') {
				throw new ArticleDraftService.FileUnavailableError();
			}
			throw error;
		}
	}

	public async list(userId: string, limit: number, untilId?: string) {
		const query = this.db.getRepository(MiArticleDraft).createQueryBuilder('draft')
			.where('draft.userId = :userId', { userId }).andWhere('draft.data IS NOT NULL')
			.orderBy('draft.updatedAt', 'DESC').addOrderBy('draft.draftId', 'DESC').take(limit);
		if (untilId) {
			const cursor = await this.db.getRepository(MiArticleDraft).findOneBy({ userId, draftId: untilId });
			if (!cursor) return [];
			query.andWhere('(draft.updatedAt < :updatedAt OR (draft.updatedAt = :updatedAt AND draft.draftId < :draftId))', { updatedAt: cursor.updatedAt, draftId: cursor.draftId });
		}
		return query.getMany();
	}

	public async show(userId: string, draftId: string) {
		const draft = await this.db.getRepository(MiArticleDraft).findOneBy({ userId, draftId, data: Not(IsNull()) });
		if (!draft) throw new ArticleDraftService.NotFoundError();
		return draft;
	}

	public async delete(userId: string, draftId: string, expectedRevision: number) {
		await this.db.transaction(async manager => {
			await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`article-drafts:${userId}`]);
			const existing = await manager.findOneBy(MiArticleDraft, { userId, draftId });
			if (!existing) return;
			if (existing.data == null && existing.revision === expectedRevision + 1) return;
			if (existing.revision !== expectedRevision) throw new ArticleDraftService.ConflictError();
			await manager.update(MiArticleDraft, { userId, draftId }, { data: null, revision: expectedRevision + 1, updatedAt: new Date() });
		});
	}

	public async pack(draft: MiArticleDraft) {
		if (!draft.data) throw new ArticleDraftService.NotFoundError();
		const { fileIds: _fileIds, coverId, ...content } = draft.data;
		const cover = coverId ? await this.db.getRepository(MiDriveFile).findOneBy({ id: coverId, userId: draft.userId }) : null;
		return { id: draft.draftId, revision: draft.revision, updatedAt: draft.updatedAt.toISOString(), ...content, cover: cover ? await this.driveFileEntityService.pack(cover) : null };
	}
}
