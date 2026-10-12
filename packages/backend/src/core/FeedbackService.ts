/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { In } from 'typeorm';
import { assertContentLength } from '@/misc/content-limits.js';
import { DI } from '@/di-symbols.js';
import type { FeedbacksRepository, MiUser } from '@/models/_.js';
import { type FeedbackCategory, type FeedbackStatus, MiFeedback } from '@/models/Feedback.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import type { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DriveFileLifecycleService } from '@/core/DriveFileLifecycleService.js';

export type FeedbackListOptions = {
	limit: number;
	offset: number;
	query?: string;
	category?: FeedbackCategory;
	status?: FeedbackStatus;
	mine?: boolean;
	sort: 'latest' | 'updated';
};

@Injectable()
export class FeedbackService {
	public static NoSuchFeedbackError = class extends Error {};
	public static AccessDeniedError = class extends Error {};
	public static SigninRequiredError = class extends Error {};
	public static InvalidContentError = class extends Error {};

	constructor(
		@Inject(DI.feedbacksRepository)
		private feedbacksRepository: FeedbacksRepository,
		private idService: IdService,
		private userEntityService: UserEntityService,
		private roleService: RoleService,
		private driveFileEntityService: DriveFileEntityService,
		private driveFileLifecycleService: DriveFileLifecycleService,
	) {}

	private async find(feedbackId: string): Promise<MiFeedback> {
		const feedback = await this.feedbacksRepository.findOneBy({ id: feedbackId });
		if (!feedback) throw new FeedbackService.NoSuchFeedbackError();
		return feedback;
	}

	private async packMany(items: MiFeedback[], me?: { id: MiUser['id'] } | null): Promise<Packed<'Feedback'>[]> {
		const users = await this.userEntityService.packMany(items.map(item => item.user ?? item.userId), me);
		const userMap = new Map(users.map(user => [user.id, user]));
		const fileIds = [...new Set(items.flatMap(item => [...item.fileIds, ...item.responseFileIds]))];
		const files = fileIds.length ? await this.feedbacksRepository.manager.findBy(MiDriveFile, { id: In(fileIds) }) : [];
		const fileMap = new Map((await this.driveFileEntityService.packMany(files)).map(file => [file.id, file]));
		const packFiles = (ids: string[]) => ids.flatMap(id => fileMap.has(id) ? [fileMap.get(id)!] : []);
		return items.map(item => ({
			id: item.id,
			createdAt: this.idService.parse(item.id).date.toISOString(),
			updatedAt: item.updatedAt.toISOString(),
			title: item.title,
			description: item.description,
			files: packFiles(item.fileIds),
			category: item.category,
			status: item.status,
			response: item.response,
			responseFiles: packFiles(item.responseFileIds),
			userId: item.userId,
			user: userMap.get(item.userId)!,
		}));
	}

	public async create(input: { title: string; description: string; category: FeedbackCategory; fileIds?: string[] }, me: MiUser) {
		assertContentLength(input.title, CONTENT_LIMITS.feedbackTitle);
		assertContentLength(input.description, CONTENT_LIMITS.feedbackText);
		const title = input.title.trim();
		const description = input.description.trim();
		const fileIds = input.fileIds ?? [];
		if (!title || (!description && fileIds.length === 0)) throw new FeedbackService.InvalidContentError();
		const feedback = await this.feedbacksRepository.manager.transaction(async manager => {
			await this.driveFileLifecycleService.validateImages(manager, me.id, fileIds);
			return manager.save(MiFeedback, manager.create(MiFeedback, {
				id: this.idService.gen(), updatedAt: new Date(), userId: me.id,
				title, description, fileIds, category: input.category, status: 'open', response: null, responseFileIds: [],
			}));
		});
		return (await this.packMany([feedback], me))[0];
	}

	public async list(options: FeedbackListOptions, me: MiUser | null) {
		if (options.mine && !me) throw new FeedbackService.SigninRequiredError();
		const query = this.feedbacksRepository.createQueryBuilder('feedback');
		if (options.mine) query.andWhere('feedback.userId = :userId', { userId: me!.id });
		if (options.category) query.andWhere('feedback.category = :category', { category: options.category });
		if (options.query?.trim()) {
			query.andWhere('(feedback.title ILIKE :query OR feedback.description ILIKE :query)', { query: `%${sqlLikeEscape(options.query.trim())}%` });
		}
		const countsQuery = query.clone().select('feedback.status', 'status').addSelect('COUNT(*)', 'count').groupBy('feedback.status');
		if (options.status) query.andWhere('feedback.status = :status', { status: options.status });
		if (options.sort === 'updated') query.orderBy('feedback.updatedAt', 'DESC');
		query.addOrderBy('feedback.id', 'DESC').skip(options.offset).take(options.limit);
		const [[items, total], groups] = await Promise.all([
			query.getManyAndCount(),
			countsQuery.getRawMany<{ status: FeedbackStatus; count: string }>(),
		]);
		const counts = { all: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 };
		for (const group of groups) {
			counts[group.status] = Number(group.count);
			counts.all += Number(group.count);
		}
		return { items: await this.packMany(items, me), total, counts };
	}

	public async show(feedbackId: string, me: MiUser | null) {
		return (await this.packMany([await this.find(feedbackId)], me))[0];
	}

	public async update(feedbackId: string, input: { status?: FeedbackStatus; response?: string | null; responseFileIds?: string[] }, me: MiUser) {
		if (!await this.roleService.isModerator(me)) throw new FeedbackService.AccessDeniedError();
		await this.feedbacksRepository.manager.transaction(async manager => {
			const feedback = await manager.findOne(MiFeedback, { where: { id: feedbackId }, lock: { mode: 'pessimistic_write' } });
			if (!feedback) throw new FeedbackService.NoSuchFeedbackError();
			assertContentLength(input.response, CONTENT_LIMITS.feedbackText, feedback.response);
			const updates: Partial<MiFeedback> = { updatedAt: new Date() };
			if (input.status !== undefined) updates.status = input.status;
			if (input.response !== undefined) updates.response = input.response?.trim() || null;
			if (input.responseFileIds !== undefined) {
				await this.driveFileLifecycleService.validateImages(manager, me.id, input.responseFileIds, feedback.responseFileIds);
				updates.responseFileIds = input.responseFileIds;
			}
			await manager.update(MiFeedback, feedbackId, updates);
		});
		return this.show(feedbackId, me);
	}

	public async delete(feedbackId: string, me: MiUser) {
		const feedback = await this.find(feedbackId);
		if (feedback.userId !== me.id && !await this.roleService.isModerator(me)) throw new FeedbackService.AccessDeniedError();
		await this.feedbacksRepository.delete(feedbackId);
	}
}
