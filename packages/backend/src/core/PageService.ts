/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { DataSource, In, Not } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import {
	type NotesRepository,
	MiPage,
	type PagesRepository,
	MiDriveFile,
	type UsersRepository,
	MiNote,
} from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { MiMeta } from '@/models/Meta.js';
import { assertArticleTagsAvailable, getArticleTags, withArticleTags } from '@/misc/article-tags.js';
import { assertContentLength, collectPageText } from '@/misc/content-limits.js';

export interface PageBody {
	title: string;
	name: string;
	summary: string | null;
	articleCategoryId?: string | null;
	articleTags?: string[];
	content: Array<Record<string, any>>;
	variables: Array<Record<string, any>>;
	script: string;
	eyeCatchingImage?: MiDriveFile | null;
	font: 'serif' | 'sans-serif';
	alignCenter: boolean;
	hideTitleWhenPinned: boolean;
}

@Injectable()
export class PageService {
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.pagesRepository)
		private pagesRepository: PagesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private roleService: RoleService,
		private moderationLogService: ModerationLogService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async create(
		me: MiUser,
		body: PageBody,
	): Promise<MiPage> {
		assertContentLength(body.title, CONTENT_LIMITS.articleTitle);
		assertContentLength(body.summary, CONTENT_LIMITS.articleSummary);
		assertContentLength(collectPageText(body.content), CONTENT_LIMITS.articleText);
		await this.pagesRepository.findBy({
			userId: me.id,
			name: body.name,
		}).then(result => {
			if (result.length > 0) {
				throw new IdentifiableError('1a79e38e-3d83-4423-845b-a9d83ff93b61');
			}
		});

		const page = await this.db.transaction(async transaction => {
			await this.validateArticleCategory(transaction, body.articleCategoryId);
			const content = withArticleTags(body.content, body.articleTags);
			await assertArticleTagsAvailable(getArticleTags(content), transaction.getRepository(MiMeta));
			return await transaction.withRepository(this.pagesRepository).insertOne(new MiPage({
				id: this.idService.gen(),
				updatedAt: new Date(),
				title: body.title,
				name: body.name,
				summary: body.summary,
				articleCategoryId: body.articleCategoryId ?? null,
				content,
				variables: body.variables,
				script: body.script,
				eyeCatchingImageId: body.eyeCatchingImage ? body.eyeCatchingImage.id : null,
				userId: me.id,
				visibility: 'public',
				alignCenter: body.alignCenter,
				hideTitleWhenPinned: body.hideTitleWhenPinned,
				font: body.font,
			}));
		});

		const referencedNotes = this.collectReferencedNotes(page.content);
		if (referencedNotes.length > 0) {
			await this.notesRepository.increment({ id: In(referencedNotes) }, 'pageCount', 1);
		}

		return page;
	}

	@bindThis
	public async update(
		me: MiUser,
		pageId: MiPage['id'],
		body: Partial<PageBody>,
	): Promise<void> {
		await this.db.transaction(async (transaction) => {
			// 分类配置和文章始终按同一顺序加锁，避免删除分类时遗留失效关联。
			await this.validateArticleCategory(transaction, body.articleCategoryId);
			const page = await transaction.findOne(MiPage, {
				where: {
					id: pageId,
				},
				lock: { mode: 'for_no_key_update' },
			});

			if (page == null) {
				throw new IdentifiableError('66aefd3c-fdb2-4a71-85ae-cc18bea85d3f');
			}
			if (page.userId !== me.id) {
				throw new IdentifiableError('d0017699-8256-46f1-aed4-bc03bed73616');
			}
			assertContentLength(body.title, CONTENT_LIMITS.articleTitle, page.title);
			assertContentLength(body.summary, CONTENT_LIMITS.articleSummary, page.summary);
			if (body.content !== undefined) {
				assertContentLength(collectPageText(body.content), CONTENT_LIMITS.articleText, collectPageText(page.content));
			}

			if (body.name != null) {
				await transaction.findBy(MiPage, {
					id: Not(pageId),
					userId: me.id,
					name: body.name,
				}).then(result => {
					if (result.length > 0) {
						throw new IdentifiableError('d05bfe24-24b6-4ea2-a3ec-87cc9bf4daa4');
					}
				});
			}

			const content = body.content !== undefined || body.articleTags !== undefined
				? withArticleTags(body.content ?? page.content, body.articleTags, page.content) : undefined;
			if (content !== undefined) {
				await assertArticleTagsAvailable(getArticleTags(content), transaction.getRepository(MiMeta), getArticleTags(page.content));
			}
			await transaction.update(MiPage, page.id, {
				updatedAt: new Date(),
				title: body.title,
				name: body.name,
				summary: body.summary === undefined ? page.summary : body.summary,
				articleCategoryId: body.articleCategoryId,
				content,
				variables: body.variables,
				script: body.script,
				alignCenter: body.alignCenter,
				hideTitleWhenPinned: body.hideTitleWhenPinned,
				font: body.font,
				eyeCatchingImageId: body.eyeCatchingImage === undefined ? undefined : (body.eyeCatchingImage?.id ?? null),
			});

			if (body.content != null) {
				const beforeReferencedNotes = this.collectReferencedNotes(page.content);
				const afterReferencedNotes = this.collectReferencedNotes(body.content);

				const removedNotes = beforeReferencedNotes.filter(noteId => !afterReferencedNotes.includes(noteId));
				const addedNotes = afterReferencedNotes.filter(noteId => !beforeReferencedNotes.includes(noteId));

				if (removedNotes.length > 0) {
					await transaction.decrement(MiNote, { id: In(removedNotes) }, 'pageCount', 1);
				}
				if (addedNotes.length > 0) {
					await transaction.increment(MiNote, { id: In(addedNotes) }, 'pageCount', 1);
				}
			}
		});
	}

	@bindThis
	public async delete(me: MiUser, pageId: MiPage['id']): Promise<void> {
		// 文件引用尚未完整登记，删除内容时保留上传，避免破坏未登记的复用。
		await this.db.transaction(async (transaction) => {
			const page = await transaction.findOne(MiPage, {
				where: {
					id: pageId,
				},
				lock: { mode: 'pessimistic_write' }, // same lock level as DELETE
			});

			if (page == null) {
				throw new IdentifiableError('66aefd3c-fdb2-4a71-85ae-cc18bea85d3f');
			}

			if (!await this.roleService.isModerator(me) && page.userId !== me.id) {
				throw new IdentifiableError('d0017699-8256-46f1-aed4-bc03bed73616');
			}

			await transaction.delete(MiPage, page.id);

			if (page.userId !== me.id) {
				const user = await this.usersRepository.findOneByOrFail({ id: page.userId });
				this.moderationLogService.log(me, 'deletePage', {
					pageId: page.id,
					pageUserId: page.userId,
					pageUserUsername: user.username,
					page,
				});
			}

			const referencedNotes = this.collectReferencedNotes(page.content);
			if (referencedNotes.length > 0) {
				await transaction.decrement(MiNote, { id: In(referencedNotes) }, 'pageCount', 1);
			}
		});
	}

	private async validateArticleCategory(transaction: EntityManager, categoryId: string | null | undefined): Promise<void> {
		if (categoryId == null) return;

		const meta = await transaction.findOne(MiMeta, {
			where: {},
			order: { id: 'DESC' },
			lock: { mode: 'pessimistic_read' },
		});
		if (!meta?.articleCategories.some(category => category.id === categoryId)) {
			throw new IdentifiableError('8500efe3-a63d-402d-889d-52845f6a2b55');
		}
	}

	collectReferencedNotes(content: MiPage['content']): string[] {
		const referencingNotes = new Set<string>();
		const recursiveCollect = (content: unknown[]) => {
			for (const contentElement of content) {
				if (typeof contentElement === 'object'
					&& contentElement !== null
					&& 'type' in contentElement) {
					if (contentElement.type === 'note'
						&& 'note' in contentElement
						&& typeof contentElement.note === 'string') {
						referencingNotes.add(contentElement.note);
					}
					if (contentElement.type === 'section'
						&& 'children' in contentElement
						&& Array.isArray(contentElement.children)) {
						recursiveCollect(contentElement.children);
					}
				}
			}
		};
		recursiveCollect(content);
		return [...referencingNotes];
	}
}
