/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { USER_ONLINE_THRESHOLD } from '@/const.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

// 刷新页面或短暂断网后很快重连，等一会儿再判定离线，避免状态闪烁。
const DISCONNECT_GRACE_MS = 1000 * 30;

@Injectable()
export class UserService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,
		private systemWebhookService: SystemWebhookService,
		private globalEventService: GlobalEventService,
		private userEntityService: UserEntityService,
	) {
	}

	// 每个用户一个有序集合，记录各进程中的流式连接；分数为过期时间，进程崩溃时自然失效。
	private presenceKey(userId: MiUser['id']): string {
		return `userPresence:${userId}`;
	}

	@bindThis
	public async connectStream(user: MiUser, connectionId: string): Promise<void> {
		const key = this.presenceKey(user.id);
		const now = Date.now();
		const result = await this.redisClient.multi()
			.zremrangebyscore(key, '-inf', now)
			.zcard(key)
			.zadd(key, now + USER_ONLINE_THRESHOLD, connectionId)
			.pexpire(key, USER_ONLINE_THRESHOLD)
			.exec();
		await this.updateLastActiveDate(user);
		// 从离线变为在线时通知正在查看的人；同一用户的其他标签页不重复通知。
		if (result?.[1]?.[1] === 0) this.globalEventService.publishUserStats(user.id);
	}

	@bindThis
	public async refreshStream(user: MiUser, connectionId: string): Promise<void> {
		const key = this.presenceKey(user.id);
		await this.redisClient.multi()
			.zadd(key, Date.now() + USER_ONLINE_THRESHOLD, connectionId)
			.pexpire(key, USER_ONLINE_THRESHOLD)
			.exec();
		await this.updateLastActiveDate(user);
	}

	@bindThis
	public async disconnectStream(user: MiUser, connectionId: string): Promise<void> {
		await this.redisClient.zrem(this.presenceKey(user.id), connectionId);
		setTimeout(() => {
			this.markOfflineIfDisconnected(user.id).catch(() => {});
		}, DISCONNECT_GRACE_MS).unref();
	}

	private async markOfflineIfDisconnected(userId: MiUser['id']): Promise<void> {
		const key = this.presenceKey(userId);
		const disconnectedAt = new Date();
		await this.redisClient.zremrangebyscore(key, '-inf', disconnectedAt.getTime());
		if (await this.redisClient.zcard(key) > 0) return;
		// 以检查开始时间为界，避免覆盖查询 Redis 期间其他进程刚建立的连接。
		// 隐身用户在他人看来早已离线，保留切换为隐身时记录的离线时间。
		const result = await this.usersRepository.createQueryBuilder().update()
			.set({ lastActiveDate: disconnectedAt, lastDisconnectedAt: disconnectedAt })
			.where('id = :id', { id: userId })
			.andWhere('"onlineStatusOverride" <> \'invisible\'')
			.andWhere('("lastActiveDate" IS NULL OR "lastActiveDate" < :disconnectedAt)', { disconnectedAt })
			.execute();
		if (result.affected) this.globalEventService.publishUserStats(userId);
	}

	@bindThis
	public async updateLastActiveDate(user: MiUser): Promise<void> {
		if (user.isHibernated) {
			const result = await this.usersRepository.createQueryBuilder().update()
				.set({
					lastActiveDate: new Date(),
				})
				.where('id = :id', { id: user.id })
				.returning('*')
				.execute()
				.then((response) => {
					return response.raw[0];
				});
			const wokeUp = result.isHibernated;
			if (wokeUp) {
				this.usersRepository.update(user.id, {
					isHibernated: false,
				});
				this.followingsRepository.update({
					followerId: user.id,
				}, {
					isFollowerHibernated: false,
				});
			}
		} else {
			await this.usersRepository.update(user.id, {
				lastActiveDate: new Date(),
			});
		}
	}

	/**
	 * SystemWebhookを用いてユーザに関する操作内容を管理者各位に通知する.
	 * ここではJobQueueへのエンキューのみを行うため、即時実行されない.
	 *
	 * @see SystemWebhookService.enqueueSystemWebhook
	 */
	@bindThis
	public async notifySystemWebhook(user: MiUser, type: 'userCreated') {
		const packedUser = await this.userEntityService.pack(user, null, { schema: 'UserLite' });
		return this.systemWebhookService.enqueueSystemWebhook(type, packedUser);
	}
}
