/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { NotificationService } from '@/core/NotificationService.js';
import { ACHIEVEMENT_TYPES } from '@/models/UserProfile.js';

@Injectable()
export class AchievementService {
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private notificationService: NotificationService,
	) {
	}

	@bindThis
	public async create(
		userId: MiUser['id'],
		type: typeof ACHIEVEMENT_TYPES[number],
	): Promise<boolean> {
		if (!ACHIEVEMENT_TYPES.includes(type)) return false;

		const date = Date.now();

		// Atomic append prevents concurrent awards from overwriting one another or notifying twice.
		const result = await this.userProfilesRepository.createQueryBuilder().update()
			.set({ achievements: () => '"achievements" || CAST(:achievement AS jsonb)' })
			.where('"userId" = :userId', { userId })
			.andWhere('NOT ("achievements" @> CAST(:match AS jsonb))')
			.setParameters({ achievement: JSON.stringify([{ name: type, unlockedAt: date }]), match: JSON.stringify([{ name: type }]) })
			.execute();
		if (!result.affected) return false;

		this.notificationService.createNotification(userId, 'achievementEarned', {
			achievement: type,
		});
		return true;
	}
}
