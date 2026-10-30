/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import {
	descriptionSchema,
} from '@/models/User.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { contentTooLongError, isContentTooLong } from '@/misc/content-limits.js';
import { ApiError } from '@/server/api/error.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:account',

	res: {
		type: 'object',
		nullable: false, optional: false,
		ref: 'UserDetailed',
	},

	errors: {
		contentTooLong: { ...contentTooLongError, id: '4047d985-a12a-4ad1-954e-229fa2c176dd' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		description: { ...descriptionSchema, nullable: true },
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userEntityService: UserEntityService,
		private moderationLogService: ModerationLogService,
		private systemAccountService: SystemAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 代理账户简介与普通用户简介同一上限；未修改的旧长文本仍可保留。
			if (ps.description != null) {
				const current = await this.systemAccountService.fetch('proxy');
				const profile = await this.userProfilesRepository.findOneByOrFail({ userId: current.id });
				if (isContentTooLong(ps.description, CONTENT_LIMITS.profileDescription, profile.description)) {
					throw new ApiError(meta.errors.contentTooLong);
				}
			}

			const proxy = await this.systemAccountService.updateCorrespondingUserProfile('proxy', {
				description: ps.description,
			});

			const updated = await this.userEntityService.pack(proxy.id, proxy, {
				schema: 'MeDetailed',
			});

			if (ps.description !== undefined) {
				this.moderationLogService.log(me, 'updateProxyAccountDescription', {
					before: null, //TODO
					after: ps.description,
				});
			}

			return updated;
		});
	}
}
