/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { FeedbacksRepository, MiUser } from '@/models/_.js';
import { type FeedbackCategory, type FeedbackStatus, type MiFeedback } from '@/models/Feedback.js';
import type { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

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
	) {}

	private async find(feedbackId: string): Promise<MiFeedback> {
		const feedback = await this.feedbacksRepository.findOneBy({ id: feedbackId });
		if (!feedback) throw new FeedbackService.NoSuchFeedbackError();
		return feedback;
	}

	private async packMany(items: MiFeedback[], me?: { id: MiUser['id'] } | null): Promise<Packed<'Feedback'>[]> {
		const users = await this.userEntityService.packMany(items.map(item => item.user ?? item.userId), me);
		const userMap = new Map(users.map(user => [user.id, user]));
		return items.map(item => ({
			id: item.id,
			createdAt: this.idService.parse(item.id).date.toISOString(),
			updatedAt: item.updatedAt.toISOString(),
			title: item.title,
			description: item.description,
			category: item.category,
			status: item.status,
			response: item.response,
			userId: item.userId,
			user: userMap.get(item.userId)!,
		}));
	}

	public async create(input: { title: string; description: string; category: FeedbackCategory }, me: MiUser) {
		const title = input.title.trim();
		const description = input.description.trim();
		if (!title || !description) throw new FeedbackService.InvalidContentError();
		const feedback = await this.feedbacksRepository.insertOne({
			id: this.idService.gen(), updatedAt: new Date(), userId: me.id,
			title, description, category: input.category, status: 'open', response: null,
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

	public async update(feedbackId: string, input: { status?: FeedbackStatus; response?: string | null }, me: MiUser) {
		if (!await this.roleService.isModerator(me)) throw new FeedbackService.AccessDeniedError();
		await this.find(feedbackId);
		const updates: Partial<MiFeedback> = { updatedAt: new Date() };
		if (input.status !== undefined) updates.status = input.status;
		if (input.response !== undefined) updates.response = input.response?.trim() || null;
		await this.feedbacksRepository.update(feedbackId, updates);
		return this.show(feedbackId, me);
	}

	public async delete(feedbackId: string, me: MiUser) {
		const feedback = await this.find(feedbackId);
		if (feedback.userId !== me.id && !await this.roleService.isModerator(me)) throw new FeedbackService.AccessDeniedError();
		await this.feedbacksRepository.delete(feedbackId);
	}
}
